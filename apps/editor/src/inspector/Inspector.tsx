import {ARROWS,LINES,PORTS,SHAPES,assetBytes,documentBounds,fitSize,rootGroupId,type ActionInput,type DiagramDocument,type DiagramDrawing,type DiagramEdge,type DiagramFrame,type DiagramNode,type DiagramZone,type Rect} from '@diagramia/core';
import {useStore} from '../store/createStore';
import {documentStore,transact} from '../store/documentStore';
import {kindOf,select,selectionStore} from '../store/selectionStore';
import {fit,viewStore} from '../store/viewStore';
import {arrange,deleteSelection,duplicate,group,ungroup} from '../commands';
import {CREATABLE_KINDS,KIND_LABELS,NumberField,SelectField,TextField} from '../ui';
import {Annotations} from './Annotations';
import {IconPicker,SaveAsElement,StylePresets} from './Appearance';
import {LinkPreview} from './LinkPreview';
import {ARROW_LABELS,ColorField,EdgeStyleFields,LINE_LABELS,NodeStyleFields,ZoneStyleFields} from './StyleFields';

const SHAPE_LABELS:Record<typeof SHAPES[number],string>={rectangle:'Rectángulo',rounded:'Redondeado',ellipse:'Elipse',circle:'Círculo',diamond:'Rombo',triangle:'Triángulo',hexagon:'Hexágono',parallelogram:'Paralelogramo',trapezoid:'Trapecio',star:'Estrella',cloud:'Nube',cylinder:'Cilindro',note:'Nota',text:'Sólo texto',terminator:'Inicio / fin',document:'Documento',predefined:'Subproceso','manual-input':'Entrada manual',delay:'Espera',actor:'Actor (figura)',class:'Clase UML',package:'Paquete',component:'Componente',start:'Inicio (punto)',end:'Fin (diana)',sticky:'Nota adhesiva',card:'Tarjeta con encabezado',bubble:'Globo de diálogo',pill:'Píldora',avatar:'Avatar',badge:'Insignia',ribbon:'Cinta',folder:'Carpeta',browser:'Ventana',chevron:'Paso (chevron)',map:'Mapa'};
const SHAPE_OPTIONS=[['','Según el tipo'] as const,...SHAPES.map(shape=>[shape,SHAPE_LABELS[shape]] as const)];
const ARROW_OPTIONS=ARROWS.map(arrow=>[arrow,ARROW_LABELS[arrow]] as const),LINE_OPTIONS=LINES.map(line=>[line,LINE_LABELS[line]] as const);


const PORT_LABELS={auto:'Automático',top:'Arriba',right:'Derecha',bottom:'Abajo',left:'Izquierda'} as const;
const PORT_OPTIONS=PORTS.map(p=>[p,PORT_LABELS[p]] as const);

function BoundsFields({rect,minSize,onCommit}:{rect:Rect;minSize:number;onCommit:(rect:Rect)=>void}){
  return <div className="field-grid">
    <NumberField label="X" value={rect.x} onCommit={x=>onCommit({...rect,x})}/>
    <NumberField label="Y" value={rect.y} onCommit={y=>onCommit({...rect,y})}/>
    <NumberField label="Ancho" value={rect.width} min={minSize} onCommit={width=>onCommit({...rect,width})}/>
    <NumberField label="Alto" value={rect.height} min={minSize} onCommit={height=>onCommit({...rect,height})}/>
  </div>;
}

function NodeInspector({doc,node,focusToken}:{doc:DiagramDocument;node:DiagramNode;focusToken:number}){
  const update=(changes:Extract<ActionInput,{type:'UPDATE_NODE'}>['changes'],label:string)=>transact([{type:'UPDATE_NODE',id:node.id,changes}],label);
  const root=rootGroupId(doc,node.id),rootGroup=doc.groups.find(g=>g.id===root);
  const kinds=(CREATABLE_KINDS.includes(node.kind)?CREATABLE_KINDS:[...CREATABLE_KINDS,node.kind]).map(k=>[k,KIND_LABELS[k]] as const);
  const asset=doc.assets.find(a=>a.id===node.assetId);
  return <>
    <TextField label="Nombre" value={node.label} focusToken={focusToken} maxLength={200} onCommit={label=>update({label},'Nombre cambiado')}/>
    <TextField label="Subtítulo" value={node.subtitle} allowEmpty maxLength={120} onCommit={subtitle=>update({subtitle},'Subtítulo cambiado')}/>
    {asset?<p className="inline-note">Imagen «{asset.label}» · {asset.mediaType.replace('image/','').replace('+xml','').toUpperCase()} · {asset.width} × {asset.height} px · {Math.max(1,Math.round(assetBytes(asset.data)/1024))} KB. Viaja dentro del documento; al eliminar el nodo, la imagen se va con él.</p>
      :<><SelectField label="Tipo" value={node.kind} options={kinds} onChange={kind=>update({kind},'Tipo cambiado')}/>
      <SelectField label="Forma" value={node.shape??''} options={SHAPE_OPTIONS} onChange={shape=>update({shape:shape||null},'Forma cambiada')}/>
      <IconPicker node={node}/>
      <TextField label="Enlace (https://…)" value={node.link??''} allowEmpty maxLength={2000} onCommit={link=>update({link:link.trim()||null},link.trim()?'Enlace cambiado':'Enlace quitado')}/>
      <LinkPreview node={node}/>
      <TextField label="Detalle (un renglón por línea; «--» separa secciones)" value={node.details} multiline allowEmpty maxLength={2000} onCommit={details=>update({details},'Detalle cambiado')}/></>}
    <SelectField label="Zona" value={node.zoneId??''} options={[['','Sin zona'],...doc.zones.map(z=>[z.id,`${z.label} · ${z.id}`] as const)]}
      onChange={zoneId=>zoneId?transact([{type:'MOVE_NODE',id:node.id,placement:{inside:zoneId}}],'Nodo movido a la zona'):update({zoneId:null},'Nodo liberado de la zona')}/>
    <BoundsFields rect={{...node.position,...node.size}} minSize={24} onCommit={r=>transact([{type:'RESIZE_NODE',id:node.id,size:{width:r.width,height:r.height},position:{x:r.x,y:r.y}}],'Geometría cambiada')}/>
    {!asset&&<button onClick={()=>{const need=fitSize(node);transact([{type:'RESIZE_NODE',id:node.id,size:{width:Math.max(24,need.width),height:Math.max(24,need.height)}}],'Tamaño ajustado al texto');}}>Ajustar el tamaño al texto</button>}
    {!asset&&<StylePresets nodes={[node]}/>}
    {!asset&&<details className="style-details"><summary>Más opciones de estilo</summary><NodeStyleFields node={node} onStyle={style=>update({style},'Estilo cambiado')}/></details>}
    {rootGroup&&<div className="inline-note">
      <TextField label={`Grupo · ${rootGroup.id}`} value={rootGroup.label} allowEmpty maxLength={200} onCommit={label=>transact([{type:'UPDATE_GROUP',id:rootGroup.id,changes:{label}}],'Grupo renombrado')}/>
      <button onClick={ungroup}>Desagrupar</button>
    </div>}
  </>;
}

function EdgeInspector({doc,edge,focusToken}:{doc:DiagramDocument;edge:DiagramEdge;focusToken:number}){
  const update=(changes:Extract<ActionInput,{type:'UPDATE_EDGE'}>['changes'],label:string)=>transact([{type:'UPDATE_EDGE',id:edge.id,changes}],label);
  const name=(id:string)=>doc.nodes.find(n=>n.id===id)?.label??id;
  return <>
    <p className="inline-note">{name(edge.from)} → {name(edge.to)}</p>
    <TextField label="Etiqueta" value={edge.label} allowEmpty focusToken={focusToken} maxLength={160} onCommit={label=>update({label},'Etiqueta cambiada')}/>
    <SelectField label="Recorrido" value={edge.line} options={LINE_OPTIONS} onChange={line=>update({line,points:null},'Recorrido cambiado')}/>
    <div className="field-grid">
      <SelectField label="Punta al inicio" value={edge.startArrow} options={ARROW_OPTIONS} onChange={startArrow=>update({startArrow},'Punta cambiada')}/>
      <SelectField label="Punta al final" value={edge.endArrow} options={ARROW_OPTIONS} onChange={endArrow=>update({endArrow},'Punta cambiada')}/>
    </div>
    <div className="field-grid">
      <SelectField label="Sale por" value={edge.fromPort} options={PORT_OPTIONS} onChange={fromPort=>update({fromPort},'Puerto cambiado')}/>
      <SelectField label="Llega por" value={edge.toPort} options={PORT_OPTIONS} onChange={toPort=>update({toPort},'Puerto cambiado')}/>
    </div>
    {(edge.fromAnchor||edge.toAnchor)&&<><p className="inline-note">Tiene {edge.fromAnchor&&edge.toAnchor?'los dos extremos enganchados':'un extremo enganchado'} en un punto fijo del borde. Arrastrá los extremos en el canvas para moverlos.</p><button onClick={()=>update({fromAnchor:null,toAnchor:null},'Enganches liberados')}>Volver a enganche automático</button></>}
    <button onClick={()=>update({from:edge.to,to:edge.from,fromAnchor:edge.toAnchor,toAnchor:edge.fromAnchor},'Dirección invertida')}>Invertir dirección</button>
    <EdgeStyleFields edge={edge} onStyle={style=>update({style},'Estilo cambiado')}/>
    {edge.points&&<><p className="inline-note">Esta conexión tiene una ruta manual de {edge.points.length} puntos.</p><button onClick={()=>update({points:null},'Ruta recalculada')}>Recalcular ruta automática</button></>}
  </>;
}

function ZoneInspector({doc,zone,focusToken}:{doc:DiagramDocument;zone:DiagramZone;focusToken:number}){
  const members=doc.nodes.filter(n=>n.zoneId===zone.id),twins=doc.zones.filter(z=>z.id!==zone.id&&z.label.trim().toLowerCase()===zone.label.trim().toLowerCase());
  return <>
    <TextField label="Nombre" value={zone.label} focusToken={focusToken} maxLength={200} onCommit={label=>transact([{type:'UPDATE_ZONE',id:zone.id,changes:{label}}],'Zona renombrada')}/>
    {twins.length>0&&<p className="inline-note warn">⚠ Hay {twins.length} zona(s) más con este nombre ({twins.map(z=>z.id).join(', ')}). Una instrucción por nombre va a pedir el ID para no adivinar.</p>}
    <BoundsFields rect={zone.bounds} minSize={100} onCommit={bounds=>transact(bounds.x!==zone.bounds.x||bounds.y!==zone.bounds.y?[{type:'MOVE_ZONE',id:zone.id,position:{x:bounds.x,y:bounds.y}},{type:'UPDATE_ZONE',id:zone.id,changes:{bounds}}]:[{type:'UPDATE_ZONE',id:zone.id,changes:{bounds}}],'Límites de zona cambiados')}/>
    <ZoneStyleFields zone={zone} onStyle={style=>transact([{type:'UPDATE_ZONE',id:zone.id,changes:{style}}],'Estilo cambiado')}/>
    <p className="inline-note">{members.length} nodo(s) pertenecen a esta zona. Moverla los mueve con ella; achicarla por debajo de sus nodos se rechaza.</p>
    <button disabled={!members.length} onClick={()=>select(members.map(n=>n.id))}>Seleccionar nodos de la zona</button>
    <button onClick={()=>transact([{type:'DELETE_ZONE',id:zone.id,members:'release'}],'Zona eliminada; nodos liberados')}>Eliminar zona y conservar nodos</button>
    <button disabled={!members.length} onClick={()=>{if(confirm(`Se eliminan la zona y sus ${members.length} nodo(s). Podés deshacerlo.`))transact([{type:'DELETE_ZONE',id:zone.id,members:'delete'}],'Zona y nodos eliminados');}}>Eliminar zona con sus nodos</button>
  </>;
}

function FrameInspector({frame,focusToken}:{frame:DiagramFrame;focusToken:number}){
  return <>
    <TextField label="Nombre" value={frame.label} focusToken={focusToken} maxLength={200} onCommit={label=>transact([{type:'UPDATE_FRAME',id:frame.id,changes:{label}}],'Frame renombrado')}/>
    <BoundsFields rect={frame.bounds} minSize={100} onCommit={bounds=>transact([{type:'UPDATE_FRAME',id:frame.id,changes:{bounds}}],'Frame cambiado')}/>
    <p className="inline-note">Un frame es un encuadre de cámara: asignalo a un paso de la timeline para que la presentación enfoque esta área.</p>
    <button onClick={()=>fit(frame.bounds)}>Encuadrar la vista en este frame</button>
  </>;
}

function Arrange({count}:{count:number}){
  const align=[['left','Izquierda'],['center','Centro'],['right','Derecha'],['top','Arriba'],['middle','Medio'],['bottom','Abajo']] as const;
  return <fieldset className="arrange"><legend>Ordenar {count} nodos</legend>
    <div className="button-grid">{align.map(([mode,text])=><button key={mode} onClick={()=>arrange({type:'ALIGN_NODES',mode})}>{text}</button>)}</div>
    <div className="button-grid two">
      <button disabled={count<3} onClick={()=>arrange({type:'DISTRIBUTE_NODES',axis:'horizontal'})}>Distribuir ↔</button>
      <button disabled={count<3} onClick={()=>arrange({type:'DISTRIBUTE_NODES',axis:'vertical'})}>Distribuir ↕</button>
      <button onClick={()=>arrange({type:'LAYOUT_NODES',direction:'right'})}>Auto-layout →</button>
      <button onClick={()=>arrange({type:'LAYOUT_NODES',direction:'down'})}>Auto-layout ↓</button>
      <button onClick={group}>Agrupar</button>
      <button onClick={ungroup}>Desagrupar</button>
    </div>
    <p className="inline-note">Sólo se mueven los nodos seleccionados. Si el resultado no cabe en su zona, el cambio se rechaza y se explica.</p>
  </fieldset>;
}

function DrawingInspector({drawing}:{drawing:DiagramDrawing}){
  return <><p className="inline-note">{drawing.kind==='freehand'?'Trazo a mano':drawing.kind==='arrow'?'Flecha libre':'Línea'}</p><ColorField label="Color del trazo" value={drawing.style.stroke} fallback="#141619" onChange={stroke=>transact([{type:'UPDATE_DRAWING',id:drawing.id,changes:{style:{...drawing.style,stroke}}}],'Color del trazo cambiado')}/><NumberField label="Grosor del trazo" value={drawing.style.strokeWidth??2} min={.5} max={8} step={.5} onCommit={strokeWidth=>transact([{type:'UPDATE_DRAWING',id:drawing.id,changes:{style:{...drawing.style,strokeWidth}}}],'Grosor del trazo cambiado')}/></>;
}

export function Inspector(){
  const {doc}=useStore(documentStore),{ids}=useStore(selectionStore),{labelFocus,snap}=useStore(viewStore);
  if(!ids.length)return <div className="panel-body">
    <span className="eyebrow">DOCUMENTO / {doc.id}</span>
    <TextField label="Título" value={doc.title} maxLength={200} onCommit={title=>transact([{type:'UPDATE_DOCUMENT',changes:{title}}],'Título cambiado')}/>
    <p className="inline-note">{doc.nodes.length} nodos · {doc.edges.length} conexiones · {doc.zones.length} zonas · {doc.frames.length} frames · {doc.groups.length} grupos · {doc.animations.length} animaciones</p>
    <label className="check"><input type="checkbox" checked={snap} onChange={e=>viewStore.set({snap:e.target.checked})}/>Ajustar a la grilla de 8 px al mover y dibujar</label>
    <button disabled={!doc.nodes.length} onClick={()=>transact([{type:'ARRANGE_DOCUMENT',direction:'right'}],'Diagrama ordenado sin superposiciones')}>Ordenar todo sin superposiciones</button>
    <button onClick={()=>fit(documentBounds(doc))}>Encuadrar todo</button>
    <p className="inline-note">Seleccioná un elemento para editar sus propiedades. Doble clic sobre un nodo, zona o conexión edita su texto en el lugar.</p>
    <Annotations doc={doc}/>
  </div>;
  const kind=ids.length===1?kindOf(doc,ids[0]):null,nodes=doc.nodes.filter(n=>ids.includes(n.id));
  return <div className="panel-body">
    <span className="eyebrow">{kind?`${kind==='node'?'NODO':kind==='edge'?'CONEXIÓN':kind==='drawing'?'TRAZO':kind==='zone'?'ZONA':'FRAME'} / ${ids[0]}`:`SELECCIÓN / ${ids.length} ELEMENTOS`}</span>
    {kind==='node'&&<NodeInspector key={ids[0]} doc={doc} node={nodes[0]} focusToken={labelFocus}/>}
    {kind==='edge'&&<EdgeInspector key={ids[0]} doc={doc} edge={doc.edges.find(e=>e.id===ids[0])!} focusToken={labelFocus}/>}
    {kind==='zone'&&<ZoneInspector key={ids[0]} doc={doc} zone={doc.zones.find(z=>z.id===ids[0])!} focusToken={labelFocus}/>}
    {kind==='frame'&&<FrameInspector key={ids[0]} frame={doc.frames.find(f=>f.id===ids[0])!} focusToken={labelFocus}/>}
    {kind==='drawing'&&<DrawingInspector key={ids[0]} drawing={doc.drawings.find(d=>d.id===ids[0])!}/>}
    {nodes.length>1&&<StylePresets nodes={nodes}/>}
    {nodes.length>1&&<Arrange count={nodes.length}/>}
    {nodes.length>0&&<SaveAsElement count={nodes.length}/>}
    {kind&&<Annotations key={'notes-'+ids[0]} doc={doc} targetId={ids[0]}/>}
    <div className="button-grid two">
      <button disabled={!nodes.length} onClick={duplicate}>Duplicar</button>
      <button onClick={deleteSelection}>Eliminar</button>
    </div>
  </div>;
}
