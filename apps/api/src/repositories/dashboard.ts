import type {Pool} from 'pg';

/** Métricas sumables de un día UTC. Cada una es un conteo o un monto; los cocientes se calculan al mostrar. */
export const DAILY_METRICS=['active','landing_visitors','landing_to_canvas','canvas_visitors','new_canvas_visitors','first_element','signups','useful_diagrams',
  'ai_requests','ai_proposals','ai_failed','ai_blocked','ai_cost_usd','ai_applied','ai_discarded','ai_regenerated','ai_undo_after','feedback_up','feedback_down','js_errors','api_errors'] as const;
export type DailyMetrics=Record<typeof DAILY_METRICS[number],number>;
export type Indicator={id:string;label:string;unit:'ratio'|'minutes'|'number'|'usd';value:number|null;previous:number|null;detail:string};

const DAILY_SQL=`SELECT
  count(DISTINCT actor) FILTER (WHERE origin='client') AS active,
  count(DISTINCT anonymous_id) FILTER (WHERE name='landing_view') AS landing_visitors,
  count(DISTINCT anonymous_id) FILTER (WHERE name='board_opened' AND (props->>'fromLanding')::boolean) AS landing_to_canvas,
  count(DISTINCT actor) FILTER (WHERE name='board_opened') AS canvas_visitors,
  count(DISTINCT actor) FILTER (WHERE name='board_opened' AND NOT (props->>'returning')::boolean) AS new_canvas_visitors,
  count(*) FILTER (WHERE name='first_element_created') AS first_element,
  count(*) FILTER (WHERE name='signup_completed') AS signups,
  count(*) FILTER (WHERE name='useful_diagram_created') AS useful_diagrams,
  count(*) FILTER (WHERE name='ai_request' AND props->>'outcome' NOT IN ('blocked','refused_by_plan') AND NOT (props->>'replayed')::boolean) AS ai_requests,
  count(*) FILTER (WHERE name='ai_request' AND props->>'outcome'='proposal' AND NOT (props->>'replayed')::boolean) AS ai_proposals,
  count(*) FILTER (WHERE name='ai_request' AND props->>'outcome'='failed') AS ai_failed,
  count(*) FILTER (WHERE name='ai_request' AND props->>'outcome' IN ('blocked','refused_by_plan')) AS ai_blocked,
  coalesce(sum((props->>'costUsd')::numeric) FILTER (WHERE name='ai_request'),0) AS ai_cost_usd,
  count(*) FILTER (WHERE name='ai_proposal_applied') AS ai_applied,
  count(*) FILTER (WHERE name='ai_proposal_discarded') AS ai_discarded,
  count(*) FILTER (WHERE name='ai_regenerated') AS ai_regenerated,
  count(*) FILTER (WHERE name='ai_undo_after_apply') AS ai_undo_after,
  count(*) FILTER (WHERE name='ai_feedback' AND props->>'rating'='up') AS feedback_up,
  count(*) FILTER (WHERE name='ai_feedback' AND props->>'rating'='down') AS feedback_down,
  count(*) FILTER (WHERE name='js_error') AS js_errors,
  count(*) FILTER (WHERE name='api_error') AS api_errors
FROM telemetry_facts WHERE day=$1::date`;

const iso=(date:Date)=>date.toISOString().slice(0,10);
const addDays=(day:string,n:number)=>iso(new Date(Date.parse(day+'T00:00:00Z')+n*86_400_000));
const ratio=(n:number,d:number)=>d>0?n/d:null;

/**
 * Dashboard del fundador (P7.3): los 10 indicadores iniciales de DIAGRAMIA_SESION_PRODUCTO_NEGOCIO.md, en una
 * ventana de 7 días contra los 7 anteriores. Un cociente sin denominador es null («sin datos»), nunca 0 %.
 */
export class FounderDashboard{
  constructor(private readonly pool:Pool,private readonly now:()=>Date=()=>new Date()){}

  /** Recalcula un día. Es idempotente: se puede repetir sin duplicar nada. */
  async aggregateDay(day:string):Promise<DailyMetrics>{
    const row=(await this.pool.query<Record<string,string>>(DAILY_SQL,[day])).rows[0]!;
    const metrics=Object.fromEntries(DAILY_METRICS.map(key=>[key,Number(row[key]??0)])) as DailyMetrics;
    await this.pool.query(`INSERT INTO telemetry_daily (day,metrics,computed_at) VALUES ($1,$2::jsonb,now())
      ON CONFLICT (day) DO UPDATE SET metrics=EXCLUDED.metrics,computed_at=now()`,[day,JSON.stringify(metrics)]);
    return metrics;
  }

  /** Agregados de los días pedidos: los dos últimos se recalculan siempre (pueden seguir recibiendo eventos), el resto sólo si faltan. */
  async daily(from:string,to:string):Promise<{day:string;metrics:DailyMetrics}[]>{
    const stored=new Map((await this.pool.query<{day:string;metrics:DailyMetrics}>(`SELECT to_char(day,'YYYY-MM-DD') AS day,metrics FROM telemetry_daily WHERE day BETWEEN $1 AND $2`,[from,to])).rows.map(r=>[r.day,r.metrics]));
    const fresh=addDays(iso(this.now()),-1),result=[];
    for(let day=from;day<=to;day=addDays(day,1))result.push({day,metrics:day>=fresh||!stored.has(day)?await this.aggregateDay(day):stored.get(day)!});
    return result;
  }

  private async windowStats(from:string,to:string){
    const next=addDays(to,1);
    const base=(await this.pool.query<Record<string,string>>(`SELECT
        count(DISTINCT actor) FILTER (WHERE origin='client') AS active,
        count(DISTINCT actor) FILTER (WHERE name='useful_diagram_created') AS useful_actors,
        count(DISTINCT actor) FILTER (WHERE name='ai_request' AND props->>'outcome' NOT IN ('blocked','refused_by_plan')) AS ai_actors
      FROM telemetry_facts WHERE day>=$1::date AND day<$2::date`,[from,next])).rows[0]!;
    // Time To First Value: de la primera apertura del canvas al primer diagrama útil, para quienes abrieron por primera vez en la ventana.
    const ttfv=(await this.pool.query<{median:string|null;n:string}>(`WITH opened AS (
        SELECT actor,min(occurred_at) AS at FROM telemetry_facts WHERE name='board_opened' GROUP BY actor HAVING min(day)>=$1::date AND min(day)<$2::date),
      useful AS (SELECT actor,min(occurred_at) AS at FROM telemetry_facts WHERE name='useful_diagram_created' GROUP BY actor)
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM u.at-o.at)/60) AS median,count(*) AS n
      FROM opened o JOIN useful u USING (actor) WHERE u.at>=o.at`,[from,next])).rows[0]!;
    // D7 clásico: de quienes llegaron por primera vez entre 13 y 7 días antes del cierre, cuántos volvieron exactamente el día 7.
    const d7=(await this.pool.query<{cohort:string;retained:string}>(`WITH firsts AS (
        SELECT actor,min(day) AS first_day FROM telemetry_facts WHERE origin='client' GROUP BY actor)
      SELECT count(*) AS cohort,count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM telemetry_facts f WHERE f.actor=firsts.actor AND f.origin='client' AND f.day=firsts.first_day+7)) AS retained
      FROM firsts WHERE first_day BETWEEN $1::date AND $2::date`,[addDays(to,-13),addDays(to,-7)])).rows[0]!;
    return {active:Number(base.active),usefulActors:Number(base.useful_actors),aiActors:Number(base.ai_actors),
      ttfvMinutes:ttfv.median===null?null:Number(ttfv.median),ttfvSample:Number(ttfv.n),d7Cohort:Number(d7.cohort),d7Retained:Number(d7.retained)};
  }

  /** Ventana de 7 días que termina en `to` (UTC, por defecto hoy) contra los 7 anteriores, más los 28 días de agregados. */
  async report(to=iso(this.now())){
    const days=await this.daily(addDays(to,-27),to);
    const sum=(from:string,until:string)=>{
      const total=Object.fromEntries(DAILY_METRICS.map(key=>[key,0])) as DailyMetrics;
      for(const {day,metrics} of days)if(day>=from&&day<=until)for(const key of DAILY_METRICS)total[key]+=Number(metrics[key]??0);
      return total;
    };
    const currentFrom=addDays(to,-6),previousTo=addDays(to,-7),previousFrom=addDays(to,-13);
    const [now,before]=[sum(currentFrom,to),sum(previousFrom,previousTo)];
    const [w,p]=await Promise.all([this.windowStats(currentFrom,to),this.windowStats(previousFrom,previousTo)]);
    const pair=(f:(s:DailyMetrics,x:typeof w)=>number|null)=>({value:f(now,w),previous:f(before,p)});
    const indicators:Indicator[]=[
      {id:'north_star',label:'Diagramas útiles por usuario activo (North Star)',unit:'number',...pair((s,x)=>ratio(s.useful_diagrams,x.active)),detail:'Diagramas útiles de la semana ÷ usuarios activos semanales (WAU).'},
      {id:'landing_to_canvas',label:'Visitante → canvas',unit:'ratio',...pair(s=>ratio(s.landing_to_canvas,s.landing_visitors)),detail:'Visitantes de la landing que abrieron el canvas desde «Crear diagrama».'},
      {id:'canvas_to_first_element',label:'Canvas → primer elemento',unit:'ratio',...pair(s=>ratio(s.first_element,s.new_canvas_visitors)),detail:'Navegadores nuevos que crearon su primer elemento.'},
      {id:'signup_conversion',label:'Conversión a registro',unit:'ratio',...pair(s=>ratio(s.signups,s.new_canvas_visitors)),detail:'Cuentas nuevas ÷ navegadores nuevos que abrieron el canvas.'},
      {id:'ttfv',label:'Time To First Value (mediana)',unit:'minutes',...pair((_s,x)=>x.ttfvMinutes),detail:'De la primera apertura al primer diagrama útil (2+ nodos y 1 conexión exportado, guardado o reabierto).'},
      {id:'first_useful',label:'Llegan a un diagrama útil',unit:'ratio',...pair((_s,x)=>ratio(x.usefulActors,x.active)),detail:'Usuarios activos que tuvieron al menos un diagrama útil en la semana.'},
      {id:'ai_adoption',label:'Adopción de IA',unit:'ratio',...pair((_s,x)=>ratio(x.aiActors,x.active)),detail:'Usuarios activos que hicieron al menos un pedido de IA.'},
      {id:'ai_acceptance',label:'AI Acceptance Rate',unit:'ratio',...pair(s=>ratio(s.ai_applied,s.ai_proposals)),detail:'Propuestas aplicadas ÷ propuestas generadas.'},
      {id:'d7_retention',label:'Retención D7',unit:'ratio',...pair((_s,x)=>ratio(x.d7Retained,x.d7Cohort)),detail:'Quienes volvieron el día 7 después de su primera visita.'},
      {id:'negative_feedback',label:'Feedback negativo de IA',unit:'ratio',...pair(s=>ratio(s.feedback_down,s.feedback_up+s.feedback_down)),detail:'👎 ÷ respuestas de feedback. La fricción también se ve en errores por usuario activo.'}
    ];
    return {to,window:{from:currentFrom,to},previous:{from:previousFrom,to:previousTo},wau:w.active,previousWau:p.active,
      samples:{ttfv:w.ttfvSample,d7Cohort:w.d7Cohort},
      cost:{aiUsd:now.ai_cost_usd,previousAiUsd:before.ai_cost_usd,perActiveUser:ratio(now.ai_cost_usd,w.active),aiRequests:now.ai_requests,blocked:now.ai_blocked,failed:now.ai_failed},
      friction:{jsErrorsPerActive:ratio(now.js_errors,w.active),apiErrors:now.api_errors,aiUndoAfterApply:ratio(now.ai_undo_after,now.ai_applied),aiRegenerations:ratio(now.ai_regenerated,now.ai_proposals)},
      indicators,days};
  }
}
