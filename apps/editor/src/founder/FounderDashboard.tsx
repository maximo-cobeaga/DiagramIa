import {useEffect,useState} from 'react';

type Unit='ratio'|'minutes'|'number'|'usd';
type Indicator={id:string;label:string;unit:Unit;value:number|null;previous:number|null;detail:string};
type Day={day:string;metrics:Record<string,number>};
type Report={to:string;window:{from:string;to:string};wau:number;previousWau:number;samples:{ttfv:number;d7Cohort:number};
  cost:{aiUsd:number;previousAiUsd:number;perActiveUser:number|null;aiRequests:number;blocked:number;failed:number};
  friction:{jsErrorsPerActive:number|null;apiErrors:number;aiUndoAfterApply:number|null;aiRegenerations:number|null};indicators:Indicator[];days:Day[]};

const format=(value:number|null,unit:Unit)=>value===null?'Sin datos':unit==='ratio'?`${(value*100).toFixed(value<0.1&&value>0?1:0)} %`
  :unit==='minutes'?`${value<10?value.toFixed(1):Math.round(value)} min`:unit==='usd'?`USD ${value.toFixed(value<1?4:2)}`:value.toFixed(2);
/** Cambio contra la semana anterior, en texto: puntos porcentuales para cocientes. Nunca sólo color. */
function change(indicator:Indicator){
  const {value,previous,unit}=indicator;
  if(value===null||previous===null)return 'Sin comparación';
  const diff=value-previous;
  if(Math.abs(diff)<1e-9)return 'Igual que la semana anterior';
  const arrow=diff>0?'▲':'▼',size=unit==='ratio'?`${Math.abs(diff*100).toFixed(1)} pp`:unit==='minutes'?`${Math.abs(diff).toFixed(1)} min`:Math.abs(diff).toFixed(2);
  return `${arrow} ${size} contra ${format(previous,unit)}`;
}
const COLUMNS:[string,string][]=[['active','Activos'],['landing_visitors','Landing'],['new_canvas_visitors','Canvas nuevos'],['first_element','Primer elemento'],['signups','Registros'],
  ['useful_diagrams','Útiles'],['ai_requests','Pedidos IA'],['ai_applied','Aplicadas'],['feedback_down','👎'],['js_errors','Errores JS'],['ai_cost_usd','Costo IA']];

/** Panel del fundador (P7.3): los indicadores que sirven para decidir, no cientos de métricas. Sólo para administradores. */
export function FounderDashboard(){
  const [report,setReport]=useState<Report|null>(null),[error,setError]=useState<string|null>(null);
  useEffect(()=>{
    fetch('/api/v1/admin/dashboard',{headers:{'x-diagramia-client':'editor'},credentials:'same-origin'}).then(async response=>{
      if(response.ok)return setReport(await response.json());
      setError(response.status===403?'Este panel es sólo para administradores. Iniciá sesión con un email incluido en DIAGRAMIA_ADMIN_EMAILS.'
        :response.status===401?'Iniciá sesión para ver el panel.'
        :response.status===503?'El panel necesita el gateway con PostgreSQL y telemetría activa.':`El gateway respondió ${response.status}.`);
    }).catch(()=>setError('No se pudo contactar al gateway.'));
  },[]);
  if(error)return <main className="founder"><h1>Panel del fundador</h1><p className="inline-note" role="alert">{error}</p><a href="#" onClick={()=>{location.hash='';}}>Volver al editor</a></main>;
  if(!report)return <main className="founder"><h1>Panel del fundador</h1><p className="inline-note" role="status">Calculando…</p></main>;
  const [north,...rest]=report.indicators;
  return <main className="founder">
    <header className="founder-head">
      <div><span className="eyebrow">DIAGRAMIA / MEDICIÓN</span><h1>Panel del fundador</h1></div>
      <p className="mono">Semana {report.window.from} → {report.window.to} (UTC) · WAU {report.wau} (antes {report.previousWau}) · <a href="#" onClick={()=>{location.hash='';}}>Volver al editor</a></p>
    </header>
    <section className="founder-hero" aria-label={north.label}>
      <span className="eyebrow">NORTH STAR</span>
      <strong>{format(north.value,north.unit)}</strong>
      <span>{north.label}</span>
      <small>{change(north)} · {north.detail}</small>
    </section>
    <section className="founder-grid" aria-label="Indicadores">
      {rest.map(indicator=><article key={indicator.id} className="founder-tile">
        <h2>{indicator.label}</h2>
        <strong>{format(indicator.value,indicator.unit)}</strong>
        <span className="founder-change">{change(indicator)}</span>
        <p>{indicator.detail}{indicator.id==='ttfv'?` Muestra: ${report.samples.ttfv}.`:indicator.id==='d7_retention'?` Cohorte: ${report.samples.d7Cohort}.`:''}</p>
      </article>)}
    </section>
    <section className="founder-grid" aria-label="Costo y fricción">
      <article className="founder-tile"><h2>Costo de IA en la semana</h2><strong>{format(report.cost.aiUsd,'usd')}</strong><span className="founder-change">Antes {format(report.cost.previousAiUsd,'usd')}</span><p>{report.cost.aiRequests} pedidos, {report.cost.failed} fallidos, {report.cost.blocked} bloqueados por límites. Por usuario activo: {format(report.cost.perActiveUser,'usd')}.</p></article>
      <article className="founder-tile"><h2>Fricción</h2><strong>{format(report.friction.jsErrorsPerActive,'number')}</strong><span className="founder-change">errores JS por usuario activo</span><p>{report.friction.apiErrors} errores de API. Deshacer tras aplicar IA: {format(report.friction.aiUndoAfterApply,'ratio')}. Regeneraciones: {format(report.friction.aiRegenerations,'ratio')}.</p></article>
    </section>
    <section aria-label="Agregados diarios">
      <h2 className="founder-section">Últimos 14 días</h2>
      <div className="founder-table"><table>
        <thead><tr><th scope="col">Día</th>{COLUMNS.map(([key,label])=><th key={key} scope="col">{label}</th>)}</tr></thead>
        <tbody>{report.days.slice(-14).reverse().map(({day,metrics})=><tr key={day}><th scope="row">{day}</th>{COLUMNS.map(([key])=><td key={key}>{key==='ai_cost_usd'?Number(metrics[key]??0).toFixed(4):metrics[key]??0}</td>)}</tr>)}</tbody>
      </table></div>
    </section>
  </main>;
}
