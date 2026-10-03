import {useState} from 'react';
import {ICONS,fitSize,type ActionInput,type DiagramNode} from '@diagramia/core';
import {saveSelection} from '../library/ownLibrary';
import {transact} from '../store/documentStore';
import {ICON_PATHS} from '../canvas/DiagramLayer';

type Icon=typeof ICONS[number];
export const ICON_LABELS:Record<Icon,string>={user:'Persona',server:'Servidor',database:'Datos',cloud:'Nube',lock:'Candado',queue:'Lista',globe:'Web',bolt:'Rayo',mail:'Correo',gear:'Engranaje',
  users:'Equipo',heart:'Corazón',idea:'Idea',star:'Estrella',target:'Objetivo',flag:'Bandera',question:'Pregunta',check:'Hecho',alert:'Alerta',
  coin:'Dinero',cart:'Carrito',store:'Tienda',chart:'Gráfico',trend:'Crecimiento',briefcase:'Maletín',file:'Documento',calendar:'Calendario',clock:'Reloj',tag:'Etiqueta',box:'Caja',truck:'Envío',
  chat:'Mensaje',phone:'Celular',bell:'Aviso',laptop:'Computadora',wifi:'Internet',home:'Casa',building:'Edificio',pin:'Lugar',book:'Libro',graduation:'Graduación',pencil:'Lápiz',
  search:'Buscar',key:'Llave',shield:'Escudo',leaf:'Hoja',play:'Video',link:'Enlace',photo:'Imagen',
  car:'Auto',bus:'Micro',train:'Tren',plane:'Avión',ship:'Barco',bike:'Bicicleta',umbrella:'Playa',sun:'Sol',wave:'Mar',mountain:'Montaña',food:'Comida',coffee:'Café',
  bed:'Alojamiento',camera:'Foto',map:'Mapa',ticket:'Entradas',music:'Música',bag:'Compras',sparkle:'Destacado'};

/**
 * Estilos de un toque. Reemplazan colores, borde y negrita; conservan tamaño de letra, alineación e icono,
 * que el usuario pudo haber ajustado aparte.
 */
const PRESETS:[string,DiagramNode['style']][]=[
  ['Clásico',{}],['Cielo',{fill:'#e5ecff',stroke:'#b2c4f5'}],['Lima',{fill:'#eef9c4',stroke:'#b9d62f'}],['Durazno',{fill:'#ffe4d6',stroke:'#e8b39a'}],
  ['Menta',{fill:'#d9f5e8',stroke:'#9fd8bd'}],['Lavanda',{fill:'#ece6ff',stroke:'#beb0f0'}],['Rosa',{fill:'#fde2ef',stroke:'#efb0cd'}],['Nota',{fill:'#fff3b0',stroke:'#e0cd6a'}],
  ['Destacado',{fill:'#d4f246',stroke:'#141619',bold:true}],['Oscuro',{fill:'#141619',stroke:'#141619',textColor:'#ffffff'}],['Contorno',{fill:'#ffffff',stroke:'#245cf6',strokeWidth:2}],['Boceto',{fill:'#ffffff',stroke:'#606975',dash:'dashed'}]
];
const KEEP=['fontSize','align','italic','iconSize'] as const;
const kept=(style:DiagramNode['style'])=>Object.fromEntries(KEEP.filter(key=>style[key]!==undefined).map(key=>[key,style[key]]));

/** Aplica cambios a varios nodos y agranda los que dejarían de entrar (por ejemplo, al poner un icono grande). */
function restyle(nodes:DiagramNode[],change:(node:DiagramNode)=>Pick<DiagramNode,'style'|'icon'>,label:string){
  const actions:ActionInput[]=nodes.flatMap(node=>{
    const next={...node,...change(node)},need=fitSize(next),grow=need.width>node.size.width||need.height>node.size.height;
    return [{type:'UPDATE_NODE' as const,id:node.id,changes:change(node)},
      ...(grow?[{type:'RESIZE_NODE' as const,id:node.id,size:{width:Math.max(node.size.width,need.width),height:Math.max(node.size.height,need.height)}}]:[])];
  });
  transact(actions,label);
}

export function StylePresets({nodes}:{nodes:DiagramNode[]}){
  return <fieldset className="choice presets"><legend>Estilo rápido{nodes.length>1?` · ${nodes.length} elementos`:''}</legend>
    <div className="preset-grid">{PRESETS.map(([name,style])=>
      <button key={name} className="preset" title={name} onClick={()=>restyle(nodes,node=>({style:{...kept(node.style),...style},icon:node.icon}),`Estilo «${name}» aplicado`)}>
        <span className="preset-swatch" style={{background:style.fill??'var(--surface)',borderColor:style.stroke??'var(--line)',borderStyle:style.dash==='dashed'?'dashed':'solid',color:style.textColor??'var(--ink)'}} aria-hidden="true">Aa</span>{name}
      </button>)}
    </div>
  </fieldset>;
}

/** Icono del nodo en una grilla: se ve antes de elegir, que con casi cincuenta opciones importa. */
export function IconPicker({node}:{node:DiagramNode}){
  const choose=(icon:Icon|null)=>restyle([node],n=>({icon,style:n.style}),icon?'Icono cambiado':'Icono quitado');
  // El icono chico es el valor por defecto: se guarda quitando la clave, no con un valor más.
  const size=(iconSize:'small'|'large')=>restyle([node],n=>{const {iconSize:_previous,...style}=n.style;return {icon:n.icon,style:iconSize==='large'?{...style,iconSize}:style};},'Tamaño del icono cambiado');
  return <fieldset className="choice"><legend>Icono{node.icon?` · ${ICON_LABELS[node.icon]}`:''}</legend>
    {node.icon&&<div className="segmented" role="group" aria-label="Tamaño del icono">
      <button aria-pressed={node.style.iconSize!=='large'} className={node.style.iconSize!=='large'?'chosen':''} onClick={()=>size('small')}>Chico, en la esquina</button>
      <button aria-pressed={node.style.iconSize==='large'} className={node.style.iconSize==='large'?'chosen':''} onClick={()=>size('large')}>Grande, arriba</button>
    </div>}
    <details className="icon-details"><summary>{node.icon?'Cambiar icono':'Elegir un icono'}</summary>
      <div className="icon-grid">
        <button className={!node.icon?'chosen':''} aria-pressed={!node.icon} onClick={()=>choose(null)} title="Sin icono" aria-label="Sin icono">∅</button>
        {ICONS.map(icon=><button key={icon} className={node.icon===icon?'chosen':''} aria-pressed={node.icon===icon} onClick={()=>choose(icon)} title={ICON_LABELS[icon]} aria-label={ICON_LABELS[icon]}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d={ICON_PATHS[icon]}/></svg>
        </button>)}
      </div>
    </details>
  </fieldset>;
}

/** Guardar lo seleccionado como elemento propio, a la vista donde se edita: antes había que encontrarlo en la Biblioteca. */
export function SaveAsElement({count}:{count:number}){
  const [naming,setNaming]=useState(false),[name,setName]=useState('');
  const save=()=>{if(saveSelection(name)){setNaming(false);setName('');}};
  if(!naming)return <button className="save-element" onClick={()=>setNaming(true)}>✦ Guardar como elemento propio{count>1?` (${count})`:''}</button>;
  return <div className="save-element-form">
    <label className="field" htmlFor="element-name">Nombre del elemento</label>
    <input id="element-name" autoFocus maxLength={200} value={name} placeholder="Por ejemplo: Tarjeta de cliente" onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')save();if(e.key==='Escape')setNaming(false);}}/>
    <div className="button-grid two"><button className="primary" onClick={save}>Guardar</button><button onClick={()=>setNaming(false)}>Cancelar</button></div>
  </div>;
}
