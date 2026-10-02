import {useEffect,useMemo,useRef,useState} from 'react';
import {anchorAt,contains,fitSize,groupMembers,nodeRect,overlaps,resolveMembership,routeAll,sampleAnimation,sampleTrackEffects,statesAt,unionRects,type ActionInput,type DiagramDocument,type Point,type Rect} from '@diagramia/core';
import {useStore} from '../store/createStore';
import {documentStore,newId,notify,transact} from '../store/documentStore';
import {kindOf,select,selectionStore} from '../store/selectionStore';
import {currentAnimation,playbackStore} from '../store/playbackStore';
import {snap,viewStore,zoomAt,type Camera,type NodeTemplate} from '../store/viewStore';
import {fitAll,moveActions,selectionUnit} from '../commands';
import {DiagramLayer} from './DiagramLayer';

type BoxKind='node'|'zone'|'frame';
type Anchor={x:number;y:number}|null;
type Gesture=
  |{type:'pan';cx:number;cy:number;camera:Camera}
  |{type:'marquee';start:Point;current:Point;additive:boolean}
  |{type:'move';start:Point;dx:number;dy:number;ids:string[];unit:string[];shift:boolean}
  |{type:'moveDrawing';start:Point;dx:number;dy:number;id:string}
  |{type:'box';kind:'zone'|'frame';id:string;start:Point;dx:number;dy:number}
  |{type:'resize';kind:BoxKind;id:string;handle:string;start:Point;original:Rect;rect:Rect}
  |{type:'draw';kind:'zone'|'frame';start:Point;current:Point}
  |{type:'stroke';kind:'line'|'arrow'|'freehand';points:Point[]}
  |{type:'place';at:Point}
  |{type:'connect';from:string;fromAnchor:Anchor;current:Point;target:string|null}
  |{type:'endpoint';edgeId:string;end:'from'|'to';fixed:Point;current:Point;target:string|null}
  |{type:'segment';edgeId:string;index:number;start:Point;original:Point[];points:Point[]};

const HANDLES=['nw','n','ne','e','se','s','sw','w'];
export const SHAPE_MIME='application/x-diagramia-shape';
const rectOf=(a:Point,b:Point):Rect=>({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(a.x-b.x),height:Math.abs(a.y-b.y)});
function resizeRect(o:Rect,handle:string,dx:number,dy:number,min:number):Rect{
  let {x,y,width,height}=o;
  if(handle.includes('e'))width=Math.max(min,o.width+dx);
  if(handle.includes('s'))height=Math.max(min,o.height+dy);
  if(handle.includes('w')){width=Math.max(min,o.width-dx);x=o.x+o.width-width;}
  if(handle.includes('n')){height=Math.max(min,o.height-dy);y=o.y+o.height-height;}
  return {x,y,width,height};
}
const boxOf=(doc:DiagramDocument,kind:BoxKind,id:string):Rect|undefined=>kind==='node'?(n=>n&&nodeRect(n))(doc.nodes.find(n=>n.id===id)):(kind==='zone'?doc.zones:doc.frames).find(x=>x.id===id)?.bounds;
const hit=(target:EventTarget|null)=>{
  const el=target instanceof Element?target.closest('[data-id]'):null;
  return el?{id:el.getAttribute('data-id')!,type:el.getAttribute('data-type') as 'node'|'edge'|'drawing'|'zone'|'frame'}:null;
};
const typing=(target:EventTarget|null)=>target instanceof HTMLElement&&(target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target.tagName));
/** Enganche fijo si el punto está cerca del borde del nodo; si está hacia el centro, la conexión elige el lado sola. */
function anchorNear(rect:Rect,point:Point,tolerance:number):Anchor{
  const edge=Math.min(point.x-rect.x,rect.x+rect.width-point.x,point.y-rect.y,rect.y+rect.height-point.y);
  return edge<=tolerance?anchorAt(rect,point):null;
}

/** Documento tal como se ve durante un gesto. El documento canónico sólo cambia al soltar, con una acción. */
function withGesture(doc:DiagramDocument,g:Gesture|null):DiagramDocument{
  if(!g)return doc;
  const reroute=(moved:Set<string>)=>doc.edges.map(e=>moved.has(e.from)||moved.has(e.to)?{...e,points:undefined}:e);
  const shift=(moved:Set<string>,dx:number,dy:number)=>doc.nodes.map(n=>moved.has(n.id)?{...n,position:{x:n.position.x+dx,y:n.position.y+dy}}:n);
  if(g.type==='move'&&(g.dx||g.dy)){const moved=new Set(g.ids);return {...doc,nodes:shift(moved,g.dx,g.dy),edges:reroute(moved)};}
  if(g.type==='moveDrawing'&&(g.dx||g.dy))return {...doc,drawings:doc.drawings.map(d=>d.id===g.id?{...d,points:d.points.map(p=>({x:p.x+g.dx,y:p.y+g.dy}))}:d)};
  if(g.type==='box'&&(g.dx||g.dy)){
    const move=<T extends {id:string;bounds:Rect}>(items:T[])=>items.map(x=>x.id===g.id?{...x,bounds:{...x.bounds,x:x.bounds.x+g.dx,y:x.bounds.y+g.dy}}:x);
    if(g.kind==='frame')return {...doc,frames:move(doc.frames)};
    const moved=new Set(doc.nodes.filter(n=>n.zoneId===g.id).map(n=>n.id));
    return {...doc,zones:move(doc.zones),nodes:shift(moved,g.dx,g.dy),edges:reroute(moved)};
  }
  if(g.type==='resize'){
    const {x,y,width,height}=g.rect;
    if(g.kind==='node')return {...doc,nodes:doc.nodes.map(n=>n.id===g.id?{...n,position:{x,y},size:{width,height}}:n),edges:reroute(new Set([g.id]))};
    if(g.kind==='zone')return {...doc,zones:doc.zones.map(z=>z.id===g.id?{...z,bounds:g.rect}:z)};
    return {...doc,frames:doc.frames.map(f=>f.id===g.id?{...f,bounds:g.rect}:f)};
  }
  if(g.type==='segment')return {...doc,edges:doc.edges.map(e=>e.id===g.edgeId?{...e,points:g.points}:e)};
  return doc;
}

/** Nodo nuevo a partir de la plantilla elegida en la paleta, centrado en `at` y con la pertenencia a zona que corresponda. */
function placeNode(doc:DiagramDocument,template:NodeTemplate,at:Point){
  const draft={kind:template.kind,shape:template.shape,label:template.label,subtitle:'',details:template.shape==='class'?'+ atributo: tipo\n--\n+ metodo(): tipo':'',style:{},assetId:null,icon:null};
  const need=fitSize(draft),size={width:Math.max(template.size.width,need.width),height:Math.max(template.size.height,need.height)},id=newId('node');
  const target=resolveMembership(doc,{x:snap(at.x-size.width/2),y:snap(at.y-size.height/2),...size});
  if(!transact([{type:'ADD_NODE',node:{id,kind:draft.kind,shape:draft.shape,label:draft.label,details:draft.details,position:target.position,size,zoneId:target.zoneId}}],'Nodo agregado'))return;
  select([id]);viewStore.set({tool:'select',editingId:id});
}

type Editable={id:string;kind:'node'|'edge'|'zone'|'frame';value:string;box:Rect;size:number;multiline:boolean};
/** Texto que se edita directamente sobre el canvas. Confirma con Enter o al salir; Esc cancela. */
function InlineEditor({target,camera}:{target:Editable;camera:Camera}){
  const [value,setValue]=useState(target.value),ref=useRef<HTMLTextAreaElement>(null),done=useRef(false);
  useEffect(()=>{ref.current?.focus();ref.current?.select();},[]);
  const finish=(save:boolean)=>{
    if(done.current)return;done.current=true;
    const text=value.replace(/\s+/g,' ').trim();
    viewStore.set({editingId:null});
    if(!save||text===target.value)return;
    if(!text&&target.kind!=='edge'){notify('El nombre no puede quedar vacío.','warn');return;}
    transact([target.kind==='node'?{type:'UPDATE_NODE',id:target.id,changes:{label:text}}:target.kind==='edge'?{type:'UPDATE_EDGE',id:target.id,changes:{label:text}}:target.kind==='zone'?{type:'UPDATE_ZONE',id:target.id,changes:{label:text}}:{type:'UPDATE_FRAME',id:target.id,changes:{label:text}}],'Texto cambiado');
  };
  const {box}=target,style={left:(box.x-camera.x)*camera.zoom,top:(box.y-camera.y)*camera.zoom,width:Math.max(90,box.width*camera.zoom),height:Math.max(28,box.height*camera.zoom),fontSize:Math.max(11,target.size*camera.zoom)};
  return <textarea ref={ref} className={'inline-editor kind-'+target.kind} style={style} value={value} maxLength={target.kind==='edge'?160:200} aria-label="Texto del elemento"
    onChange={e=>setValue(e.target.value)} onBlur={()=>finish(true)} onPointerDown={e=>e.stopPropagation()}
    onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();finish(true);}if(e.key==='Escape'){e.preventDefault();finish(false);}}}/>;
}

export function Canvas(){
  const {doc:saved}=useStore(documentStore),{camera,viewport,tool,template,staging,editingId}=useStore(viewStore),doc=staging?.doc??saved,stagedIds=useMemo(()=>staging?new Set(staging.changed):undefined,[staging]),{ids}=useStore(selectionStore),{animationId,time,scenarioId}=useStore(playbackStore);
  const [gesture,showGesture]=useState<Gesture|null>(null),[spaceHeld,setSpaceHeld]=useState(false);
  // El gesto vigente vive en una ref: los movimientos se renderizan con prioridad baja y, si el botón se suelta
  // enseguida, el estado de React todavía puede ser el anterior. La ref siempre tiene el último valor.
  const gestureRef=useRef<Gesture|null>(null);
  const setGesture=(next:Gesture|null)=>{gestureRef.current=next;showGesture(next);};
  const hostRef=useRef<HTMLDivElement>(null),svgRef=useRef<SVGSVGElement>(null);
  const pointers=useRef(new Map<number,Point>()),pinch=useRef<{distance:number;zoom:number}|null>(null),lastDown=useRef({id:'',at:0}),fitted=useRef(false),pendingEdit=useRef<string|null>(null);

  useEffect(()=>{
    const host=hostRef.current!;
    const observer=new ResizeObserver(([entry])=>{
      const {width,height}=entry.contentRect;if(!width||!height)return;
      viewStore.set({viewport:{width,height}});
      if(!fitted.current){fitted.current=true;fitAll(true);}
    });
    observer.observe(host);return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    // La rueda desplaza el canvas; con Ctrl/⌘ (o pellizco de trackpad) hace zoom hacia el cursor. Necesita un listener no pasivo.
    const svg=svgRef.current!;
    const wheel=(e:WheelEvent)=>{
      e.preventDefault();
      const current=viewStore.get().camera,box=svg.getBoundingClientRect();
      if(e.ctrlKey||e.metaKey)zoomAt(e.clientX-box.left,e.clientY-box.top,current.zoom*Math.exp(-e.deltaY*.002));
      else viewStore.set({camera:{...current,x:current.x+(e.shiftKey?e.deltaY:e.deltaX)/current.zoom,y:current.y+(e.shiftKey?0:e.deltaY)/current.zoom}});
    };
    svg.addEventListener('wheel',wheel,{passive:false});return()=>svg.removeEventListener('wheel',wheel);
  },[]);
  useEffect(()=>{
    const down=(e:KeyboardEvent)=>{if(e.code==='Space'&&!e.shiftKey&&!typing(e.target)&&!(e.target instanceof HTMLButtonElement)){e.preventDefault();setSpaceHeld(true);}};
    const up=(e:KeyboardEvent)=>{if(e.code==='Space')setSpaceHeld(false);};
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);
    return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);};
  },[]);

  const toWorld=(e:{clientX:number;clientY:number}):Point=>{
    const box=svgRef.current!.getBoundingClientRect(),current=viewStore.get().camera;
    return {x:current.x+(e.clientX-box.left)/current.zoom,y:current.y+(e.clientY-box.top)/current.zoom};
  };
  const selected=useMemo(()=>new Set(ids),[ids]);
  const visible=useMemo(()=>withGesture(doc,gesture),[doc,gesture]);
  // scenarioId no se usa directo: forma parte del estado suscripto para que cambiar de rama vuelva a dibujar.
  void scenarioId;
  const animation=currentAnimation(doc,animationId),sampled=animation?sampleAnimation(animation,time):null,effects=animation?sampleTrackEffects(animation,time):null,showing=sampled&&time>0;
  const single=ids.length===1&&!staging?kindOf(doc,ids[0]):null,resizable=single&&single!=='edge'?{kind:single as BoxKind,id:ids[0]}:null;
  const handleBox=resizable&&boxOf(visible,resizable.kind,resizable.id);
  const px=1/camera.zoom,routes=routeAll(visible);
  const edgeHandles=single==='edge'&&tool==='select'?(()=>{const edge=visible.edges.find(e=>e.id===ids[0]),points=routes.get(ids[0])?.points;return edge&&points&&points.length>1?{edge,points}:null;})():null;

  function down(e:React.PointerEvent<SVGSVGElement>){
    pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.current.size===2){
      const [a,b]=[...pointers.current.values()];
      pinch.current={distance:Math.hypot(a.x-b.x,a.y-b.y)||1,zoom:viewStore.get().camera.zoom};setGesture(null);return;
    }
    const world=toWorld(e),target=hit(e.target),handle=e.target instanceof Element?e.target.getAttribute('data-handle'):null;
    svgRef.current!.setPointerCapture(e.pointerId);
    // Con una propuesta en vista previa el canvas es de sólo lectura: cualquier arrastre desplaza la vista.
    if(e.button===1||tool==='pan'||spaceHeld||staging||(e.pointerType==='touch'&&!target&&!handle&&tool==='select')){
      e.preventDefault();setGesture({type:'pan',cx:e.clientX,cy:e.clientY,camera:viewStore.get().camera});return;
    }
    if(e.button!==0)return;
    playbackStore.set({playing:false});
    if(handle&&edgeHandles){
      const {points}=edgeHandles;
      if(handle==='end-from'||handle==='end-to'){const end=handle==='end-from'?'from':'to';setGesture({type:'endpoint',edgeId:ids[0],end,fixed:end==='from'?points[points.length-1]:points[0],current:world,target:null});return;}
      if(handle.startsWith('seg-')){setGesture({type:'segment',edgeId:ids[0],index:Number(handle.slice(4)),start:world,original:points,points});return;}
    }
    if(handle&&resizable){
      const original=boxOf(doc,resizable.kind,resizable.id)!;
      setGesture({type:'resize',...resizable,handle,start:world,original,rect:original});return;
    }
    if(tool==='node'){setGesture({type:'place',at:world});return;}
    if(tool==='line'||tool==='arrow'||tool==='freehand'){setGesture({type:'stroke',kind:tool,points:[world,world]});return;}
    if(tool==='zone'||tool==='frame'){setGesture({type:'draw',kind:tool,start:world,current:world});return;}
    if(tool==='connect'){
      if(target?.type==='node')setGesture({type:'connect',from:target.id,fromAnchor:anchorNear(boxOf(doc,'node',target.id)!,world,14*px),current:world,target:null});
      return;
    }
    if(!target){setGesture({type:'marquee',start:world,current:world,additive:e.shiftKey});return;}
    const now=performance.now(),double=lastDown.current.id===target.id&&now-lastDown.current.at<380;
    lastDown.current={id:target.id,at:now};
    const unit=target.type==='node'&&!e.altKey?selectionUnit(doc,target.id):[target.id];
    const next=e.shiftKey?(unit.every(id=>selected.has(id))?ids.filter(id=>!unit.includes(id)):[...ids,...unit]):selected.has(target.id)?ids:unit;
    select(next);
    // Doble clic: el texto se edita en el lugar. El editor se abre al soltar: si se abriera al presionar, el navegador
    // le sacaría el foco enseguida para dárselo al elemento presionado.
    if(double){select([target.id]);pendingEdit.current=target.id;return;}
    if(target.type==='node'&&next.includes(target.id))setGesture({type:'move',start:world,dx:0,dy:0,ids:next.filter(id=>doc.nodes.some(n=>n.id===id)),unit,shift:e.shiftKey});
    else if(target.type==='drawing'&&next.includes(target.id))setGesture({type:'moveDrawing',start:world,dx:0,dy:0,id:target.id});
    else if(target.type==='zone'||target.type==='frame')setGesture({type:'box',kind:target.type,id:target.id,start:world,dx:0,dy:0});
  }

  function move(e:React.PointerEvent<SVGSVGElement>){
    if(pointers.current.has(e.pointerId))pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pinch.current&&pointers.current.size===2){
      const [a,b]=[...pointers.current.values()],box=svgRef.current!.getBoundingClientRect();
      zoomAt((a.x+b.x)/2-box.left,(a.y+b.y)/2-box.top,pinch.current.zoom*Math.hypot(a.x-b.x,a.y-b.y)/pinch.current.distance);return;
    }
    if(gestureRef.current)setGesture(advance(gestureRef.current,e));
  }
  /** El gesto actualizado a la posición del puntero. También se aplica al soltar, para no depender del último movimiento. */
  function advance(g:Gesture,e:React.PointerEvent<SVGSVGElement>):Gesture{
    const world=toWorld(e);
    // El puntero está capturado por el SVG: el nodo de destino se busca por coordenadas, no por e.target.
    const nodeUnder=(except?:string)=>{const over=hit(document.elementFromPoint(e.clientX,e.clientY));return over?.type==='node'&&over.id!==except?over.id:null;};
    switch(g.type){
      case 'pan':viewStore.set({camera:{...g.camera,x:g.camera.x-(e.clientX-g.cx)/g.camera.zoom,y:g.camera.y-(e.clientY-g.cy)/g.camera.zoom}});return g;
      case 'marquee':case 'draw':return {...g,current:world};
      case 'stroke':{
        const last=g.points[g.points.length-1];
        if(Math.hypot(world.x-last.x,world.y-last.y)<2/viewStore.get().camera.zoom)return g;
        if(g.kind!=='freehand')return {...g,points:[g.points[0],world]};
        const points=[...g.points,world];
        return {...g,points:points.length>500?[...points.filter((_,i)=>i%2===0).slice(0,-1),world]:points};
      }
      case 'move':case 'moveDrawing':case 'box':return {...g,dx:snap(world.x-g.start.x),dy:snap(world.y-g.start.y)};
      case 'resize':return {...g,rect:resizeRect(g.original,g.handle,snap(world.x-g.start.x),snap(world.y-g.start.y),g.kind==='node'?24:100)};
      case 'connect':return {...g,current:world,target:nodeUnder(g.from)};
      case 'endpoint':return {...g,current:world,target:nodeUnder()};
      case 'segment':{
        // Un tramo se corre perpendicular a sí mismo; los tramos vecinos se estiran para acompañarlo.
        const a=g.original[g.index],b=g.original[g.index+1],vertical=a.x===b.x,delta=snap(vertical?world.x-g.start.x:world.y-g.start.y);
        return {...g,points:g.original.map((p,i)=>i===g.index||i===g.index+1?(vertical?{x:p.x+delta,y:p.y}:{x:p.x,y:p.y+delta}):p)};
      }
      default:return g;
    }
  }

  function up(e:React.PointerEvent<SVGSVGElement>){
    pointers.current.delete(e.pointerId);
    if(pointers.current.size<2)pinch.current=null;
    const g=gestureRef.current&&advance(gestureRef.current,e);setGesture(null);
    if(pendingEdit.current){viewStore.set({editingId:pendingEdit.current});pendingEdit.current=null;return;}
    if(!g)return;
    const tolerance=14/viewStore.get().camera.zoom;
    switch(g.type){
      case 'place':placeNode(doc,template,g.at);break;
      case 'stroke':{
        const points=g.points;
        if(points.length<2||Math.hypot(points.at(-1)!.x-points[0].x,points.at(-1)!.y-points[0].y)<4/viewStore.get().camera.zoom){notify('Arrastrá un poco más para dibujar.','warn');break;}
        const id=newId('drawing');
        if(transact([{type:'ADD_DRAWING',drawing:{id,kind:g.kind,points,style:{}}}],g.kind==='freehand'?'Trazo dibujado':g.kind==='arrow'?'Flecha libre creada':'Línea creada')){select([id]);viewStore.set({tool:'select'});}
        break;
      }
      case 'draw':{
        const raw=rectOf(g.start,g.current),bounds={x:snap(raw.x),y:snap(raw.y),width:snap(raw.width),height:snap(raw.height)};
        if(bounds.width<100||bounds.height<100){notify('Arrastrá para dibujar el área: el mínimo es 100 × 100.','warn');break;}
        const id=newId(g.kind);
        // Una zona nueva adopta los nodos sin zona que quedaron completamente adentro.
        const actions:ActionInput[]=g.kind==='frame'
          ?[{type:'CREATE_FRAME',frame:{id,label:`Frame ${doc.frames.length+1}`,bounds}}]
          :[{type:'CREATE_ZONE',zone:{id,label:'Nueva zona',bounds}},...doc.nodes.filter(n=>!n.zoneId&&contains(bounds,nodeRect(n))).map(n=>({type:'UPDATE_NODE' as const,id:n.id,changes:{zoneId:id}}))];
        if(transact(actions,g.kind==='frame'?'Frame creado':`Zona creada con ${actions.length-1} nodo(s)`)){select([id]);viewStore.set({tool:'select',editingId:id});}
        break;
      }
      case 'move':
        if(g.dx||g.dy)transact(moveActions(doc,g.ids,g.dx,g.dy),g.ids.length>1?`${g.ids.length} nodos movidos`:'Nodo movido');
        else if(!g.shift&&ids.length>g.unit.length)select(g.unit);
        break;
      case 'moveDrawing':
        if(g.dx||g.dy){const drawing=doc.drawings.find(d=>d.id===g.id);if(drawing)transact([{type:'UPDATE_DRAWING',id:g.id,changes:{points:drawing.points.map(p=>({x:p.x+g.dx,y:p.y+g.dy}))}}],'Trazo movido');}
        break;
      case 'box':{
        if(!g.dx&&!g.dy)break;
        const b=boxOf(doc,g.kind,g.id)!,position={x:b.x+g.dx,y:b.y+g.dy};
        transact([g.kind==='zone'?{type:'MOVE_ZONE',id:g.id,position}:{type:'UPDATE_FRAME',id:g.id,changes:{bounds:{...b,...position}}}],g.kind==='zone'?'Zona movida con sus nodos':'Frame movido');
        break;
      }
      case 'resize':{
        const {x,y,width,height}=g.rect,o=g.original;
        if(x===o.x&&y===o.y&&width===o.width&&height===o.height)break;
        transact([g.kind==='node'?{type:'RESIZE_NODE',id:g.id,size:{width,height},position:{x,y}}:{type:g.kind==='zone'?'UPDATE_ZONE':'UPDATE_FRAME',id:g.id,changes:{bounds:g.rect}}],'Tamaño cambiado');
        break;
      }
      case 'connect':
        if(g.target){
          const id=newId('edge'),toAnchor=anchorNear(boxOf(doc,'node',g.target)!,g.current,tolerance);
          if(transact([{type:'ADD_EDGE',edge:{id,from:g.from,to:g.target,fromAnchor:g.fromAnchor,toAnchor}}],'Conexión creada'))select([id]);
        }
        break;
      case 'endpoint':
        if(g.target){
          const anchor=anchorNear(boxOf(doc,'node',g.target)!,g.current,tolerance);
          transact([{type:'UPDATE_EDGE',id:g.edgeId,changes:g.end==='from'?{from:g.target,fromAnchor:anchor,fromPort:'auto'}:{to:g.target,toAnchor:anchor,toPort:'auto'}}],anchor?'Extremo enganchado en ese punto':'Extremo conectado');
        }
        break;
      case 'segment':
        if(g.points.some((p,i)=>p.x!==g.original[i].x||p.y!==g.original[i].y))transact([{type:'UPDATE_EDGE',id:g.edgeId,changes:{points:g.points}}],'Recorrido de la conexión ajustado');
        break;
      case 'marquee':{
        const area=rectOf(g.start,g.current);
        if(area.width<3&&area.height<3){if(!g.additive)select([]);break;}
        const inside=[...doc.nodes.filter(n=>overlaps(area,nodeRect(n))).map(n=>n.id),...[...doc.zones,...doc.frames].filter(x=>contains(area,x.bounds)).map(x=>x.id)];
        const nodes=new Set(inside);
        select([...(g.additive?ids:[]),...inside,...doc.edges.filter(edge=>nodes.has(edge.from)&&nodes.has(edge.to)).map(edge=>edge.id)]);
        break;
      }
    }
  }
  // Una forma arrastrada desde la paleta se crea donde se suelta.
  function drop(e:React.DragEvent){
    const raw=e.dataTransfer.getData(SHAPE_MIME);if(!raw||staging)return;
    e.preventDefault();
    try{placeNode(saved,JSON.parse(raw) as NodeTemplate,toWorld(e));}catch{/* un arrastre ajeno a la paleta no hace nada */}
  }

  // Contornos de los grupos que tienen algún miembro seleccionado.
  const groupBoxes=useMemo(()=>visible.groups.map(g=>{
    const members=groupMembers(visible,g.id);
    if(!members.some(id=>selected.has(id)))return null;
    const box=unionRects(visible.nodes.filter(n=>members.includes(n.id)).map(nodeRect));
    return box&&{id:g.id,label:g.label,box};
  }).filter(x=>x!==null),[visible,selected]);
  const escaped=gesture?.type==='resize'&&gesture.kind==='zone'?visible.nodes.filter(n=>n.zoneId===gesture.id&&!contains(gesture.rect,nodeRect(n))):[];
  const draft=gesture&&(gesture.type==='marquee'||gesture.type==='draw')?rectOf(gesture.start,gesture.current):null;
  const empty=!doc.nodes.length&&!doc.zones.length&&!doc.frames.length&&!doc.drawings.length;
  const cursor=gesture?.type==='pan'?'grabbing':tool==='pan'||spaceHeld||staging?'grab':tool==='select'?'default':'crosshair';
  const wire=gesture?.type==='connect'?{from:(r=>({x:r.x+(gesture.fromAnchor?.x??.5)*r.width,y:r.y+(gesture.fromAnchor?.y??.5)*r.height}))(nodeRect(doc.nodes.find(n=>n.id===gesture.from)!)),to:gesture.current,ready:Boolean(gesture.target)}
    :gesture?.type==='endpoint'?{from:gesture.fixed,to:gesture.current,ready:Boolean(gesture.target)}:null;
  const wireTarget=gesture&&(gesture.type==='connect'||gesture.type==='endpoint')&&gesture.target?boxOf(doc,'node',gesture.target):null;

  // Elemento en edición de texto y la caja de pantalla donde se escribe.
  const editing=useMemo(():Editable|null=>{
    if(!editingId||staging)return null;
    const n=doc.nodes.find(x=>x.id===editingId);if(n)return {id:n.id,kind:'node',value:n.label,box:nodeRect(n),size:n.style.fontSize??15,multiline:true};
    const e=doc.edges.find(x=>x.id===editingId),routed=routes.get(editingId);
    if(e&&routed){const at=routed.label??routed.points[Math.floor(routed.points.length/2)];return {id:e.id,kind:'edge',value:e.label,box:{x:at.x-80,y:at.y-22,width:160,height:28},size:11,multiline:false};}
    const z=doc.zones.find(x=>x.id===editingId);if(z)return {id:z.id,kind:'zone',value:z.label,box:{x:z.bounds.x+10,y:z.bounds.y+8,width:Math.min(260,z.bounds.width-20),height:26},size:12,multiline:false};
    const f=doc.frames.find(x=>x.id===editingId);if(f)return {id:f.id,kind:'frame',value:f.label,box:{x:f.bounds.x,y:f.bounds.y-30,width:220,height:26},size:11,multiline:false};
    return null;
  },[editingId,doc,staging,routes]);
  useEffect(()=>{if(editingId&&!editing)viewStore.set({editingId:null});},[editingId,editing]);

  return <div className="canvas-host" ref={hostRef} onDragOver={e=>{if(e.dataTransfer.types.includes(SHAPE_MIME)){e.preventDefault();e.dataTransfer.dropEffect='copy';}}} onDrop={drop}>
    <svg ref={svgRef} className={`canvas tool-${tool}`} style={{cursor}} role="group" aria-label={`Canvas editable: ${doc.nodes.length} nodos, ${doc.edges.length} conexiones`}
      viewBox={`${camera.x} ${camera.y} ${viewport.width/camera.zoom} ${viewport.height/camera.zoom}`}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={e=>{pointers.current.delete(e.pointerId);pinch.current=null;setGesture(null);}}
      onKeyDown={e=>{const target=hit(e.target);if(target&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.stopPropagation();select(e.shiftKey?[...ids,target.id]:target.type==='node'?selectionUnit(doc,target.id):[target.id]);}}}>
      <defs><pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" className="grid-dot"/></pattern></defs>
      <rect x={camera.x} y={camera.y} width={viewport.width/camera.zoom} height={viewport.height/camera.zoom} fill="url(#grid)" pointerEvents="none"/>
      <DiagramLayer doc={visible} selected={staging?undefined:selected} staged={stagedIds} interactive showAnnotations editing={editing?.id} states={showing?statesAt(animation!,sampled.index):undefined}
        activeNodes={showing?new Set([...sampled.step.nodeIds,...(effects?.nodeIds??[])]):undefined} activeEdges={showing?new Set([...sampled.step.edgeIds,...(effects?.edgeIds??[])]):undefined}
        failed={sampled?.step.tone==='failure'} progress={showing?sampled.progress:null}/>
      <g pointerEvents="none">
        {groupBoxes.map(g=><g key={g.id}><rect className="group-outline" x={g.box.x-8} y={g.box.y-8} width={g.box.width+16} height={g.box.height+16} rx="8" strokeWidth={px}/>{g.label&&<text className="group-label" x={g.box.x-8} y={g.box.y-14} fontSize={11*px}>{g.label}</text>}</g>)}
        {escaped.map(n=><rect key={n.id} className="conflict-outline" x={n.position.x-3} y={n.position.y-3} width={n.size.width+6} height={n.size.height+6} rx="12" strokeWidth={2*px}/>)}
        {escaped.length>0&&gesture?.type==='resize'&&<text className="conflict-label" x={gesture.rect.x} y={gesture.rect.y+gesture.rect.height+18*px} fontSize={12*px}>⚠ {escaped.length} nodo(s) quedarían fuera de la zona: el cambio se va a rechazar.</text>}
        {draft&&<rect className={gesture!.type==='marquee'?'marquee':'draft'} {...draft} strokeWidth={px}/>}
        {wireTarget&&<rect className="drop-target" x={wireTarget.x-4} y={wireTarget.y-4} width={wireTarget.width+8} height={wireTarget.height+8} rx="12" strokeWidth={2*px}/>}
        {wire&&<line className={'draft-edge'+(wire.ready?' ready':'')} x1={wire.from.x} y1={wire.from.y} x2={wire.to.x} y2={wire.to.y} strokeWidth={2*px}/>}
        {gesture?.type==='stroke'&&<polyline className="draft-edge" points={gesture.points.map(p=>`${p.x},${p.y}`).join(' ')} strokeWidth={2*px}/>}
      </g>
      {handleBox&&resizable&&tool==='select'&&<g className="handles">
        <rect className="selection-outline" {...handleBox} strokeWidth={px} pointerEvents="none"/>
        {HANDLES.map(h=>{
          const cx=handleBox.x+(h.includes('w')?0:h.includes('e')?handleBox.width:handleBox.width/2),cy=handleBox.y+(h.includes('n')?0:h.includes('s')?handleBox.height:handleBox.height/2);
          return <rect key={h} data-handle={h} className="handle" style={{cursor:`${h}-resize`}} x={cx-5*px} y={cy-5*px} width={10*px} height={10*px} strokeWidth={px}/>;
        })}
      </g>}
      {edgeHandles&&<g className="handles">
        {/* Los tramos intermedios de una conexión ortogonal se pueden correr; los que tocan los nodos, no. */}
        {edgeHandles.edge.line==='orthogonal'&&edgeHandles.points.slice(1,-2).map((p,i)=>{
          const q=edgeHandles.points[i+2];
          return <rect key={i} data-handle={`seg-${i+1}`} className="handle segment" style={{cursor:p.x===q.x?'ew-resize':'ns-resize'}} x={(p.x+q.x)/2-4*px} y={(p.y+q.y)/2-4*px} width={8*px} height={8*px} strokeWidth={px}/>;
        })}
        {(['from','to'] as const).map(end=>{const p=end==='from'?edgeHandles.points[0]:edgeHandles.points[edgeHandles.points.length-1];return <circle key={end} data-handle={'end-'+end} className="handle endpoint" cx={p.x} cy={p.y} r={6*px} strokeWidth={1.5*px}/>;})}
      </g>}
    </svg>
    {editing&&<InlineEditor key={editing.id} target={editing} camera={camera}/>}
    {staging&&<p className="canvas-banner" role="status">Vista previa de la propuesta · paso {staging.step} de {staging.total} · aceptala o rechazala en el panel IA</p>}
    {empty&&!editing&&<p className="canvas-empty">Canvas vacío. Elegí una forma de la paleta y hacé clic acá, arrastrala, o pedile un diagrama a la <strong>IA</strong>.</p>}
  </div>;
}
