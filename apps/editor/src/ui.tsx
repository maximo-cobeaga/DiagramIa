import {useEffect,useId,useRef,useState} from 'react';
import type {DiagramNode} from '@diagramia/core';

export const KIND_LABELS:Record<DiagramNode['kind'],string>={service:'Servicio',database:'Base de datos',cache:'Caché',queue:'Cola',external:'Sistema externo',actor:'Actor',decision:'Decisión',note:'Nota',text:'Texto',image:'Imagen (reservado)',custom:'Genérico'};
// `image` no se ofrece al crear: el engine valida el tipo pero todavía no carga ni dibuja imágenes.
export const CREATABLE_KINDS:DiagramNode['kind'][]=['service','database','cache','queue','external','actor','decision','note','text'];

type TextProps={label:string;value:string;onCommit:(value:string)=>void;multiline?:boolean;allowEmpty?:boolean;focusToken?:number;maxLength?:number};
// Último pedido de foco ya atendido: un campo recién montado sólo toma el foco si el pedido es nuevo.
let handledFocus=0;
/**
 * Campo que confirma al salir o con Enter: cada confirmación es una acción y un paso de undo, no una por tecla.
 * Quien lo usa debe darle una `key` por elemento; al desmontarse confirma lo pendiente sobre su elemento original.
 */
export function TextField({label,value,onCommit,multiline=false,allowEmpty=false,focusToken,maxLength}:TextProps){
  const [draft,setDraft]=useState(value),id=useId(),ref=useRef<HTMLInputElement&HTMLTextAreaElement>(null);
  useEffect(()=>setDraft(value),[value]);
  useEffect(()=>{if(focusToken!==undefined&&focusToken!==handledFocus){handledFocus=focusToken;ref.current?.focus();ref.current?.select();}},[focusToken]);
  const cancelled=useRef(false);
  const commit=()=>{
    if(cancelled.current){cancelled.current=false;return;}
    const next=draft.trim();if(next===value)return;if(!next&&!allowEmpty){setDraft(value);return;}onCommit(next);
  };
  const pending=useRef(commit);pending.current=commit;
  useEffect(()=>()=>pending.current(),[]);
  const props={id,ref,value:draft,maxLength,onChange:(e:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement>)=>setDraft(e.target.value),onBlur:commit,
    onKeyDown:(e:React.KeyboardEvent)=>{if(e.key==='Enter'&&(!multiline||e.ctrlKey||e.metaKey)){e.preventDefault();commit();}if(e.key==='Escape'){e.stopPropagation();cancelled.current=true;setDraft(value);ref.current?.blur();}}};
  return <div className="field"><label htmlFor={id}>{label}</label>{multiline?<textarea rows={3} {...props}/>:<input {...props}/>}</div>;
}

type NumberProps={label:string;value:number;onCommit:(value:number)=>void;min?:number;max?:number;step?:number};
export function NumberField({label,value,onCommit,min,max,step=1}:NumberProps){
  const [draft,setDraft]=useState(String(value)),id=useId();
  useEffect(()=>setDraft(String(value)),[value]);
  const commit=()=>{
    const parsed=Number(draft);
    if(draft.trim()===''||!Number.isFinite(parsed)){setDraft(String(value));return;}
    const next=Math.max(min??-Infinity,Math.min(max??Infinity,parsed));
    setDraft(String(next));if(next!==value)onCommit(next);
  };
  return <div className="field"><label htmlFor={id}>{label}</label><input id={id} type="number" inputMode="decimal" value={draft} min={min} max={max} step={step} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();commit();}}}/></div>;
}

type SelectProps<T extends string>={label:string;value:T;options:readonly (readonly [T,string])[];onChange:(value:T)=>void};
export function SelectField<T extends string>({label,value,options,onChange}:SelectProps<T>){
  const id=useId();
  return <div className="field"><label htmlFor={id}>{label}</label><select id={id} value={value} onChange={e=>onChange(e.target.value as T)}>{options.map(([key,text])=><option key={key} value={key}>{text}</option>)}</select></div>;
}

export function saveFile(name:string,body:BlobPart,type:string){
  const url=URL.createObjectURL(new Blob([body],{type})),a=document.createElement('a');
  a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
