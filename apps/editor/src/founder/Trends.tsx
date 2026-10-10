import {useRef,useState} from 'react';

type Day={day:string;metrics:Record<string,number>};
type Unit='count'|'usd';

/**
 * Tendencias de 28 días: una serie por gráfica (sin eje doble), mismo eje para todos los días y la misma escala desde cero.
 * Cada gráfica se lee sola: valor de la semana, cambio contra la anterior, línea con hover/teclado y una tabla con los mismos datos.
 */
const TRENDS:{key:string;label:string;unit:Unit;hint:string}[]=[
  {key:'landing_visitors',label:'Visitantes de la landing',unit:'count',hint:'Personas distintas que vieron la landing.'},
  {key:'new_canvas_visitors',label:'Navegadores nuevos en el canvas',unit:'count',hint:'Abrieron el editor por primera vez.'},
  {key:'active',label:'Usuarios activos',unit:'count',hint:'Visitantes o cuentas con actividad ese día.'},
  {key:'signups',label:'Registros',unit:'count',hint:'Cuentas nuevas.'},
  {key:'useful_diagrams',label:'Diagramas útiles',unit:'count',hint:'2+ nodos y 1 conexión, exportado, guardado o reabierto.'},
  {key:'ai_requests',label:'Pedidos de IA',unit:'count',hint:'Pedidos que llegaron al modelo.'},
  {key:'ai_cost_usd',label:'Costo de IA',unit:'usd',hint:'Gasto estimado por día.'},
  {key:'checkout_started',label:'Pagos abiertos',unit:'count',hint:'Veces que se abrió la pasarela de pago.'}
];
const WIDTH=300,HEIGHT=96,PAD={top:8,right:6,bottom:8,left:6};
const shortDay=(day:string)=>{const [,m,d]=day.split('-');return `${d}/${m}`;};
const show=(value:number,unit:Unit)=>unit==='usd'?`USD ${value.toFixed(value<1?4:2)}`:Math.round(value).toLocaleString('es');
const sum=(values:number[])=>values.reduce((a,b)=>a+b,0);

function Trend({days,metric}:{days:Day[];metric:typeof TRENDS[number]}){
  const values=days.map(d=>Number(d.metrics[metric.key]??0));
  const [hover,setHover]=useState<number|null>(null),box=useRef<HTMLDivElement>(null);
  const last7=sum(values.slice(-7)),before7=sum(values.slice(-14,-7)),max=Math.max(...values,metric.unit==='usd'?0.0001:1);
  const x=(i:number)=>PAD.left+(i/Math.max(1,values.length-1))*(WIDTH-PAD.left-PAD.right);
  const y=(v:number)=>HEIGHT-PAD.bottom-(v/max)*(HEIGHT-PAD.top-PAD.bottom);
  const line=values.map((v,i)=>`${i?'L':'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area=`${line} L${x(values.length-1).toFixed(1)} ${y(0).toFixed(1)} L${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`;
  const diff=last7-before7,arrow=diff>0?'▲':diff<0?'▼':'=';
  const change=before7===0&&last7===0?'Sin actividad':before7===0?'Sin semana anterior para comparar':`${arrow} ${show(Math.abs(diff),metric.unit)} contra la semana anterior (${show(before7,metric.unit)})`;
  const at=(clientX:number)=>{
    const rect=box.current?.getBoundingClientRect();if(!rect||!rect.width)return;
    setHover(Math.max(0,Math.min(values.length-1,Math.round(((clientX-rect.left)/rect.width)*(values.length-1)))));
  };
  const shown=hover!==null?hover:null;
  return <article className="trend-tile">
    <h3>{metric.label}</h3>
    <strong>{show(last7,metric.unit)}</strong>
    <span className="trend-change">{change}</span>
    <div className="trend-plot" ref={box} onPointerMove={e=>at(e.clientX)} onPointerLeave={()=>setHover(null)}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" tabIndex={0} preserveAspectRatio="none"
        aria-label={`${metric.label}: ${show(last7,metric.unit)} en los últimos 7 días, ${show(before7,metric.unit)} en los 7 anteriores. ${metric.hint}`}
        onKeyDown={e=>{
          if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();setHover(current=>Math.max(0,Math.min(values.length-1,(current??values.length-1)+(e.key==='ArrowRight'?1:-1))));}
          else if(e.key==='Escape')setHover(null);
        }} onBlur={()=>setHover(null)}>
        <line className="trend-base" x1={PAD.left} x2={WIDTH-PAD.right} y1={y(0)} y2={y(0)}/>
        <path className="trend-area" d={area}/>
        <path className="trend-line" d={line}/>
        {shown!==null&&<><line className="trend-cross" x1={x(shown)} x2={x(shown)} y1={PAD.top} y2={HEIGHT-PAD.bottom}/>
          <circle className="trend-dot" cx={x(shown)} cy={y(values[shown]!)} r={5}/></>}
      </svg>
      {shown!==null&&<div className="trend-tip" role="status" style={{left:`${Math.min(86,Math.max(14,(x(shown)/WIDTH)*100))}%`}}>
        <b>{show(values[shown]!,metric.unit)}</b><span>{shortDay(days[shown]!.day)}</span></div>}
    </div>
    <div className="trend-axis" aria-hidden="true"><span>{shortDay(days[0]!.day)}</span><span>{shortDay(days[days.length-1]!.day)}</span></div>
    <p>{metric.hint}</p>
  </article>;
}

export function Trends({days}:{days:Day[]}){
  if(days.length<2)return null;
  return <section aria-label="Tendencias de 28 días">
    <h2 className="founder-section">Tendencias · últimos {days.length} días</h2>
    <div className="trend-grid">{TRENDS.map(metric=><Trend key={metric.key} days={days} metric={metric}/>)}</div>
    <details className="trend-table"><summary>Ver estos datos como tabla</summary>
      <div className="founder-table"><table>
        <thead><tr><th scope="col">Día</th>{TRENDS.map(m=><th key={m.key} scope="col">{m.label}</th>)}</tr></thead>
        <tbody>{[...days].reverse().map(({day,metrics})=><tr key={day}><th scope="row">{day}</th>{TRENDS.map(m=><td key={m.key}>{m.unit==='usd'?Number(metrics[m.key]??0).toFixed(4):metrics[m.key]??0}</td>)}</tr>)}</tbody>
      </table></div>
    </details>
  </section>;
}

/**
 * Recorrido de la semana: cuántas personas o eventos hay en cada etapa. No es una cohorte (cada etapa se cuenta por separado),
 * por eso se rotula «de la semana» y no como porcentaje de abandono; sirve para ver dónde se achica el volumen.
 */
export function Funnel({days}:{days:Day[]}){
  const week=days.slice(-7),total=(key:string)=>sum(week.map(d=>Number(d.metrics[key]??0)));
  const steps:[string,number,string][]=[
    ['Vieron la landing',total('landing_visitors'),'Visitantes distintos por día, sumados.'],
    ['Abrieron el editor desde la landing',total('landing_to_canvas'),'Tocaron «Crear diagrama».'],
    ['Crearon su primer elemento',total('first_element'),'Navegadores nuevos que pusieron una pieza.'],
    ['Se registraron',total('signups'),'Cuentas nuevas.'],
    ['Llegaron a un diagrama útil',total('useful_diagrams'),'Exportado, guardado en la nube o reabierto.'],
    ['Abrieron el pago de Pro',total('checkout_started'),'Página de pago abierta.'],
    ['Pagaron',total('checkout_completed'),'Pagos completados en la pasarela.']
  ];
  const max=Math.max(1,...steps.map(s=>s[1]));
  return <section aria-label="Recorrido de la semana">
    <h2 className="founder-section">Recorrido de la semana</h2>
    <ol className="funnel">
      {steps.map(([label,value,hint],i)=>{
        const previous=i>0?steps[i-1]![1]:null;
        return <li key={label}>
          <div className="funnel-head"><span>{label}</span><strong>{value.toLocaleString('es')}</strong>
            {/* Sólo si cabe en la etapa anterior: las etapas no son una cohorte y un cociente mayor a 100 % confunde. */}
            {previous!==null&&previous>0&&value<=previous&&<small>{Math.round(value/previous*100)} % de la etapa anterior</small>}</div>
          <div className="funnel-track" aria-hidden="true"><i style={{width:`${(value/max)*100}%`}}/></div>
          <p>{hint}</p>
        </li>;
      })}
    </ol>
  </section>;
}
