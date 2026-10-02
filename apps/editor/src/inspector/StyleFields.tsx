import {useEffect,useId,useRef,useState} from 'react';
import {ARROWS,LINES,type DiagramEdge,type DiagramNode,type DiagramZone} from '@diagramia/core';
import {NumberField,SelectField} from '../ui';

// Colores de la marca primero; el selector libre queda al lado.
const SWATCHES=['#ffffff','#f4f6f8','#d4f246','#e5ecff','#fde8e4','#fff4d6','#245cf6','#141619'];
const DASH_OPTIONS=[['solid','Continua'],['dashed','Discontinua'],['dotted','Punteada']] as const;
export const ARROW_LABELS:Record<typeof ARROWS[number],string>={none:'Sin punta',arrow:'Flecha',open:'Flecha abierta',triangle:'Triángulo (herencia)',diamond:'Rombo (agregación)','diamond-filled':'Rombo lleno (composición)',circle:'Círculo'};
export const LINE_LABELS:Record<typeof LINES[number],string>={orthogonal:'En ángulos rectos',straight:'Recta',curved:'Curva'};

type ColorProps={label:string;value:string|undefined;fallback:string;onChange:(value:string|undefined)=>void};
/** Color con muestras rápidas, selector libre y «automático» (vuelve al color del tema). */
export function ColorField({label,value,fallback,onChange}:ColorProps){
  const id=useId(),[draft,setDraft]=useState(value??fallback),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  useEffect(()=>setDraft(value??fallback),[value,fallback]);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  // El selector nativo emite un cambio por cada movimiento: se confirma al dejar de mover, para que sea un solo paso de undo.
  const pick=(color:string)=>{setDraft(color);clearTimeout(timer.current);timer.current=setTimeout(()=>onChange(color),350);};
  return <div className="field color-field"><label htmlFor={id}>{label}</label>
    <div className="swatches">
      <input id={id} type="color" value={draft} onChange={e=>pick(e.target.value)}/>
      {SWATCHES.map(color=><button key={color} className={'swatch'+(value?.toLowerCase()===color?' chosen':'')} style={{background:color}} aria-label={`${label} ${color}`} title={color} onClick={()=>onChange(color)}/>)}
      <button className="quiet" disabled={!value} onClick={()=>onChange(undefined)} title="Volver al color del tema">Auto</button>
    </div>
  </div>;
}
// Un estilo sólo guarda lo que el usuario cambió: quitar una clave la devuelve al valor del tema.
const merge=<T extends object>(style:T,key:keyof T,value:T[keyof T]|undefined):T=>{const next={...style};if(value===undefined)delete next[key];else next[key]=value;return next;};

export function NodeStyleFields({node,onStyle}:{node:DiagramNode;onStyle:(style:DiagramNode['style'])=>void}){
  const s=node.style,set=<K extends keyof DiagramNode['style']>(key:K,value:DiagramNode['style'][K]|undefined)=>onStyle(merge(s,key,value));
  return <fieldset className="choice"><legend>Estilo</legend>
    <ColorField label="Relleno" value={s.fill} fallback="#ffffff" onChange={v=>set('fill',v)}/>
    <ColorField label="Borde" value={s.stroke} fallback="#7b8799" onChange={v=>set('stroke',v)}/>
    <ColorField label="Texto" value={s.textColor} fallback="#141619" onChange={v=>set('textColor',v)}/>
    <div className="field-grid">
      <NumberField label="Grosor del borde" value={s.strokeWidth??1.5} min={0} max={8} step={.5} onCommit={v=>set('strokeWidth',v)}/>
      <SelectField label="Línea" value={s.dash??'solid'} options={DASH_OPTIONS} onChange={v=>set('dash',v==='solid'?undefined:v)}/>
      <NumberField label="Tamaño de letra" value={s.fontSize??15} min={8} max={48} onCommit={v=>set('fontSize',Math.round(v))}/>
      <SelectField label="Alineación" value={s.align??'center'} options={[['left','Izquierda'],['center','Centro'],['right','Derecha']] as const} onChange={v=>set('align',v==='center'?undefined:v)}/>
    </div>
    <div className="button-grid two">
      <label className="check"><input type="checkbox" checked={Boolean(s.bold)} onChange={e=>set('bold',e.target.checked||undefined)}/>Negrita</label>
      <label className="check"><input type="checkbox" checked={Boolean(s.italic)} onChange={e=>set('italic',e.target.checked||undefined)}/>Cursiva</label>
    </div>
    <button disabled={!Object.keys(s).length} onClick={()=>onStyle({})}>Quitar todo el estilo propio</button>
  </fieldset>;
}

export function EdgeStyleFields({edge,onStyle}:{edge:DiagramEdge;onStyle:(style:DiagramEdge['style'])=>void}){
  const s=edge.style,set=<K extends keyof DiagramEdge['style']>(key:K,value:DiagramEdge['style'][K]|undefined)=>onStyle(merge(s,key,value));
  return <fieldset className="choice"><legend>Estilo</legend>
    <ColorField label="Color de la línea" value={s.stroke} fallback="#7b8799" onChange={v=>set('stroke',v)}/>
    <ColorField label="Color de la etiqueta" value={s.textColor} fallback="#606975" onChange={v=>set('textColor',v)}/>
    <div className="field-grid">
      <NumberField label="Grosor" value={s.strokeWidth??2} min={.5} max={8} step={.5} onCommit={v=>set('strokeWidth',v)}/>
      <SelectField label="Trazo" value={s.dash??(edge.alternative?'dashed':'solid')} options={DASH_OPTIONS} onChange={v=>set('dash',v)}/>
      <NumberField label="Letra de la etiqueta" value={s.fontSize??11} min={8} max={32} onCommit={v=>set('fontSize',Math.round(v))}/>
    </div>
  </fieldset>;
}

export function ZoneStyleFields({zone,onStyle}:{zone:DiagramZone;onStyle:(style:DiagramZone['style'])=>void}){
  const s=zone.style,set=<K extends keyof DiagramZone['style']>(key:K,value:DiagramZone['style'][K]|undefined)=>onStyle(merge(s,key,value));
  return <fieldset className="choice"><legend>Estilo</legend>
    <ColorField label="Fondo" value={s.fill} fallback="#f4f6f8" onChange={v=>set('fill',v)}/>
    <ColorField label="Borde" value={s.stroke} fallback="#a0abba" onChange={v=>set('stroke',v)}/>
    <ColorField label="Título" value={s.textColor} fallback="#606975" onChange={v=>set('textColor',v)}/>
    <SelectField label="Borde" value={s.dash??'dashed'} options={DASH_OPTIONS} onChange={v=>set('dash',v==='dashed'?undefined:v)}/>
  </fieldset>;
}
