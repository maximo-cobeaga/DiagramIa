import {useStore} from '../store/createStore';
import {viewStore,type NodeTemplate} from '../store/viewStore';
import {SHAPE_MIME} from '../canvas/Canvas';
import {shapeParts} from '../canvas/DiagramLayer';
import {shapeOf} from '@diagramia/core';

type Item=NodeTemplate&{name:string};
const item=(name:string,kind:NodeTemplate['kind'],shape:NodeTemplate['shape'],width=160,height=80,label=name):Item=>({name,kind,shape,label,size:{width,height}});
/**
 * Paleta de formas. `kind` conserva el significado (lo que la IA y la documentación entienden);
 * `shape` es sólo el dibujo. Las de «Arquitectura» no fijan forma: usan la habitual de su tipo.
 */
export const PALETTE:{title:string;items:Item[]}[]=[
  {title:'Arquitectura',items:[
    item('Servicio','service',null),item('Base de datos','database',null,160,88),item('Caché','cache',null),item('Cola','queue',null),
    item('Externo','external',null,160,80,'Sistema externo'),item('Actor','actor',null,150,64,'Usuario'),item('Decisión','decision',null,160,96,'¿Condición?'),item('Nota','note',null,176,88),item('Texto','text',null,160,40)
  ]},
  {title:'Básicas',items:[
    item('Rectángulo','custom','rectangle'),item('Redondeado','custom','rounded'),item('Elipse','custom','ellipse',160,88),item('Círculo','custom','circle',96,96),
    item('Rombo','custom','diamond',152,96),item('Triángulo','custom','triangle',128,104),item('Hexágono','custom','hexagon',160,88),item('Paralelogramo','custom','parallelogram',168,80),
    item('Trapecio','custom','trapezoid',168,80),item('Estrella','custom','star',112,104),item('Nube','custom','cloud',176,104),item('Cilindro','custom','cylinder',128,96)
  ]},
  {title:'Diagrama de flujo',items:[
    item('Inicio / fin','custom','terminator',152,56,'Inicio'),item('Proceso','custom','rectangle',160,72),item('Decisión','decision','diamond',160,96,'¿Condición?'),item('Datos','custom','parallelogram',168,72,'Entrada / salida'),
    item('Documento','custom','document',160,88),item('Subproceso','custom','predefined',168,72),item('Entrada manual','custom','manual-input',160,72),item('Espera','custom','delay',152,72),
    item('Preparación','custom','hexagon',168,72),item('Almacén','database','cylinder',128,96,'Datos')
  ]},
  {title:'UML',items:[
    item('Clase','custom','class',184,112,'NombreDeClase'),item('Actor','actor','actor',56,88),item('Caso de uso','custom','ellipse',176,80),item('Paquete','custom','package',176,104),
    item('Componente','custom','component',168,80),item('Estado','custom','rounded',152,64),item('Nota','note','note',176,88),item('Inicio','custom','start',36,36),item('Fin','custom','end',36,36)
  ]}
];

/** Miniatura de una forma, dibujada con el mismo código que el canvas. */
function Thumb({kind,shape}:{kind:Item['kind'];shape:Item['shape']}){
  const actual=shapeOf({kind,shape}),tall=actual==='actor',box=tall?{x:13,y:2,w:18,h:26}:actual==='start'||actual==='end'||actual==='circle'||actual==='star'?{x:9,y:2,w:26,h:26}:{x:3,y:5,w:38,h:20};
  const parts=shapeParts(actual,box);
  return <svg viewBox="0 0 44 30" aria-hidden="true" className={`thumb kind-${kind}`}>{parts.main}{parts.extra}{actual==='text'&&<text x="22" y="20" textAnchor="middle" className="thumb-text">Aa</text>}</svg>;
}

export function Palette(){
  const {tool,template}=useStore(viewStore);
  return <div className="palette">{PALETTE.map(group=><details key={group.title} open={group.title!=='UML'&&group.title!=='Diagrama de flujo'}>
    <summary>{group.title}</summary>
    <div className="palette-grid">{group.items.map(({name,...shape})=>{
      const chosen=tool==='node'&&template.kind===shape.kind&&template.shape===shape.shape&&template.label===shape.label;
      return <button key={group.title+name} className={'palette-item'+(chosen?' chosen':'')} aria-pressed={chosen} title={`${name}: clic y después clic en el canvas, o arrastrala`} draggable
        onClick={()=>viewStore.set({tool:'node',template:shape})} onDragStart={e=>{e.dataTransfer.setData(SHAPE_MIME,JSON.stringify(shape));e.dataTransfer.effectAllowed='copy';}}>
        <Thumb kind={shape.kind} shape={shape.shape}/><span>{name}</span>
      </button>;
    })}</div>
  </details>)}</div>;
}
