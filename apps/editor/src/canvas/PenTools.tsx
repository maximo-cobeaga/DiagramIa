import {useEffect,useState} from 'react';
import {ColorPicker} from '../palette/ColorPicker';
import {useStore} from '../store/createStore';
import {viewStore} from '../store/viewStore';
import {t} from '../i18n';

export function PenTools({guideLabel}:{guideLabel?:string}){
  const {tool,penColor,penWidth}=useStore(viewStore),[colors,setColors]=useState(false);
  useEffect(()=>setColors(false),[tool]);
  if(!['freehand','guided','line','arrow','eraser'].includes(tool))return null;
  const pencil=tool==='freehand'||tool==='guided';
  return <div className="pen-tools" aria-label={t('Opciones del lápiz')} onPointerDown={e=>e.stopPropagation()}>
    <div className="pen-controls">
      <strong>{tool==='guided'?t('Lápiz guiado'):tool==='freehand'?t('Lápiz libre'):tool==='eraser'?t('Goma'):tool==='arrow'?t('Flecha'):t('Línea')}</strong>
      {tool!=='eraser'&&<><button className="pen-color" aria-label={t('Color del lápiz')} aria-expanded={colors} onClick={()=>setColors(!colors)}><span style={{background:penColor}}/>{t('Color')}</button><label>{t('Grosor')}<select aria-label={t('Grosor del lápiz')} value={penWidth} onChange={e=>viewStore.set({penWidth:+e.target.value})}>{[1,2,4,6,8].map(v=><option key={v} value={v}>{v} px</option>)}</select></label></>}
      {pencil&&<button aria-pressed={tool==='guided'} onClick={()=>viewStore.set({tool:tool==='guided'?'freehand':'guided'})}>{t('✦ Guiado')}</button>}
      <button onClick={()=>viewStore.set({tool:tool==='eraser'?'freehand':'eraser'})}>{tool==='eraser'?t('Volver al lápiz'):t('Goma')}</button>
      <button onClick={()=>viewStore.set({tool:'select'})}>{t('Listo')}</button>
    </div>
    {colors&&tool!=='eraser'&&<ColorPicker value={penColor} onChange={color=>{viewStore.set({penColor:color});setColors(false);}}/>}
    <small aria-live="polite">{tool==='guided'?(guideLabel?t('{0} · Soltá para guardarlo.',guideLabel):t('Suaviza tu trazo y emprolija líneas, círculos, óvalos y rectángulos al soltar. Mantené presionado para ver la forma antes.')):tool==='eraser'?t('Pasá por los trazos para borrarlos. Deshacer los recupera.'):pencil?t('Dibujá o escribí libremente. Esc vuelve a seleccionar.'):t('Mantené Shift para líneas horizontales, verticales o a 45°.')}</small>
  </div>;
}
