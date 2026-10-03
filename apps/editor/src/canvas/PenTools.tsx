import {useEffect,useState} from 'react';
import {ColorPicker} from '../palette/ColorPicker';
import {useStore} from '../store/createStore';
import {viewStore} from '../store/viewStore';

export function PenTools({guideLabel}:{guideLabel?:string}){
  const {tool,penColor,penWidth}=useStore(viewStore),[colors,setColors]=useState(false);
  useEffect(()=>setColors(false),[tool]);
  if(!['freehand','guided','line','arrow','eraser'].includes(tool))return null;
  const pencil=tool==='freehand'||tool==='guided';
  return <div className="pen-tools" aria-label="Opciones del lápiz" onPointerDown={e=>e.stopPropagation()}>
    <div className="pen-controls">
      <strong>{tool==='guided'?'Lápiz guiado':tool==='freehand'?'Lápiz libre':tool==='eraser'?'Goma':tool==='arrow'?'Flecha':'Línea'}</strong>
      {tool!=='eraser'&&<><button className="pen-color" aria-label="Color del lápiz" aria-expanded={colors} onClick={()=>setColors(!colors)}><span style={{background:penColor}}/>Color</button><label>Grosor<select aria-label="Grosor del lápiz" value={penWidth} onChange={e=>viewStore.set({penWidth:+e.target.value})}>{[1,2,4,6,8].map(v=><option key={v} value={v}>{v} px</option>)}</select></label></>}
      {pencil&&<button aria-pressed={tool==='guided'} onClick={()=>viewStore.set({tool:tool==='guided'?'freehand':'guided'})}>✦ Guiado</button>}
      <button onClick={()=>viewStore.set({tool:tool==='eraser'?'freehand':'eraser'})}>{tool==='eraser'?'Volver al lápiz':'Goma'}</button>
      <button onClick={()=>viewStore.set({tool:'select'})}>Listo</button>
    </div>
    {colors&&tool!=='eraser'&&<ColorPicker value={penColor} onChange={color=>{viewStore.set({penColor:color});setColors(false);}}/>}
    <small aria-live="polite">{tool==='guided'?(guideLabel?`${guideLabel} · Soltá para guardarlo.`:'Suaviza tu trazo y emprolija líneas, círculos, óvalos y rectángulos al soltar. Mantené presionado para ver la forma antes.'):tool==='eraser'?'Pasá por los trazos para borrarlos. Deshacer los recupera.':pencil?'Dibujá o escribí libremente. Esc vuelve a seleccionar.':'Mantené Shift para líneas horizontales, verticales o a 45°.'}</small>
  </div>;
}
