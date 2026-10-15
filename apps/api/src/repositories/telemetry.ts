import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {ServerEventSchema,type ServerEvent,type TelemetryBatch} from '@diagramia/core';

/** Un reloj de cliente desfasado más de un día no se cree: el evento queda con la hora de recepción. */
const MAX_CLOCK_SKEW_MS=86_400_000;

/**
 * Telemetría propia en PostgreSQL (ADR 046). Los lotes ya llegan validados contra el contrato del core.
 * Insertar es idempotente por ID de evento: un reintento del navegador no duplica nada.
 */
export class TelemetryRepository{
  constructor(private readonly pool:Pool,private readonly now:()=>Date=()=>new Date()){}

  async ingest(batch:TelemetryBatch,userId:string|null):Promise<{accepted:number}>{
    const received=this.now(),values:unknown[]=[],rows:string[]=[];
    for(const event of batch.events){
      const at=new Date(event.at),occurred=Math.abs(at.getTime()-received.getTime())>MAX_CLOCK_SKEW_MS?received:at;
      const base=values.length;
      values.push(event.id,event.name,batch.anonymousId,batch.sessionId,userId,occurred,received,JSON.stringify(event.props),JSON.stringify(batch.context));
      rows.push(`($${base+1},'client',$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8}::jsonb,$${base+9}::jsonb)`);
    }
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN');
      const inserted=await client.query(`INSERT INTO telemetry_events (id,origin,name,anonymous_id,session_id,user_id,occurred_at,received_at,props,context)
        VALUES ${rows.join(',')} ON CONFLICT (id) DO NOTHING`,values);
      if(userId)await client.query('INSERT INTO telemetry_identities (anonymous_id,user_id) VALUES ($1,$2) ON CONFLICT (anonymous_id) DO NOTHING',[batch.anonymousId,userId]);
      await client.query('COMMIT');
      return {accepted:inserted.rowCount??0};
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }

  /** Evento del servidor (pedido de IA, alta de cuenta). Se valida aquí también: es la última barrera antes de la base. */
  async record(event:ServerEvent,userId:string|null):Promise<void>{
    const parsed=ServerEventSchema.parse(event);
    await this.pool.query(`INSERT INTO telemetry_events (id,origin,name,user_id,occurred_at,props) VALUES ($1,'server',$2,$3,$4,$5::jsonb)`,
      [randomUUID(),parsed.name,userId,this.now(),JSON.stringify(parsed.props)]);
  }

  /**
   * Retención (ADR 109): los eventos de más de 13 meses se borran, y con ellos el vínculo navegador → cuenta que ya no
   * tiene eventos. Los agregados diarios (`telemetry_daily`) quedan: son conteos sin identificadores.
   */
  async purgeOlderThan(months=RETENTION_MONTHS):Promise<{events:number;identities:number}>{
    const cutoff=monthsBefore(this.now(),months);
    const events=await this.pool.query('DELETE FROM telemetry_events WHERE occurred_at<$1',[cutoff]);
    const identities=await this.pool.query(`DELETE FROM telemetry_identities i WHERE linked_at<$1
      AND NOT EXISTS (SELECT 1 FROM telemetry_events e WHERE e.anonymous_id=i.anonymous_id)`,[cutoff]);
    return {events:events.rowCount??0,identities:identities.rowCount??0};
  }
}

/** Plazo de retención de datos de uso y consultas comerciales, el que publica el aviso de privacidad. */
export const RETENTION_MONTHS=13;
export const monthsBefore=(at:Date,months:number)=>{const date=new Date(at);date.setUTCMonth(date.getUTCMonth()-months);return date;};

/** Límite de pedidos por clave (IP) en una ventana deslizante, en memoria del proceso. */
export class RateLimiter{
  private hits=new Map<string,number[]>();private prunedAt=0;
  constructor(private readonly limit:number,private readonly windowMs:number,private readonly now:()=>number=Date.now){}
  retryAfterSeconds(key:string):number{
    const now=this.now(),recent=(this.hits.get(key)??[]).filter(at=>now-at<this.windowMs);
    return recent.length>=this.limit?Math.max(1,Math.ceil((recent[0]!+this.windowMs-now)/1000)):0;
  }
  allow(key:string):boolean{
    const now=this.now(),recent=(this.hits.get(key)??[]).filter(at=>now-at<this.windowMs);
    if(recent.length>=this.limit){this.hits.set(key,recent);return false;}
    recent.push(now);this.hits.set(key,recent);
    // Poda ocasional para que claves viejas no crezcan sin límite. A lo sumo una cada 5 s: con muchas claves vigentes,
    // recorrer el mapa en cada pedido convertiría una ráfaga en un costo por pedido proporcional a la cantidad de clientes.
    if(this.hits.size>10_000&&now-this.prunedAt>=5_000){this.prunedAt=now;for(const [k,list] of this.hits)if(!list.some(at=>now-at<this.windowMs))this.hits.delete(k);}
    return true;
  }
}
