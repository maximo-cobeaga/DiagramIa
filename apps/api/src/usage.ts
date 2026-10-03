import {existsSync,mkdirSync,readFileSync,renameSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import type {Pricing} from '@diagramia/providers';

export type SpendAlert={event:'alert';kind:'ai_spend';period:'day'|'month';key:string;usd:number;budget:number;ratio:number};
export type UsageConfig={dailyTokenBudget:number;dailyUsdBudget:number;requestsPerMinute:number;ledgerPath:string|null;
  /** Tope de gasto estimado del mes (UTC). Sin valor, sólo rige el diario. */
  monthlyUsdBudget?:number;
  /** Fracción del tope que dispara una alerta, una vez por período (0.8 por defecto). */
  alertRatio?:number;onAlert?:(alert:SpendAlert)=>void};
export type UsageErrorCode='RATE_LIMITED'|'BUDGET_EXCEEDED'|'IN_PROGRESS'|'IDEMPOTENCY_CONFLICT';
export class UsageError extends Error{constructor(public code:UsageErrorCode,message:string){super(message);this.name='UsageError';}}
export type UsageEvent={requestId:string;at:string;provider:string;model:string;status:'completed'|'failed'|'cancelled';
  /** false para modelos locales y la demostración: se registran, pero no descuentan del presupuesto, que existe para limitar gasto. */
  billable:boolean;inputTokens:number;outputTokens:number;costUsd:number|null;calls:number};
type Entry={signature:string;status:'running'|'done';reserved:number;reservedUsd:number;response?:unknown};

const today=(now:number)=>new Date(now).toISOString().slice(0,10),thisMonth=(now:number)=>new Date(now).toISOString().slice(0,7);
/** Costo estimado con la tarifa publicada. `cachedInputTokens` es parte de `inputTokens` y se cobra con su tarifa de caché. */
export const costOf=(pricing:Pricing,inputTokens:number,outputTokens:number,cachedInputTokens=0)=>pricing
  ?((inputTokens-cachedInputTokens)*pricing.inputPerMTok+cachedInputTokens*(pricing.cachedInputPerMTok??pricing.inputPerMTok)+outputTokens*pricing.outputPerMTok)/1_000_000:null;

/**
 * Presupuesto diario, límite de frecuencia e idempotencia del gateway. El presupuesto se reserva ANTES de llamar
 * al proveedor y se liquida con el consumo real; si no alcanza, el pedido se corta sin gastar.
 * Los totales del día sobreviven a un reinicio; los resultados para reintentos idénticos viven en memoria.
 */
export class UsageLedger{
  private day:string;private tokens=0;private usd=0;private reserved=0;private reservedUsd=0;private hits:number[]=[];
  private month:string;private monthUsd=0;private alerted={day:false,month:false};
  private entries=new Map<string,Entry>();private events:UsageEvent[]=[];
  constructor(private config:UsageConfig,private now:()=>number=Date.now){
    this.day=today(now());this.month=thisMonth(now());
    if(config.ledgerPath&&existsSync(config.ledgerPath)){
      try{
        const saved=JSON.parse(readFileSync(config.ledgerPath,'utf8'));
        if(saved.day===this.day){this.tokens=Number(saved.tokens)||0;this.usd=Number(saved.usd)||0;this.events=Array.isArray(saved.events)?saved.events:[];this.alerted.day=saved.alerted?.day===true;}
        if(saved.month===this.month){this.monthUsd=Number(saved.monthUsd)||0;this.alerted.month=saved.alerted?.month===true;}
      }catch{/* Un ledger ilegible no debe impedir arrancar: se empieza el día en cero y se reescribe. */}
    }
  }
  private roll(){
    const now=this.now(),day=today(now),month=thisMonth(now);
    if(day!==this.day){this.day=day;this.tokens=0;this.usd=0;this.events=[];this.alerted.day=false;}
    if(month!==this.month){this.month=month;this.monthUsd=0;this.alerted.month=false;}
  }
  private persist(){
    const path=this.config.ledgerPath;if(!path)return;
    mkdirSync(dirname(path),{recursive:true});
    writeFileSync(path+'.tmp',JSON.stringify({day:this.day,tokens:this.tokens,usd:this.usd,month:this.month,monthUsd:this.monthUsd,alerted:this.alerted,events:this.events.slice(-200)},null,2));renameSync(path+'.tmp',path);
  }
  /** El gasto en curso cuenta como reservado: dos pedidos simultáneos no pueden pasar juntos el tope. */
  private ensureBudget(extra:number,extraUsd=0){
    if(this.tokens+this.reserved+extra>this.config.dailyTokenBudget)throw new UsageError('BUDGET_EXCEEDED',`Se alcanzó el presupuesto diario de ${this.config.dailyTokenBudget.toLocaleString('es')} tokens. No se llamó al proveedor. Se renueva mañana (UTC) o podés ampliarlo en la configuración del gateway.`);
    if(this.usd>=this.config.dailyUsdBudget||this.usd+this.reservedUsd+extraUsd>this.config.dailyUsdBudget)throw new UsageError('BUDGET_EXCEEDED',`Se alcanzó el presupuesto diario de USD ${this.config.dailyUsdBudget.toFixed(2)} (estimado). No se llamó al proveedor.`);
    const monthly=this.config.monthlyUsdBudget;
    if(monthly!==undefined&&(this.monthUsd>=monthly||this.monthUsd+this.reservedUsd+extraUsd>monthly))throw new UsageError('BUDGET_EXCEEDED',`Se alcanzó el presupuesto mensual de IA de USD ${monthly.toFixed(2)} (estimado). La IA incluida queda pausada hasta el mes próximo. No se llamó al proveedor.`);
  }
  /** Devuelve la respuesta guardada si este requestId ya terminó con el mismo contenido; si no, reserva presupuesto. */
  begin(requestId:string,signature:string,estimatedTokens:number,estimatedUsd=0):{replay:unknown}|null{
    this.roll();
    const prior=this.entries.get(requestId);
    if(prior){
      if(prior.signature!==signature)throw new UsageError('IDEMPOTENCY_CONFLICT','Ese requestId ya se usó con otro pedido.');
      if(prior.status==='running')throw new UsageError('IN_PROGRESS','Ese pedido todavía se está procesando.');
      return {replay:prior.response};
    }
    const now=this.now();this.hits=this.hits.filter(at=>now-at<60_000);
    if(this.hits.length>=this.config.requestsPerMinute)throw new UsageError('RATE_LIMITED',`Demasiados pedidos: el máximo es ${this.config.requestsPerMinute} por minuto.`);
    this.ensureBudget(estimatedTokens,estimatedUsd);
    this.hits.push(now);this.reserved+=estimatedTokens;this.reservedUsd+=estimatedUsd;
    this.entries.set(requestId,{signature,status:'running',reserved:estimatedTokens,reservedUsd:estimatedUsd});
    return null;
  }
  /** Cada llamada adicional (reparación) vuelve a pasar por el presupuesto antes de salir. */
  reserveMore(requestId:string,estimatedTokens:number,estimatedUsd=0){
    this.roll();this.ensureBudget(estimatedTokens,estimatedUsd);
    const entry=this.entries.get(requestId);if(entry){entry.reserved+=estimatedTokens;this.reserved+=estimatedTokens;entry.reservedUsd+=estimatedUsd;this.reservedUsd+=estimatedUsd;}
  }
  settle(event:Omit<UsageEvent,'at'>,response?:unknown){
    this.roll();
    const entry=this.entries.get(event.requestId);
    if(entry){
      this.reserved=Math.max(0,this.reserved-entry.reserved);this.reservedUsd=Math.max(0,this.reservedUsd-entry.reservedUsd);
      // Sólo un pedido completado se recuerda: uno fallido o cancelado puede reintentarse con el mismo ID.
      if(event.status==='completed'){entry.status='done';entry.response=response;entry.reserved=0;entry.reservedUsd=0;}else this.entries.delete(event.requestId);
    }
    if(event.billable){this.tokens+=event.inputTokens+event.outputTokens;this.usd+=event.costUsd??0;this.monthUsd+=event.costUsd??0;this.checkAlerts();}
    this.events.push({...event,at:new Date(this.now()).toISOString()});
    if(this.entries.size>200)for(const key of this.entries.keys()){if(this.entries.size<=200)break;if(this.entries.get(key)!.status==='done')this.entries.delete(key);}
    this.persist();
  }
  /** Avisa una vez por período al cruzar la fracción configurada del tope. El corte llega después, al tope. */
  private checkAlerts(){
    const ratio=this.config.alertRatio??0.8;
    const periods:[('day'|'month'),string,number,number|undefined][]=[['day',this.day,this.usd,this.config.dailyUsdBudget],['month',this.month,this.monthUsd,this.config.monthlyUsdBudget]];
    for(const [period,key,usd,budget] of periods){
      if(!budget||this.alerted[period]||usd<budget*ratio)continue;
      this.alerted[period]=true;
      this.config.onAlert?.({event:'alert',kind:'ai_spend',period,key,usd:Number(usd.toFixed(6)),budget,ratio:Number((usd/budget).toFixed(3))});
    }
  }
  summary(){
    this.roll();
    return {day:this.day,tokens:this.tokens,reservedTokens:this.reserved,dailyTokenBudget:this.config.dailyTokenBudget,estimatedUsd:Number(this.usd.toFixed(6)),dailyUsdBudget:this.config.dailyUsdBudget,
      month:this.month,monthlyEstimatedUsd:Number(this.monthUsd.toFixed(6)),monthlyUsdBudget:this.config.monthlyUsdBudget??null,requestsPerMinute:this.config.requestsPerMinute,recent:this.events.slice(-20)};
  }
}
