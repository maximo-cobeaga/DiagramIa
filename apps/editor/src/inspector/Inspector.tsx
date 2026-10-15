import {ARROWS,LINES,PORTS,SHAPES,assetBytes,documentBounds,fitSize,rootGroupId,selectionUnits,type ActionInput,type DiagramDocument,type DiagramDrawing,type DiagramEdge,type DiagramFrame,type DiagramNode,type DiagramZone,type Rect} from '@diagramia/core';
import {useStore} from '../store/createStore';
import {documentStore,transact} from '../store/documentStore';
import {kindOf,select,selectionStore} from '../store/selectionStore';
import {fit,viewStore} from '../store/viewStore';
import {alignSelection,arrange,deleteSelection,duplicate,group,ungroup} from '../commands';
import {CREATABLE_KINDS,KIND_LABELS,NumberField,SelectField,TextField} from '../ui';
import {Annotations} from './Annotations';
import {IconPicker,SaveAsElement,StylePresets} from './Appearance';
import {LinkPreview} from './LinkPreview';
import {ARROW_LABELS,ColorField,EdgeStyleFields,LINE_LABELS,NodeStyleFields,ZoneStyleFields} from './StyleFields';
import {textSizeActions} from '../commands/textSize';
import {t} from '../i18n';

const SHAPE_LABELS:Record<typeof SHAPES[number],string>={rectangle:t('Rectángulo'),rounded:t('Redondeado'),ellipse:t('Elipse'),circle:t('Círculo'),diamond:t('Rombo'),triangle:t('Triángulo'),hexagon:t('Hexágono'),parallelogram:t('Paralelogramo'),trapezoid:t('Trapecio'),star:t('Estrella'),cloud:t('Nube'),cylinder:t('Cilindro'),note:t('Nota'),text:t('Sólo texto'),terminator:t('Inicio / fin'),document:t('Documento'),predefined:t('Subproceso'),'manual-input':t('Entrada manual'),delay:t('Espera'),actor:t('Actor (figura)'),class:t('Clase UML'),package:t('Paquete'),component:t('Componente'),start:t('Inicio (punto)'),end:t('Fin (diana)'),sticky:t('Nota adhesiva'),card:t('Tarjeta con encabezado'),bubble:t('Globo de diálogo'),pill:t('Píldora'),avatar:t('Avatar'),badge:t('Insignia'),ribbon:t('Cinta'),folder:t('Carpeta'),browser:t('Ventana'),chevron:t('Paso (chevron)'),map:t('Mapa')};
const SHAPE_OPTIONS=[['',t('Según el tipo')] as const,...SHAPES.map(shape=>[shape,SHAPE_LABELS[shape]] as const)];
const ARROW_OPTIONS=ARROWS.map(arrow=>[arrow,ARROW_LABELS[arrow]] as const),LINE_OPTIONS=LINES.map(line=>[line,LINE_LABELS[line]] as const);


const PORT_LABELS={auto:t('Automático'),top:t('Arriba'),right:t('Derecha'),bottom:t('Abajo'),left:t('Izquierda')} as const;
const PORT_OPTIONS=PORTS.map(p=>[p,PORT_LABELS[p]] as const);

function BoundsFields({rect,minSize,onCommit}:{rect:Rect;minSize:number;onCommit:(rect:Rect)=>void}){
  return <div className="field-grid">
    <NumberField label="X" value={rect.x} onCommit={x=>onCommit({...rect,x})}/>
    <NumberField label="Y" value={rect.y} onCommit={y=>onCommit({...rect,y})}/>
    <NumberField label={t('Ancho')} value={rect.width} min={minSize} onCommit={width=>onCommit({...rect,width})}/>
    <NumberField label={t('Alto')} value={rect.height} min={minSize} onCommit={height=>onCommit({...rect,height})}/>
  </div>;
}

function NodeInspector({doc,node,focusToken}:{doc:DiagramDocument;node:DiagramNode;focusToken:number}){
  const update=(changes:Extract<ActionInput,{type:'UPDATE_NODE'}>['changes'],label:string)=>transact([{type:'UPDATE_NODE',id:node.id,changes}],label);
  const root=rootGroupId(doc,node.id),rootGroup=doc.groups.find(g=>g.id===root);
  const kinds=(CREATABLE_KINDS.includes(node.kind)?CREATABLE_KINDS:[...CREATABLE_KINDS,node.kind]).map(k=>[k,KIND_LABELS[k]] as const);
  const asset=doc.assets.find(a=>a.id===node.assetId);
  return <>
    <TextField label={t('Nombre')} value={node.label} focusToken={focusToken} maxLength={200} onCommit={label=>update({label},t('Nombre cambiado'))}/>
    <TextField label={t('Subtítulo')} value={node.subtitle} allowEmpty maxLength={120} onCommit={subtitle=>update({subtitle},t('Subtítulo cambiado'))}/>
    <div className="text-size-control"><NumberField label={t('Tamaño del nombre')} value={node.style.fontSize??15} min={8} max={48} onCommit={size=>transact(textSizeActions([node],size),t('Tamaño del nombre cambiado'))}/>
      <div className="text-size-actions"><button aria-label={t('Achicar texto')} disabled={(node.style.fontSize??15)<=8} onClick={()=>transact(textSizeActions([node],size=>size-2),t('Texto achicado'))}>A−</button><button aria-label={t('Agrandar texto')} disabled={(node.style.fontSize??15)>=48} onClick={()=>transact(textSizeActions([node],size=>size+2),t('Texto agrandado'))}>A+</button></div>
    </div>
    {asset?<p className="inline-note">{t('Imagen «')}{asset.label}» · {asset.mediaType.replace('image/','').replace('+xml','').toUpperCase()} · {asset.width} × {asset.height} px · {Math.max(1,Math.round(assetBytes(asset.data)/1024))} {t('KB. Viaja dentro del documento; al eliminar el nodo, la imagen se va con él.')}</p>
      :<><SelectField label={t('Tipo')} value={node.kind} options={kinds} onChange={kind=>update({kind},t('Tipo cambiado'))}/>
      <SelectField label={t('Forma')} value={node.shape??''} options={SHAPE_OPTIONS} onChange={shape=>update({shape:shape||null},t('Forma cambiada'))}/>
      <IconPicker node={node}/>
      <TextField label={t('Enlace (https://…)')} value={node.link??''} allowEmpty maxLength={2000} onCommit={link=>update({link:link.trim()||null},link.trim()?t('Enlace cambiado'):t('Enlace quitado'))}/>
      <LinkPreview node={node}/>
      <TextField label={t('Detalle (un renglón por línea; «--» separa secciones)')} value={node.details} multiline allowEmpty maxLength={2000} onCommit={details=>update({details},t('Detalle cambiado'))}/></>}
    <SelectField label={t('Zona')} value={node.zoneId??''} options={[['',t('Sin zona')],...doc.zones.map(z=>[z.id,`${z.label} · ${z.id}`] as const)]}
      onChange={zoneId=>zoneId?transact([{type:'MOVE_NODE',id:node.id,placement:{inside:zoneId}}],t('Nodo movido a la zona')):update({zoneId:null},t('Nodo liberado de la zona'))}/>
    <BoundsFields rect={{...node.position,...node.size}} minSize={24} onCommit={r=>transact([{type:'RESIZE_NODE',id:node.id,size:{width:r.width,height:r.height},position:{x:r.x,y:r.y}}],t('Geometría cambiada'))}/>
    {!asset&&<button onClick={()=>{const need=fitSize(node);transact([{type:'RESIZE_NODE',id:node.id,size:{width:Math.max(24,need.width),height:Math.max(24,need.height)}}],t('Tamaño ajustado al texto'));}}>{t('Ajustar el tamaño al texto')}</button>}
    {!asset&&<StylePresets nodes={[node]}/>}
    {!asset&&<details className="style-details"><summary>{t('Más opciones de estilo')}</summary><NodeStyleFields node={node} onStyle={style=>update({style},t('Estilo cambiado'))}/></details>}
    {rootGroup&&<div className="inline-note">
      <TextField label={t('Grupo · {0}',rootGroup.id)} value={rootGroup.label} allowEmpty maxLength={200} onCommit={label=>transact([{type:'UPDATE_GROUP',id:rootGroup.id,changes:{label}}],t('Grupo renombrado'))}/>
      <button onClick={ungroup}>{t('Desagrupar')}</button>
    </div>}
  </>;
}

function EdgeInspector({doc,edge,focusToken}:{doc:DiagramDocument;edge:DiagramEdge;focusToken:number}){
  const update=(changes:Extract<ActionInput,{type:'UPDATE_EDGE'}>['changes'],label:string)=>transact([{type:'UPDATE_EDGE',id:edge.id,changes}],label);
  const name=(id:string)=>doc.nodes.find(n=>n.id===id)?.label??id;
  return <>
    <p className="inline-note">{name(edge.from)} → {name(edge.to)}</p>
    <TextField label={t('Etiqueta')} value={edge.label} allowEmpty focusToken={focusToken} maxLength={160} onCommit={label=>update({label},t('Etiqueta cambiada'))}/>
    <SelectField label={t('Recorrido@@conexión')} value={edge.line} options={LINE_OPTIONS} onChange={line=>update({line,points:null},t('Recorrido cambiado'))}/>
    <div className="field-grid">
      <SelectField label={t('Punta al inicio')} value={edge.startArrow} options={ARROW_OPTIONS} onChange={startArrow=>update({startArrow},t('Punta cambiada'))}/>
      <SelectField label={t('Punta al final')} value={edge.endArrow} options={ARROW_OPTIONS} onChange={endArrow=>update({endArrow},t('Punta cambiada'))}/>
    </div>
    <div className="field-grid">
      <SelectField label={t('Sale por')} value={edge.fromPort} options={PORT_OPTIONS} onChange={fromPort=>update({fromPort},t('Puerto cambiado'))}/>
      <SelectField label={t('Llega por')} value={edge.toPort} options={PORT_OPTIONS} onChange={toPort=>update({toPort},t('Puerto cambiado'))}/>
    </div>
    {(edge.fromAnchor||edge.toAnchor)&&<><p className="inline-note">{t('Tiene')} {edge.fromAnchor&&edge.toAnchor?t('los dos extremos enganchados'):t('un extremo enganchado')} {t('en un punto fijo del borde. Arrastrá los extremos en el canvas para moverlos.')}</p><button onClick={()=>update({fromAnchor:null,toAnchor:null},t('Enganches liberados'))}>{t('Volver a enganche automático')}</button></>}
    <button onClick={()=>update({from:edge.to,to:edge.from,fromAnchor:edge.toAnchor,toAnchor:edge.fromAnchor},t('Dirección invertida'))}>{t('Invertir dirección')}</button>
    <EdgeStyleFields edge={edge} onStyle={style=>update({style},t('Estilo cambiado'))}/>
    {edge.points&&<><p className="inline-note">{t('Esta conexión tiene una ruta manual de')} {edge.points.length} {t('puntos.')}</p><button onClick={()=>update({points:null},t('Ruta recalculada'))}>{t('Recalcular ruta automática')}</button></>}
  </>;
}

function ZoneInspector({doc,zone,focusToken}:{doc:DiagramDocument;zone:DiagramZone;focusToken:number}){
  const members=doc.nodes.filter(n=>n.zoneId===zone.id),twins=doc.zones.filter(z=>z.id!==zone.id&&z.label.trim().toLowerCase()===zone.label.trim().toLowerCase());
  return <>
    <TextField label={t('Nombre')} value={zone.label} focusToken={focusToken} maxLength={200} onCommit={label=>transact([{type:'UPDATE_ZONE',id:zone.id,changes:{label}}],t('Zona renombrada'))}/>
    {twins.length>0&&<p className="inline-note warn">{t('⚠ Hay')} {twins.length} {t('zona(s) más con este nombre (')}{twins.map(z=>z.id).join(', ')}{t('). Una instrucción por nombre va a pedir el ID para no adivinar.')}</p>}
    <BoundsFields rect={zone.bounds} minSize={100} onCommit={bounds=>transact(bounds.x!==zone.bounds.x||bounds.y!==zone.bounds.y?[{type:'MOVE_ZONE',id:zone.id,position:{x:bounds.x,y:bounds.y}},{type:'UPDATE_ZONE',id:zone.id,changes:{bounds}}]:[{type:'UPDATE_ZONE',id:zone.id,changes:{bounds}}],t('Límites de zona cambiados'))}/>
    <ZoneStyleFields zone={zone} onStyle={style=>transact([{type:'UPDATE_ZONE',id:zone.id,changes:{style}}],t('Estilo cambiado'))}/>
    <p className="inline-note">{members.length} {t('nodo(s) pertenecen a esta zona. Moverla los mueve con ella; achicarla por debajo de sus nodos se rechaza.')}</p>
    <button disabled={!members.length} onClick={()=>select(members.map(n=>n.id))}>{t('Seleccionar nodos de la zona')}</button>
    <button onClick={()=>transact([{type:'DELETE_ZONE',id:zone.id,members:'release'}],t('Zona eliminada; nodos liberados'))}>{t('Eliminar zona y conservar nodos')}</button>
    <button disabled={!members.length} onClick={()=>{if(confirm(t('Se eliminan la zona y sus {0} nodo(s). Podés deshacerlo.',members.length)))transact([{type:'DELETE_ZONE',id:zone.id,members:'delete'}],t('Zona y nodos eliminados'));}}>{t('Eliminar zona con sus nodos')}</button>
  </>;
}

function FrameInspector({frame,focusToken}:{frame:DiagramFrame;focusToken:number}){
  return <>
    <TextField label={t('Nombre')} value={frame.label} focusToken={focusToken} maxLength={200} onCommit={label=>transact([{type:'UPDATE_FRAME',id:frame.id,changes:{label}}],t('Frame renombrado'))}/>
    <BoundsFields rect={frame.bounds} minSize={100} onCommit={bounds=>transact([{type:'UPDATE_FRAME',id:frame.id,changes:{bounds}}],t('Frame cambiado'))}/>
    <p className="inline-note">{t('Un frame es un encuadre de cámara: asignalo a un paso de la timeline para que la presentación enfoque esta área.')}</p>
    <button onClick={()=>fit(frame.bounds)}>{t('Encuadrar la vista en este frame')}</button>
  </>;
}

function Arrange({count,layoutAllowed}:{count:number;layoutAllowed:boolean}){
  const align=[['left',t('Izquierda')],['center',t('Centro')],['right',t('Derecha')],['top',t('Arriba')],['middle',t('Medio')],['bottom',t('Abajo')]] as const;
  return <fieldset className="arrange"><legend>{t('Ordenar')} {count} {t('piezas')}</legend>
    <div className="button-grid">{align.map(([mode,text])=><button key={mode} onClick={()=>alignSelection(mode)}>{text}</button>)}</div>
    <div className="button-grid two">
      <button disabled={count<3} onClick={()=>alignSelection('horizontal')}>{t('Distribuir ↔')}</button>
      <button disabled={count<3} onClick={()=>alignSelection('vertical')}>{t('Distribuir ↕')}</button>
      {layoutAllowed&&<><button onClick={()=>arrange({type:'LAYOUT_NODES',direction:'right'})}>{t('Auto-layout →')}</button>
      <button onClick={()=>arrange({type:'LAYOUT_NODES',direction:'down'})}>{t('Auto-layout ↓')}</button></>}
      <button onClick={group}>{t('Agrupar')}</button>
      <button onClick={ungroup}>{t('Desagrupar')}</button>
    </div>
    <p className="inline-note">{t('Sólo se acomodan las piezas seleccionadas. Los grupos conservan sus distancias internas.')}</p>
  </fieldset>;
}

function DrawingInspector({drawing}:{drawing:DiagramDrawing}){
  return <><p className="inline-note">{drawing.kind==='freehand'?t('Trazo a mano'):drawing.kind==='arrow'?t('Flecha libre'):t('Línea')}</p><ColorField label={t('Color del trazo')} value={drawing.style.stroke} fallback="#141619" onChange={stroke=>transact([{type:'UPDATE_DRAWING',id:drawing.id,changes:{style:{...drawing.style,stroke}}}],t('Color del trazo cambiado'))}/><NumberField label={t('Grosor del trazo')} value={drawing.style.strokeWidth??2} min={.5} max={8} step={.5} onCommit={strokeWidth=>transact([{type:'UPDATE_DRAWING',id:drawing.id,changes:{style:{...drawing.style,strokeWidth}}}],t('Grosor del trazo cambiado'))}/></>;
}

export function Inspector(){
  const {doc}=useStore(documentStore),{ids}=useStore(selectionStore),{labelFocus,snap}=useStore(viewStore);
  if(!ids.length)return <div className="panel-body">
    <span className="eyebrow">{t('DOCUMENTO /')} {doc.id}</span>
    <TextField label={t('Título')} value={doc.title} maxLength={200} onCommit={title=>transact([{type:'UPDATE_DOCUMENT',changes:{title}}],t('Título cambiado'))}/>
    <p className="inline-note">{doc.nodes.length} {t('nodos ·')} {doc.edges.length} {t('conexiones ·')} {doc.zones.length} {t('zonas ·')} {doc.frames.length} {t('frames ·')} {doc.groups.length} {t('grupos ·')} {doc.animations.length} {t('animaciones')}</p>
    <label className="check"><input type="checkbox" checked={snap} onChange={e=>viewStore.set({snap:e.target.checked})}/>{t('Ajustar a grilla y guías al mover (Alt mueve libre)')}</label>
    <button disabled={!doc.nodes.length} onClick={()=>transact([{type:'ARRANGE_DOCUMENT',direction:'right'}],t('Diagrama ordenado sin superposiciones'))}>{t('Ordenar todo sin superposiciones')}</button>
    <button onClick={()=>fit(documentBounds(doc))}>{t('Encuadrar todo')}</button>
    <p className="inline-note">{t('Seleccioná un elemento para editar sus propiedades. Doble clic sobre un nodo, zona o conexión edita su texto en el lugar.')}</p>
    <Annotations doc={doc}/>
  </div>;
  const kind=ids.length===1?kindOf(doc,ids[0]):null,nodes=doc.nodes.filter(n=>ids.includes(n.id));
  return <div className="panel-body">
    <span className="eyebrow">{kind?`${kind==='node'?t('NODO'):kind==='edge'?t('CONEXIÓN'):kind==='drawing'?t('TRAZO'):kind==='zone'?t('ZONA'):t('FRAME')} / ${ids[0]}`:t('SELECCIÓN / {0} ELEMENTOS',ids.length)}</span>
    {kind==='node'&&<NodeInspector key={ids[0]} doc={doc} node={nodes[0]} focusToken={labelFocus}/>}
    {kind==='edge'&&<EdgeInspector key={ids[0]} doc={doc} edge={doc.edges.find(e=>e.id===ids[0])!} focusToken={labelFocus}/>}
    {kind==='zone'&&<ZoneInspector key={ids[0]} doc={doc} zone={doc.zones.find(z=>z.id===ids[0])!} focusToken={labelFocus}/>}
    {kind==='frame'&&<FrameInspector key={ids[0]} frame={doc.frames.find(f=>f.id===ids[0])!} focusToken={labelFocus}/>}
    {kind==='drawing'&&<DrawingInspector key={ids[0]} drawing={doc.drawings.find(d=>d.id===ids[0])!}/>}
    {nodes.length>1&&<StylePresets nodes={nodes}/>}
    {selectionUnits(doc,ids).length>1&&<Arrange count={selectionUnits(doc,ids).length} layoutAllowed={nodes.length===ids.length&&nodes.every(n=>!n.groupId)}/>}
    {nodes.length>0&&<SaveAsElement count={nodes.length}/>}
    {kind&&<Annotations key={'notes-'+ids[0]} doc={doc} targetId={ids[0]}/>}
    <div className="button-grid two">
      <button onClick={duplicate}>{t('Duplicar')}</button>
      <button onClick={deleteSelection}>{t('Eliminar')}</button>
    </div>
  </div>;
}
