import type {CSSProperties,ReactNode} from 'react';
import {assetDataUrl,detailLines,pointOnPolyline,routeAll,shapeOf,usableFraction,wrapLabel,type DiagramAnnotation,type DiagramDocument,type DiagramEdge,type DiagramNode,type Point} from '@diagramia/core';

export {wrapLabel};
type Shape=ReturnType<typeof shapeOf>;
type Box={x:number;y:number;w:number;h:number};
// Glifos de 16 × 16 dibujados con trazo: son parte del documento (campo `icon`), no decoración de la interfaz.
export const ICON_PATHS:Record<NonNullable<DiagramNode['icon']>,string>={
  user:'M8 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3 14c0-2.8 2.2-4.5 5-4.5s5 1.7 5 4.5',
  server:'M2.5 3h11v4h-11zM2.5 9h11v4h-11zM5 5h.01M5 11h.01',
  database:'M3 4.5c0-1.1 2.2-2 5-2s5 .9 5 2-2.2 2-5 2-5-.9-5-2ZM3 4.5v7c0 1.1 2.2 2 5 2s5-.9 5-2v-7M3 8c0 1.1 2.2 2 5 2s5-.9 5-2',
  cloud:'M4.5 12.5a3 3 0 0 1-.4-5.97A4 4 0 0 1 11.9 7.1a2.75 2.75 0 0 1-.4 5.4z',
  lock:'M4 7.5h8v6H4zM5.5 7.5V5.5a2.5 2.5 0 0 1 5 0v2',
  queue:'M2.5 4h11M2.5 8h11M2.5 12h11',
  globe:'M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2.5 8h11M8 2.5c-2 2-2 9 0 11M8 2.5c2 2 2 9 0 11',
  bolt:'M9 2 4 9h3.5L7 14l5-7H8.5z',
  mail:'M2.5 4h11v8h-11zM2.5 4.5 8 9l5.5-4.5',
  gear:'M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.8 3.8l1 1M11.2 11.2l1 1M12.2 3.8l-1 1M4.8 11.2l-1 1'
};
const SEVERITY_RANK={info:0,warning:1,risk:2} as const,SEVERITY_GLYPH={info:'i',warning:'!',risk:'‼'} as const;
// Formas cuyo nombre se escribe debajo y no adentro.
const LABEL_BELOW=new Set<Shape>(['actor','start','end']);
const poly=(points:[number,number][])=>points.map(p=>p.join(',')).join(' ');

/** Contorno de cada forma dentro de su caja. `main` es la pieza que recibe relleno y estado; `extra`, sus detalles. */
export function shapeParts(shape:Shape,{x,y,w,h}:Box):{main:ReactNode;extra?:ReactNode}{
  const cls='node-shape';
  switch(shape){
    case 'rectangle':return {main:<rect className={cls} x={x} y={y} width={w} height={h}/>};
    case 'ellipse':return {main:<ellipse className={cls} cx={x+w/2} cy={y+h/2} rx={w/2} ry={h/2}/>};
    case 'circle':{const r=Math.min(w,h)/2;return {main:<circle className={cls} cx={x+w/2} cy={y+h/2} r={r}/>};}
    case 'diamond':return {main:<polygon className={cls} points={poly([[x+w/2,y],[x+w,y+h/2],[x+w/2,y+h],[x,y+h/2]])}/>};
    case 'triangle':return {main:<polygon className={cls} points={poly([[x+w/2,y],[x+w,y+h],[x,y+h]])}/>};
    case 'hexagon':{const q=Math.min(w*.2,h/2);return {main:<polygon className={cls} points={poly([[x+q,y],[x+w-q,y],[x+w,y+h/2],[x+w-q,y+h],[x+q,y+h],[x,y+h/2]])}/>};}
    case 'parallelogram':{const q=w*.16;return {main:<polygon className={cls} points={poly([[x+q,y],[x+w,y],[x+w-q,y+h],[x,y+h]])}/>};}
    case 'trapezoid':{const q=w*.15;return {main:<polygon className={cls} points={poly([[x+q,y],[x+w-q,y],[x+w,y+h],[x,y+h]])}/>};}
    case 'star':{
      const cx=x+w/2,cy=y+h/2,points:[number,number][]=[];
      for(let i=0;i<10;i++){const angle=-Math.PI/2+i*Math.PI/5,k=i%2?.42:1;points.push([cx+Math.cos(angle)*w/2*k,cy+Math.sin(angle)*h/2*k]);}
      return {main:<polygon className={cls} points={poly(points)}/>};
    }
    case 'cloud':return {main:<path className={cls} d={`M${x+w*.2} ${y+h*.86}C${x-w*.04} ${y+h*.86} ${x-w*.02} ${y+h*.42} ${x+w*.2} ${y+h*.42}C${x+w*.2} ${y+h*.1} ${x+w*.55} ${y+h*.02} ${x+w*.62} ${y+h*.3}C${x+w*.85} ${y+h*.16} ${x+w*1.04} ${y+h*.46} ${x+w*.85} ${y+h*.6}C${x+w} ${y+h*.86} ${x+w*.8} ${y+h*.93} ${x+w*.7} ${y+h*.86}Z`}/>};
    case 'cylinder':{const r=Math.min(12,h/5);return {main:<path className={cls} d={`M${x} ${y+r}A${w/2} ${r} 0 0 1 ${x+w} ${y+r}V${y+h-r}A${w/2} ${r} 0 0 1 ${x} ${y+h-r}Z`}/>,extra:<path className="node-detail" d={`M${x} ${y+r}A${w/2} ${r} 0 0 0 ${x+w} ${y+r}`}/>};}
    case 'note':return {main:<path className={cls+' note'} d={`M${x} ${y}H${x+w-14}L${x+w} ${y+14}V${y+h}H${x}Z`}/>,extra:<path className="node-detail" d={`M${x+w-14} ${y}V${y+14}H${x+w}`}/>};
    case 'text':return {main:<rect className={cls+' bare'} x={x} y={y} width={w} height={h}/>};
    case 'terminator':return {main:<rect className={cls} x={x} y={y} width={w} height={h} rx={h/2}/>};
    case 'document':return {main:<path className={cls} d={`M${x} ${y}H${x+w}V${y+h*.86}Q${x+w*.75} ${y+h*.7} ${x+w/2} ${y+h*.86}T${x} ${y+h*.86}Z`}/>};
    case 'predefined':return {main:<rect className={cls} x={x} y={y} width={w} height={h}/>,extra:<path className="node-detail" d={`M${x+10} ${y}V${y+h}M${x+w-10} ${y}V${y+h}`}/>};
    case 'manual-input':return {main:<polygon className={cls} points={poly([[x,y+h*.26],[x+w,y],[x+w,y+h],[x,y+h]])}/>};
    case 'delay':return {main:<path className={cls} d={`M${x} ${y}H${x+w-h/2}A${h/2} ${h/2} 0 0 1 ${x+w-h/2} ${y+h}H${x}Z`}/>};
    case 'actor':{
      const cx=x+w/2,r=Math.min(w,h)*.16,neck=y+r*2,hip=y+h*.66;
      return {main:<circle className={cls} cx={cx} cy={y+r} r={r}/>,extra:<><rect className="node-shape bare" x={x} y={y} width={w} height={h}/><path className="node-detail" d={`M${cx} ${neck}V${hip}M${x+w*.15} ${y+h*.42}H${x+w*.85}M${cx} ${hip}L${x+w*.2} ${y+h}M${cx} ${hip}L${x+w*.8} ${y+h}`}/></>};
    }
    case 'class':return {main:<rect className={cls} x={x} y={y} width={w} height={h}/>};
    case 'package':{const tab=Math.min(16,h/4);return {main:<path className={cls} d={`M${x} ${y+tab}H${x+w}V${y+h}H${x}Z`}/>,extra:<path className="node-shape" d={`M${x} ${y+tab}V${y}H${x+w*.42}V${y+tab}`}/>};}
    case 'component':return {main:<rect className={cls} x={x+8} y={y} width={w-8} height={h}/>,extra:<><rect className="node-shape" x={x} y={y+h*.22} width="16" height="9"/><rect className="node-shape" x={x} y={y+h*.6} width="16" height="9"/></>};
    case 'start':return {main:<circle className={cls+' solid'} cx={x+w/2} cy={y+h/2} r={Math.min(w,h)/2}/>};
    case 'end':{const r=Math.min(w,h)/2;return {main:<circle className={cls} cx={x+w/2} cy={y+h/2} r={r}/>,extra:<circle className="node-shape solid" cx={x+w/2} cy={y+h/2} r={r*.58}/>};}
    default:return {main:<rect className={cls} x={x} y={y} width={w} height={h} rx="10"/>};
  }
}

/** Polilínea con esquinas redondeadas. */
export function edgePath(points:Point[],radius=8):string{
  let d=`M${points[0].x} ${points[0].y}`;
  for(let i=1;i<points.length-1;i++){
    const a=points[i-1],b=points[i],c=points[i+1],inLen=Math.hypot(b.x-a.x,b.y-a.y),outLen=Math.hypot(c.x-b.x,c.y-b.y),r=Math.min(radius,inLen/2,outLen/2);
    if(r<1){d+=`L${b.x} ${b.y}`;continue;}
    d+=`L${b.x-(b.x-a.x)/inLen*r} ${b.y-(b.y-a.y)/inLen*r}Q${b.x} ${b.y} ${b.x+(c.x-b.x)/outLen*r} ${b.y+(c.y-b.y)/outLen*r}`;
  }
  const last=points[points.length-1];
  return d+`L${last.x} ${last.y}`;
}
const DASH={solid:undefined,dashed:'7 5',dotted:'2 4'} as const;
/** Punta de flecha en `tip`, orientada según viene la línea desde `from`. */
function arrowHead(type:DiagramEdge['endArrow'],tip:Point,from:Point,size:number):ReactNode{
  if(type==='none')return null;
  const length=Math.hypot(tip.x-from.x,tip.y-from.y)||1,ux=(tip.x-from.x)/length,uy=(tip.y-from.y)/length,px=-uy,py=ux;
  const at=(back:number,side:number)=>`${tip.x-ux*back+px*side} ${tip.y-uy*back+py*side}`;
  switch(type){
    case 'arrow':return <path className="arrow-fill" d={`M${at(0,0)}L${at(size,size*.45)}L${at(size,-size*.45)}Z`}/>;
    case 'open':return <path className="arrow-line" d={`M${at(size,size*.5)}L${at(0,0)}L${at(size,-size*.5)}`}/>;
    case 'triangle':return <path className="arrow-hollow" d={`M${at(0,0)}L${at(size*1.2,size*.6)}L${at(size*1.2,-size*.6)}Z`}/>;
    case 'diamond':case 'diamond-filled':return <path className={type==='diamond'?'arrow-hollow':'arrow-fill'} d={`M${at(0,0)}L${at(size*.8,size*.42)}L${at(size*1.6,0)}L${at(size*.8,-size*.42)}Z`}/>;
    case 'circle':return <circle className="arrow-hollow" cx={tip.x-ux*size*.45} cy={tip.y-uy*size*.45} r={size*.45}/>;
  }
}

export type LayerProps={
  doc:DiagramDocument;selected?:Set<string>;activeNodes?:Set<string>;activeEdges?:Set<string>;failed?:boolean;
  /** Progreso 0..1 del paso activo; null oculta las partículas. */
  progress?:number|null;interactive?:boolean;showFrames?:boolean;
  /** Estado que cada nodo muestra en este punto del recorrido. */
  states?:Map<string,{label:string;tone:'normal'|'failure'}>;
  /** Elementos que una propuesta en vista previa agrega o modifica. */
  staged?:Set<string>;
  /** Marcadores de anotaciones sin resolver. Son ayuda de edición: no se exportan ni se presentan. */
  showAnnotations?:boolean;
  /** Elemento cuyo texto se está editando en el lugar: se dibuja sin texto para no duplicarlo. */
  editing?:string|null;
};

/** Negro o blanco, el que mejor se lee sobre un color de relleno. */
function readableOn(fill:string){
  const [r,g,b]=[1,3,5].map(i=>parseInt(fill.slice(i,i+2),16)/255).map(c=>c<=.03928?c/12.92:((c+.055)/1.055)**2.4);
  return .2126*r+.7152*g+.0722*b>.4?'#141619':'#ffffff';
}
// Los colores propios viajan como variables CSS: así los estados (activo, seleccionado) siguen pudiendo imponerse desde las clases.
// Con relleno propio y sin color de texto elegido, el texto toma el color que contrasta: se lee igual en modo claro y oscuro.
const vars=(style:{fill?:string;stroke?:string;textColor?:string;strokeWidth?:number}):CSSProperties=>({
  ...(style.fill?{'--fill':style.fill}:{}),...(style.stroke?{'--stroke':style.stroke}:{}),...(style.textColor?{'--ink':style.textColor}:style.fill?{'--ink':readableOn(style.fill)}:{}),...(style.strokeWidth!==undefined?{'--sw':String(style.strokeWidth)}:{})
} as CSSProperties);

/**
 * Dibujo puro del documento. No guarda estado ni genera IDs: el canvas, la presentación y el export
 * usan este mismo componente, así que lo exportado coincide con lo que se ve.
 */
export function DiagramLayer({doc,selected,activeNodes,activeEdges,failed=false,progress=null,interactive=false,showFrames=true,states,showAnnotations=false,staged,editing=null}:LayerProps){
  const has=(set:Set<string>|undefined,id:string)=>set?.has(id)??false;
  const routes=routeAll(doc),assets=new Map(doc.assets.map(a=>[a.id,a]));
  // Un marcador por elemento anotado, con la severidad más alta entre sus anotaciones abiertas.
  const marks=new Map<string,DiagramAnnotation[]>();
  if(showAnnotations)for(const note of doc.annotations)if(note.targetId&&!note.resolved)marks.set(note.targetId,[...(marks.get(note.targetId)??[]),note]);
  const anchor=(id:string):{at:Point;type:string}|null=>{
    const n=doc.nodes.find(x=>x.id===id);if(n)return {at:{x:n.position.x,y:n.position.y},type:'node'};
    const zone=doc.zones.find(x=>x.id===id);if(zone)return {at:{x:zone.bounds.x+zone.bounds.width,y:zone.bounds.y},type:'zone'};
    const frame=doc.frames.find(x=>x.id===id);if(frame)return {at:{x:frame.bounds.x+frame.bounds.width,y:frame.bounds.y},type:'frame'};
    const route=routes.get(id);return route?{at:pointOnPolyline(route.points,.3),type:'edge'}:null;
  };
  return <g className="diagram">
    {doc.drawings.map(d=>{
      const pts=d.points,path='M'+pts.map(p=>`${p.x} ${p.y}`).join('L'),first=pts[0],last=pts[pts.length-1],prev=pts[pts.length-2],angle=Math.atan2(last.y-prev.y,last.x-prev.x),size=10+(d.style.strokeWidth??2)*2;
      const head=d.kind==='arrow'?<path className="drawing-head" d={`M${last.x} ${last.y}L${last.x-size*Math.cos(angle-.45)} ${last.y-size*Math.sin(angle-.45)}L${last.x-size*Math.cos(angle+.45)} ${last.y-size*Math.sin(angle+.45)}Z`}/>:null;
      return <g key={d.id} data-id={d.id} data-type="drawing" style={vars(d.style)} className={'free-drawing'+(has(selected,d.id)?' selected':'')}>
        <path className="free-drawing-path" d={path}/>{head}{interactive&&<path className="free-drawing-hit" d={path}/>}
      </g>;
    })}
    {doc.zones.map(z=><g key={z.id} data-id={z.id} data-type="zone" style={vars(z.style)} className={'zone-group'+(has(selected,z.id)?' selected':'')+(has(staged,z.id)?' staged':'')}>
      <rect className="zone" {...z.bounds} rx="12" strokeDasharray={z.style.dash?DASH[z.style.dash]??'none':undefined}/>
      {interactive&&<rect className="hit-border" {...z.bounds} rx="12"/>}
      {editing!==z.id&&<text className="zone-label" x={z.bounds.x+18} y={z.bounds.y+26}>{z.label}</text>}
    </g>)}
    {showFrames&&doc.frames.map(f=><g key={f.id} data-id={f.id} data-type="frame" className={'frame-group'+(has(selected,f.id)?' selected':'')+(has(staged,f.id)?' staged':'')}>
      <rect className="frame" {...f.bounds}/>
      {interactive&&<rect className="hit-border" {...f.bounds}/>}
      <text className="frame-label" x={f.bounds.x} y={f.bounds.y-8}>▣ {f.label}</text>
    </g>)}
    {doc.edges.map(e=>{
      const routed=routes.get(e.id);if(!routed||routed.points.length<2)return null;
      const {points}=routed,state=has(activeEdges,e.id)?' active':has(selected,e.id)?' selected':'',width=e.style.strokeWidth??2,head=6+width*2;
      const d=e.line==='orthogonal'?edgePath(points):'M'+points.map(p=>`${p.x} ${p.y}`).join('L'),dash=e.style.dash?DASH[e.style.dash]:e.alternative?DASH.dashed:undefined;
      return <g key={e.id} data-id={e.id} data-type="edge" style={vars(e.style)} className={`edge-group${state}${has(staged,e.id)?' staged':''}`}>
        <path className="edge" d={d} strokeDasharray={dash}/>
        {arrowHead(e.endArrow,points[points.length-1],points[points.length-2],head)}
        {arrowHead(e.startArrow,points[0],points[1],head)}
        {interactive&&<path className="hit-edge" d={d}/>}
        {e.label&&routed.label&&editing!==e.id&&<text className="edge-label" x={routed.label.x} y={routed.label.y} fontSize={e.style.fontSize}>{e.label}</text>}
      </g>;
    })}
    {doc.nodes.map(n=>{
      const {x,y}=n.position,{width:w,height:h}=n.size,active=has(activeNodes,n.id),shape=shapeOf(n),asset=n.assetId?assets.get(n.assetId):undefined,state=states?.get(n.id);
      const size=n.style.fontSize??15,lineHeight=Math.round(size*1.2),below=Boolean(asset)||LABEL_BELOW.has(shape),[fw]=usableFraction(shape),extra=detailLines(n.details);
      const align=n.style.align??'center',pad=shape==='class'?10:12,tx=align==='left'?x+pad:align==='right'?x+w-pad:x+w/2,anchorAt=align==='left'?'start':align==='right'?'end':'middle';
      const lines=wrapLabel(n.label,below?Math.max(w,140):Math.max(40,w*fw-(n.icon?40:20)),size,shape==='class'?1:4);
      // El bloque de texto (título, subtítulo y detalles) se centra en la forma; en una clase UML el título va arriba.
      const blockHeight=lines.length*lineHeight+(n.subtitle?15:0)+(shape==='class'?0:extra.length*16);
      const top=below?y+h+size+3:shape==='class'?y+size+6:y+h/2-blockHeight/2+size*.82+(shape==='cylinder'?Math.min(12,h/5)/2:shape==='triangle'?h*.16:0);
      const parts=shapeParts(shape,{x,y,w,h}),dash=n.style.dash?DASH[n.style.dash]:undefined,header=y+lineHeight+12;
      const textStyle:CSSProperties={fontWeight:n.style.bold?700:undefined,fontStyle:n.style.italic?'italic':undefined};
      return <g key={n.id} data-id={n.id} data-type="node" style={vars(n.style)} strokeDasharray={dash}
        className={`graph-node kind-${n.kind} shape-${shape}${has(selected,n.id)?' selected':''}${has(staged,n.id)?' staged':''}${active?' active':''}${active&&failed?' failed':''}`}
        {...(interactive?{role:'button',tabIndex:0,'aria-label':`${n.label}, ${n.kind}${n.zoneId?', en zona '+(doc.zones.find(z=>z.id===n.zoneId)?.label??n.zoneId):''}`}:{})}>
        {asset?<><rect className="node-shape bare" x={x} y={y} width={w} height={h}/><image href={assetDataUrl(asset)} x={x} y={y} width={w} height={h} preserveAspectRatio="xMidYMid meet"/></>:<>{parts.main}{parts.extra}</>}
        {!asset&&!n.shape&&n.kind==='cache'&&<path className="node-accent" d={`M${x+5} ${y+12}V${y+h-12}`}/>}
        {!asset&&!n.shape&&n.kind==='queue'&&<path className="node-detail" d={[12,22,32].map(o=>`M${x+w-o} ${y+10}V${y+h-10}`).join('')}/>}
        {n.icon&&!asset&&<path className="node-icon" strokeDasharray="none" d={ICON_PATHS[n.icon]} transform={`translate(${x+8} ${y+8})`}/>}
        {state&&<text className={'node-state'+(state.tone==='failure'?' failure':'')} x={x+w/2} y={y-8}>{state.tone==='failure'?'✕ ':'● '}{state.label}</text>}
        {editing!==n.id&&<text className="node-title" x={tx} y={top} fontSize={size} textAnchor={anchorAt} style={textStyle}>{lines.map((line,i)=><tspan key={i} x={tx} dy={i?lineHeight:0}>{line}</tspan>)}</text>}
        {n.subtitle&&!below&&shape!=='diamond'&&shape!=='class'&&<text className="node-subtitle" x={tx} y={top+(lines.length-1)*lineHeight+15} textAnchor={anchorAt}>{n.subtitle}</text>}
        {shape==='class'&&<>
          {(extra.length>0||n.subtitle)&&<path className="node-detail" d={`M${x} ${header}H${x+w}`}/>}
          {extra.map((line,i)=>line.trim()==='--'?<path key={i} className="node-detail" d={`M${x} ${header+i*16+10}H${x+w}`}/>:<text key={i} className="node-details mono" x={x+10} y={header+i*16+16}>{line}</text>)}
        </>}
        {shape!=='class'&&!below&&extra.map((line,i)=><text key={i} className="node-details" x={tx} y={top+(lines.length-1)*lineHeight+(n.subtitle?15:0)+18+i*16} textAnchor={anchorAt}>{line}</text>)}
        {active&&failed&&<text className="node-flag" x={x+w-10} y={y+16}>✕</text>}
      </g>;
    })}
    {[...marks].map(([id,notes])=>{
      const place=anchor(id);if(!place)return null;
      const severity=notes.reduce<DiagramAnnotation['severity']>((top,note)=>SEVERITY_RANK[note.severity]>SEVERITY_RANK[top]?note.severity:top,'info');
      return <g key={id} data-id={id} data-type={place.type} className={`annotation-mark ${severity}`}><title>{notes.map(note=>note.text).join('\n')}</title><circle cx={place.at.x} cy={place.at.y} r="10"/><text x={place.at.x} y={place.at.y+4}>{SEVERITY_GLYPH[severity]}{notes.length>1?notes.length:''}</text></g>;
    })}
    {progress!==null&&[...(activeEdges??[])].map(id=>{const routed=routes.get(id);if(!routed)return null;const p=pointOnPolyline(routed.points,progress);return <circle key={id} className="particle" cx={p.x} cy={p.y} r="6"/>;})}
  </g>;
}

/**
 * CSS del dibujo. Se inyecta también en los exports para que el archivo sea autónomo. Los colores base son variables con
 * su valor claro por defecto: el editor las redefine en modo oscuro, y un export (que no las define) sale siempre claro.
 */
export const DIAGRAM_CSS=`
.diagram{font-family:Manrope,Arial,sans-serif;fill:var(--d-ink,#141619)}
.zone{fill:var(--fill,var(--d-zone,#f4f6f8));stroke:var(--stroke,var(--d-zone-line,#a0abba));stroke-dasharray:6 6}
.zone-label{font:12px Plex,'IBM Plex Mono',monospace;fill:var(--ink,var(--d-muted,#606975))}
.frame{fill:none;stroke:var(--d-ink,#141619);stroke-width:1;stroke-opacity:.45}
.frame-label{font:11px Plex,'IBM Plex Mono',monospace;fill:var(--d-muted,#606975)}
.edge{fill:none;stroke:var(--stroke,var(--d-line,#7b8799));stroke-width:var(--sw,2);stroke-linejoin:round}
.free-drawing-path{fill:none;stroke:var(--stroke,var(--d-ink,#141619));stroke-width:var(--sw,2);stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
.free-drawing-hit{fill:none;stroke:transparent;stroke-width:14;pointer-events:stroke;cursor:pointer}
.drawing-head{fill:var(--stroke,var(--d-ink,#141619));pointer-events:none}
.free-drawing.selected .free-drawing-path{stroke:#245cf6}.free-drawing.selected .drawing-head{fill:#245cf6}
.arrow-fill{fill:var(--stroke,var(--d-line,#7b8799));stroke:none}
.arrow-line{fill:none;stroke:var(--stroke,var(--d-line,#7b8799));stroke-width:var(--sw,2)}
.arrow-hollow{fill:var(--d-node,#fff);stroke:var(--stroke,var(--d-line,#7b8799));stroke-width:var(--sw,2)}
.active .edge{stroke:#245cf6;stroke-width:3}
.active .arrow-fill{fill:#245cf6}.active .arrow-line,.active .arrow-hollow{stroke:#245cf6}
.edge-label{font:11px Plex,'IBM Plex Mono',monospace;fill:var(--ink,var(--d-muted,#606975));text-anchor:middle;paint-order:stroke;stroke:var(--d-halo,#fff);stroke-width:5}
.node-shape{fill:var(--fill,var(--d-node,#fff));stroke:var(--stroke,var(--d-line,#7b8799));stroke-width:var(--sw,1.5)}
.kind-external .node-shape{stroke-dasharray:5 4}
.node-shape.note{fill:var(--fill,var(--d-note,#f7fbdc))}
.node-shape.bare{fill:transparent;stroke:none}
.node-shape.solid{fill:var(--fill,var(--d-ink,#141619))}
.node-detail{fill:none;stroke:var(--stroke,var(--d-line,#7b8799));stroke-width:var(--sw,1.5)}
.node-accent{fill:none;stroke:#245cf6;stroke-width:4;stroke-linecap:round}
.node-title{fill:var(--ink,var(--d-ink,#141619))}
.node-subtitle{font:10px Plex,'IBM Plex Mono',monospace;fill:var(--ink,var(--d-muted,#606975))}
.node-details{font-size:12px;fill:var(--ink,var(--d-ink,#141619))}
.node-details.mono{font-family:Plex,'IBM Plex Mono',monospace}
.active .node-shape{fill:#d4f246;stroke:#141619}
.active .node-shape.bare{fill:transparent;stroke:none}
.active .node-title,.active .node-subtitle,.active .node-details{fill:#141619}
.failed .node-shape{fill:#f6c8bc;stroke-dasharray:4 3}
.node-flag{font-size:13px;font-weight:700;text-anchor:middle;fill:#141619}
.node-icon{fill:none;stroke:#245cf6;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.node-state{font:10px Plex,'IBM Plex Mono',monospace;fill:#245cf6;text-anchor:middle;paint-order:stroke;stroke:var(--d-halo,#fff);stroke-width:4;letter-spacing:.04em}
.node-state.failure{fill:#b42318}
.particle{fill:#245cf6;stroke:#fff;stroke-width:2}
`;
