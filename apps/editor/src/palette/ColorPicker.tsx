import {useEffect,useState} from 'react';
import {createStore} from '../store/createStore';
import {useStore} from '../store/createStore';
import {t} from '../i18n';

export const COLORS=[[t('Papel'),'#ffffff'],[t('Lima'),'#d4f246'],[t('Cielo'),'#e5ecff'],[t('Rosa'),'#fde2ef'],[t('Durazno'),'#ffe4d6'],[t('Azul'),'#245cf6'],
  [t('Tinta'),'#141619'],[t('Gris'),'#606975'],[t('Rojo'),'#d12f45'],[t('Naranja'),'#e96922'],[t('Amarillo'),'#f5c842'],[t('Verde'),'#23834f'],
  [t('Menta'),'#bfead5'],[t('Turquesa'),'#168c97'],[t('Celeste'),'#62b5e5'],[t('Violeta'),'#7854cf'],[t('Lavanda'),'#e1d8fb'],[t('Fucsia'),'#bc3571'],
  [t('Coral'),'#f2a38c'],[t('Arena'),'#e8d6b6'],[t('Marrón'),'#865735'],[t('Oliva'),'#7f8e3b'],[t('Marino'),'#263866'],[t('Lila'),'#b28bd9']] as const;
const HEX=/^#[0-9a-f]{6}$/i,KEY='diagramia.colors';
function savedColors():string[]{try{const colors:unknown=JSON.parse(localStorage.getItem(KEY)??'[]');return Array.isArray(colors)?[...new Set(colors.filter((c):c is string=>typeof c==='string'&&HEX.test(c)).map(c=>c.toLowerCase()))].slice(-24):[];}catch{return [];}}
const colorStore=createStore({custom:savedColors()});
/** Contraste calculado con luminancia relativa; los colores elegidos siguen siendo los del documento. */
export function readableText(color:string){
  const [r,g,b]=[1,3,5].map(i=>{const v=parseInt(color.slice(i,i+2),16)/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
  return .2126*r+.7152*g+.0722*b>.179?'#141619':'#ffffff';
}
/** Paleta compartida: color libre explícito, muestras guardadas localmente y sin CSS arbitrario. */
export function ColorPicker({value,onChange}:{value?:string;onChange:(color:string)=>void}){
  const {custom}=useStore(colorStore),[draft,setDraft]=useState(value??'#245cf6');
  useEffect(()=>{if(value&&HEX.test(value))setDraft(value);},[value]);
  const valid=HEX.test(draft),pick=(color:string)=>{setDraft(color);onChange(color);};
  const save=()=>{
    if(!valid)return;
    const color=draft.toLowerCase(),custom=[...colorStore.get().custom.filter(c=>c!==color),color].slice(-24);
    colorStore.set({custom});try{localStorage.setItem(KEY,JSON.stringify(custom));}catch{/* la muestra sigue disponible en esta sesión */}
    pick(color);
  };
  return <div className="color-picker">
    <div className="color-grid" role="group" aria-label={t('Elegir un color')}>{COLORS.map(([name,color])=><button type="button" key={name} className={'color-dot'+(value?.toLowerCase()===color?' chosen':'')} style={{background:color}} aria-label={t('Color {0}',name)} title={name} aria-pressed={value?.toLowerCase()===color} onClick={()=>pick(color)}/>)}</div>
    {custom.length>0&&<div className="custom-colors"><span>{t('Mis colores')}</span><div className="color-grid">{custom.map(color=><button type="button" key={color} className={'color-dot'+(value?.toLowerCase()===color?' chosen':'')} style={{background:color}} aria-label={t('Color guardado {0}',color)} aria-pressed={value?.toLowerCase()===color} onClick={()=>pick(color)}/>)}</div></div>}
    <div className="custom-color-entry"><input type="color" aria-label={t('Elegir color personalizado')} value={valid?draft:'#245cf6'} onChange={e=>setDraft(e.target.value)}/><input aria-label={t('Código del color')} value={draft} maxLength={7} spellCheck={false} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();save();}}}/><button type="button" disabled={!valid} onClick={save}>{t('＋ Agregar')}</button></div>
    <small>{t('Elegí cualquier color y guardalo para volver a usarlo.')}</small>
  </div>;
}
