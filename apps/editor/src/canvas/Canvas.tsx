import {useEffect,useMemo,useRef,useState} from 'react';
import {snapSelection,selectionMovePreview,anchorAt,contains,documentBounds,fitSize,groupMembers,guideInk,inkLength,limitInk,nodeRect,overlaps,resolveMembership,routeAll,sampleAnimation,sampleTrackEffects,smoothInk,statesAt,straightInk,type ActionInput,type AlignmentGuide,type DiagramDocument,type DiagramDrawing,type Point,type Rect} from '@diagramia/core';
import {useStore} from '../store/createStore';
import {documentStore,newId,notify,transact} from '../store/documentStore';
import {kindOf,select,selectionStore} from '../store/selectionStore';
import {currentAnimation,playbackStore} from '../store/playbackStore';
import {cancelCameraMove,snap,viewStore,zoomAt,type Camera,type NodeTemplate} from '../store/viewStore';
import {connectTo,fitAll,moveActions,selectionUnit} from '../commands';
import {trackThrottled} from '../telemetry';
import {DiagramLayer,nodeTitleLayout} from './DiagramLayer';
import {singleDrawingDocument,singleNodeDocument,templateNode} from './templateNode';
import {Welcome} from '../shell/Welcome';
import {SelectionToolbar} from './SelectionToolbar';
import {PenTools} from './PenTools';

type BoxKind='node'|'zone'|'frame';
type Anchor={x:number;y:number}|null;
type Gesture=
  |{type:'pan';cx:number;cy:number;camera:Camera}
  |{type:'marquee';start:Point;current:Point;additive:boolean}
  |{type:'move';start:Point;dx:number;dy:number;ids:string[];unit:string[];shift:boolean;guides?:AlignmentGuide[]}
  |{type:'box';kind:'zone'|'frame';id:string;start:Point;dx:number;dy:number}
  |{type:'resize';kind:BoxKind;id:string;handle:string;start:Point;original:Rect;rect:Rect}
  |{type:'draw';kind:'zone'|'frame';start:Point;current:Point}
  |{type:'stroke';kind:'line'|'arrow'|'freehand';points:Point[];raw:Point[];style:DiagramDrawing['style'];guided:boolean;guideLabel?:string}
  |{type:'erase';ids:string[]}
  |{type:'place';at:Point}
  |{type:'connect';from:string;fromAnchor:Anchor;current:Point;target:string|null;quick?:boolean}
  |{type:'endpoint';edgeId:string;end:'from'|'to';fixed:Point;current:Point;target:string|null}
  |{type:'segment';edgeId:string;index:number;start:Point;original:Point[];points:Point[]};

const HANDLES=['nw','n','ne','e','se','s','sw','w'];
const CONNECT_PORTS=[{name:'Arriba',x:.5,y:0},{name:'Derecha',x:1,y:.5},{name:'Abajo',x:.5,y:1},{name:'Izquierda',x:0,y:.5}];
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
  if(g.type==='erase')return {...doc,drawings:doc.drawings.filter(d=>!g.ids.includes(d.id))};
  const reroute=(moved:Set<string>)=>doc.edges.map(e=>moved.has(e.from)||moved.has(e.to)?{...e,points:undefined}:e);
  const shift=(moved:Set<string>,dx:number,dy:number)=>doc.nodes.map(n=>moved.has(n.id)?{...n,position:{x:n.position.x+dx,y:n.position.y+dy}}:n);
  if(g.type==='move'&&(g.dx||g.dy))return selectionMovePreview(doc,g.ids,g.dx,g.dy);
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
  const node=templateNode(template,at,newId('node')),target=resolveMembership(doc,{...node.position,...node.size});
  if(!transact([{type:'ADD_NODE',node:{...node,position:target.position,zoneId:target.zoneId}}],'Nodo agregado'))return;
  select([node.id]);viewStore.set({tool:'select',editingId:node.id});
}

type Editable={id:string;kind:'node'|'edge'|'zone'|'frame';value:string;box:Rect;size:number;multiline:boolean;color?:string;align?:'left'|'center'|'right';bold?:boolean;italic?:boolean};
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
  const {box}=target,style={left:(box.x-camera.x)*camera.zoom,top:(box.y-camera.y)*camera.zoom,width:Math.max(target.kind==='node'?40:90,box.width*camera.zoom),height:Math.max(target.kind==='node'?18:28,box.height*camera.zoom),fontSize:Math.max(8,target.size*camera.zoom),color:target.color,textAlign:target.align,fontWeight:target.bold?700:undefined,fontStyle:target.italic?'italic':undefined};
  return <textarea ref={ref} className={'inline-editor kind-'+target.kind} style={style} value={value} maxLength={target.kind==='edge'?160:200} aria-label="Texto del elemento"
    onChange={e=>setValue(e.target.value)} onBlur={()=>finish(true)} onPointerDown={e=>e.stopPropagation()}
    onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();finish(true);}if(e.key==='Escape'){e.preventDefault();finish(false);}}}/>;
}

export function Canvas(){
  const {doc:saved}=useStore(documentStore),{camera,viewport,tool,template,staging,editingId,flash,dragTemplate,connectFromId,connectFromAnchor}=useStore(viewStore),doc=staging?.doc??saved,stagedIds=useMemo(()=>staging?new Set(staging.changed):undefined,[staging]),{ids}=useStore(selectionStore),{animationId,time,scenarioId}=useStore(playbackStore);
  const [gesture,showGesture]=useState<Gesture|null>(null),[spaceHeld,setSpaceHeld]=useState(false),[ghostAt,setGhostAt]=useState<Point|null>(null);
  const [connectHover,setConnectHover]=useState<{point:Point;target:string|null}|null>(null);
  useEffect(()=>setConnectHover(null),[tool,connectFromId]);
  // El gesto vigente vive en una ref: los movimientos se renderizan con prioridad baja y, si el botón se suelta
  // enseguida, el estado de React todavía puede ser el anterior. La ref siempre tiene el último valor.
  const gestureRef=useRef<Gesture|null>(null);
  const guideTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const guideAt=useRef<Point|null>(null);
  const clearGuide=()=>{clearTimeout(guideTimer.current);guideAt.current=null;};
  const setGesture=(next:Gesture|null)=>{gestureRef.current=next;showGesture(next);};
  useEffect(()=>()=>clearTimeout(guideTimer.current),[]);
  useEffect(()=>{clearTimeout(guideTimer.current);guideAt.current=null;gestureRef.current=null;showGesture(null);},[tool]);
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
      cancelCameraMove();
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
  // Se calcula una vez por resaltado: durante el viaje de cámara el canvas se redibuja en cada cuadro.
  const flashBoxes=useMemo(()=>flash?flash.ids.map(id=>documentBounds(doc,[id])).filter((r):r is Rect=>Boolean(r)):[],[flash,doc]);
  const visible=useMemo(()=>withGesture(doc,gesture),[doc,gesture]);
  // scenarioId no se usa directo: forma parte del estado suscripto para que cambiar de rama vuelva a dibujar.
  void scenarioId;
  const animation=currentAnimation(doc,animationId),sampled=animation?sampleAnimation(animation,time):null,effects=animation?sampleTrackEffects(animation,time):null,showing=sampled&&(time>0||playbackStore.get().cue>0||playbackStore.get().playing);
  const single=ids.length===1&&!staging?kindOf(doc,ids[0]):null,resizable=single&&(single==='node'||single==='zone'||single==='frame')?{kind:single,id:ids[0]}:null;
  const handleBox=resizable&&boxOf(visible,resizable.kind,resizable.id);
  const px=1/camera.zoom,routes=routeAll(visible);
  const edgeHandles=single==='edge'&&tool==='select'?(()=>{const edge=visible.edges.find(e=>e.id===ids[0]),points=routes.get(ids[0])?.points;return edge&&points&&points.length>1?{edge,points}:null;})():null;

  function down(e:React.PointerEvent<SVGSVGElement>){
    cancelCameraMove();
    pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.current.size===2){
      clearGuide();
      const [a,b]=[...pointers.current.values()];
      pinch.current={distance:Math.hypot(a.x-b.x,a.y-b.y)||1,zoom:viewStore.get().camera.zoom};setGesture(null);return;
    }
    const world=toWorld(e),target=hit(e.target),handle=e.target instanceof Element?e.target.getAttribute('data-handle'):null;
    const portName=e.target instanceof Element?e.target.closest('[data-connect-port]')?.getAttribute('data-connect-port'):null;
    svgRef.current!.setPointerCapture(e.pointerId);
    // Con una propuesta en vista previa el canvas es de sólo lectura: cualquier arrastre desplaza la vista.
    if(e.button===1||tool==='pan'||spaceHeld||staging||(e.pointerType==='touch'&&!target&&!handle&&!portName&&tool==='select')){
      e.preventDefault();setGesture({type:'pan',cx:e.clientX,cy:e.clientY,camera:viewStore.get().camera});return;
    }
    if(e.button!==0)return;
    playbackStore.set({playing:false});
    if(portName&&single==='node'&&!staging){const port=CONNECT_PORTS.find(p=>p.name===portName)!;setGesture({type:'connect',from:ids[0],fromAnchor:{x:port.x,y:port.y},current:world,target:null,quick:true});return;}
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
    if(tool==='line'||tool==='arrow'||tool==='freehand'||tool==='guided'){
      clearGuide();
      const {penColor,penWidth}=viewStore.get();select([]);
      setGesture({type:'stroke',kind:tool==='guided'?'freehand':tool,points:[world,world],raw:[world,world],style:{stroke:penColor,strokeWidth:penWidth},guided:tool==='guided'});return;
    }
    if(tool==='eraser'){setGesture({type:'erase',ids:target?.type==='drawing'?[target.id]:[]});return;}
    if(tool==='zone'||tool==='frame'){setGesture({type:'draw',kind:tool,start:world,current:world});return;}
    if(tool==='connect'){
      const from=viewStore.get().connectFromId;
      if(from){
        const to=target?.type==='node'?target.id:null;
        connectTo(to,to?anchorAt(nodeRect(doc.nodes.find(n=>n.id===to)!),world):null);
        return;
      }
      if(target?.type==='node')setGesture({type:'connect',from:target.id,fromAnchor:anchorNear(boxOf(doc,'node',target.id)!,world,14*px),current:world,target:null});
      return;
    }
    if(!target){setGesture({type:'marquee',start:world,current:world,additive:e.shiftKey});return;}
    const now=performance.now(),double=lastDown.current.id===target.id&&now-lastDown.current.at<380;
    lastDown.current={id:target.id,at:now};
    const unit=(target.type==='node'||target.type==='drawing')&&!e.altKey?selectionUnit(doc,target.id):[target.id];
    const next=e.shiftKey?(unit.every(id=>selected.has(id))?ids.filter(id=>!unit.includes(id)):[...ids,...unit]):selected.has(target.id)?ids:unit;
    select(next);
    // Doble clic: el texto se edita en el lugar. El editor se abre al soltar: si se abriera al presionar, el navegador
    // le sacaría el foco enseguida para dárselo al elemento presionado.
    if(double&&target.type!=='drawing'){select([target.id]);pendingEdit.current=target.id;return;}
    if(next.includes(target.id)&&target.type!=='edge')setGesture({type:'move',start:world,dx:0,dy:0,ids:next,unit,shift:e.shiftKey});
  }

  function move(e:React.PointerEvent<SVGSVGElement>){
    if(pointers.current.has(e.pointerId))pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pinch.current&&pointers.current.size===2){
      const [a,b]=[...pointers.current.values()],box=svgRef.current!.getBoundingClientRect();
      zoomAt((a.x+b.x)/2-box.left,(a.y+b.y)/2-box.top,pinch.current.zoom*Math.hypot(a.x-b.x,a.y-b.y)/pinch.current.distance);return;
    }
    if(gestureRef.current){
      const old=gestureRef.current,next=advance(old,e);setGesture(next);
      if(next.type==='stroke'&&next.guided&&old.type==='stroke'&&next.raw!==old.raw){
        const last=next.raw.at(-1)!;
        if(!guideAt.current||Math.hypot(last.x-guideAt.current.x,last.y-guideAt.current.y)>4/viewStore.get().camera.zoom){
          clearGuide();guideAt.current=last;guideTimer.current=setTimeout(()=>{
            const current=gestureRef.current;if(current?.type!=='stroke'||!current.guided)return;
            const guided=guideInk(current.raw);if(guided){setGesture({...current,points:guided.points,guideLabel:guided.label});notify(`Forma emprolijada: ${guided.label}. Soltá para guardarlo.`);}
          },450);
        }
      }
    }
    // Con una forma elegida, la vista previa sigue al puntero (mouse o lápiz; en táctil no hay puntero que seguir).
    else if(tool==='node'&&e.pointerType!=='touch')setGhostAt(toWorld(e));
    else if(tool==='connect'&&connectFromId){const target=hit(document.elementFromPoint(e.clientX,e.clientY));setConnectHover({point:toWorld(e),target:target?.type==='node'&&target.id!==connectFromId?target.id:null});}
  }
  /** El gesto actualizado a la posición del puntero. También se aplica al soltar, para no depender del último movimiento. */
  function advance(g:Gesture,e:React.PointerEvent<SVGSVGElement>):Gesture{
    const world=toWorld(e);
    // El puntero está capturado por el SVG: el nodo de destino se busca por coordenadas, no por e.target.
    const nodeUnder=(except?:string)=>{const over=hit(document.elementFromPoint(e.clientX,e.clientY));return over?.type==='node'&&over.id!==except?over.id:null;};
    switch(g.type){
      case 'pan':trackThrottled('pan',{});viewStore.set({camera:{...g.camera,x:g.camera.x-(e.clientX-g.cx)/g.camera.zoom,y:g.camera.y-(e.clientY-g.cy)/g.camera.zoom}});return g;
      case 'marquee':case 'draw':return {...g,current:world};
      case 'stroke':{
        if(g.kind!=='freehand')return {...g,points:straightInk(g.points[0],world,e.shiftKey)};
        const samples=e.nativeEvent.getCoalescedEvents?.()??[],raw=[...g.raw];
        for(const point of [...samples,e]){
          const at=toWorld(point),last=raw.at(-1)!;
          if(Math.hypot(at.x-last.x,at.y-last.y)>=.7/viewStore.get().camera.zoom)raw.push(at);
        }
        if(raw.length===g.raw.length)return g;
        const limited=limitInk(raw);
        // Un pequeño temblor no deshace una forma ya reconocida al mantener presionado.
        if(g.guideLabel&&guideAt.current&&Math.hypot(world.x-guideAt.current.x,world.y-guideAt.current.y)<=4/viewStore.get().camera.zoom)return {...g,raw:limited};
        return {...g,raw:limited,points:g.guided?smoothInk(limited):limited,guideLabel:undefined};
      }
      case 'erase':{const target=hit(document.elementFromPoint(e.clientX,e.clientY));return target?.type==='drawing'&&!g.ids.includes(target.id)?{...g,ids:[...g.ids,target.id]}:g;}
      case 'move':{
        const dx=world.x-g.start.x,dy=world.y-g.start.y;
        const adjusted=viewStore.get().snap&&!e.altKey?snapSelection(doc,g.ids,dx,dy,6/viewStore.get().camera.zoom):{dx,dy,guides:[]};
        if(viewStore.get().snap&&!e.altKey){if(!adjusted.guides.some(g=>g.axis==='x'))adjusted.dx=snap(dx);if(!adjusted.guides.some(g=>g.axis==='y'))adjusted.dy=snap(dy);}
        return {...g,...adjusted};
      }
      case 'box':return {...g,dx:snap(world.x-g.start.x),dy:snap(world.y-g.start.y)};
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
    clearGuide();
    pointers.current.delete(e.pointerId);
    if(pointers.current.size<2)pinch.current=null;
    const g=gestureRef.current&&advance(gestureRef.current,e);setGesture(null);
    if(pendingEdit.current){viewStore.set({editingId:pendingEdit.current});pendingEdit.current=null;return;}
    if(!g)return;
    const tolerance=14/viewStore.get().camera.zoom;
    switch(g.type){
      case 'place':placeNode(doc,template,g.at);break;
      case 'stroke':{
        const guided=g.guided?guideInk(g.raw):null,points=guided?.points??g.points;
        if(points.length<2||(g.kind!=='freehand'&&inkLength(points)<4/viewStore.get().camera.zoom)){notify('Arrastrá un poco más para dibujar.','warn');break;}
        const id=newId('drawing');
        if(transact([{type:'ADD_DRAWING',drawing:{id,kind:g.kind,points,style:g.style}}],guided?`Forma emprolijada: ${guided.label}`:g.kind==='freehand'?'Trazo dibujado':g.kind==='arrow'?'Flecha libre creada':'Línea creada')){select([id]);if(g.kind!=='freehand')viewStore.set({tool:'select'});}
        break;
      }
      case 'erase':if(g.ids.length)transact(g.ids.map(id=>({type:'DELETE_DRAWING',id})),'Trazos borrados');break;
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
        if(g.dx||g.dy)transact(moveActions(doc,g.ids,g.dx,g.dy),g.ids.length>1?`${g.ids.length} elementos movidos`:'Elemento movido');
        else if(!g.shift&&ids.length>g.unit.length)select(g.unit);
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
          const id=newId('edge'),toAnchor=anchorAt(boxOf(doc,'node',g.target)!,g.current);
          if(transact([{type:'ADD_EDGE',edge:{id,from:g.from,to:g.target,fromAnchor:g.fromAnchor,toAnchor}}],'Conexión creada')){select([id]);if(g.quick)viewStore.set({tool:'select',connectFromId:null,connectFromAnchor:null});}
        }else{viewStore.set({tool:'connect',connectFromId:g.from,connectFromAnchor:g.fromAnchor});notify('Elegí el destino para unir. Esc cancela.');}
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
        const inside=[...doc.nodes.filter(n=>overlaps(area,nodeRect(n))).map(n=>n.id),...doc.drawings.filter(d=>{const bounds=documentBounds(doc,[d.id]);return bounds&&overlaps(area,bounds);}).map(d=>d.id),...[...doc.zones,...doc.frames].filter(x=>contains(area,x.bounds)).map(x=>x.id)];
        const expanded=[...new Set(inside.flatMap(id=>selectionUnit(doc,id)))],nodes=new Set(expanded);
        select([...(g.additive?ids:[]),...expanded,...doc.edges.filter(edge=>nodes.has(edge.from)&&nodes.has(edge.to)).map(edge=>edge.id)]);
        break;
      }
    }
  }
  // Una forma arrastrada desde la paleta se crea donde se suelta.
  function drop(e:React.DragEvent){
    setGhostAt(null);
    const raw=e.dataTransfer.getData(SHAPE_MIME);if(!raw||staging)return;
    e.preventDefault();
    try{placeNode(saved,JSON.parse(raw) as NodeTemplate,toWorld(e));}catch{/* un arrastre ajeno a la paleta no hace nada */}
  }

  // Contornos de los grupos que tienen algún miembro seleccionado.
  const groupBoxes=useMemo(()=>visible.groups.map(g=>{
    const members=groupMembers(visible,g.id);
    if(!members.some(id=>selected.has(id)))return null;
    const box=documentBounds(visible,members);
    return box&&{id:g.id,label:g.label,box};
  }).filter(x=>x!==null),[visible,selected]);
  const escaped=gesture?.type==='resize'&&gesture.kind==='zone'?visible.nodes.filter(n=>n.zoneId===gesture.id&&!contains(gesture.rect,nodeRect(n))):[];
  const draft=gesture&&(gesture.type==='marquee'||gesture.type==='draw')?rectOf(gesture.start,gesture.current):null;
  // Vista previa del elemento que se va a crear: la plantilla que se arrastra o la elegida en la paleta.
  const ghostTemplate=dragTemplate??(tool==='node'?template:null);
  const placeAt=gesture?.type==='place'?gesture.at:ghostAt;
  const ghost=useMemo(()=>ghostTemplate&&placeAt&&!staging&&(!gesture||gesture.type==='place')?singleNodeDocument(templateNode(ghostTemplate,placeAt)):null,[ghostTemplate,placeAt,staging,gesture]);
  const empty=!doc.nodes.length&&!doc.zones.length&&!doc.frames.length&&!doc.drawings.length;
  const cursor=gesture?.type==='pan'?'grabbing':tool==='pan'||spaceHeld||staging?'grab':tool==='select'?'default':'crosshair';
  const connectionPortBox=single==='node'&&tool==='select'&&!gesture&&!staging&&!editingId&&!playbackStore.get().playing?nodeRect(doc.nodes.find(n=>n.id===ids[0])!):null;
  const pendingFrom=connectFromId?doc.nodes.find(n=>n.id===connectFromId):null;
  const pendingTarget=connectHover?.target?doc.nodes.find(n=>n.id===connectHover.target):null;
  const wire=gesture?.type==='connect'?{from:(r=>({x:r.x+(gesture.fromAnchor?.x??.5)*r.width,y:r.y+(gesture.fromAnchor?.y??.5)*r.height}))(nodeRect(doc.nodes.find(n=>n.id===gesture.from)!)),to:gesture.current,ready:Boolean(gesture.target)}
    :gesture?.type==='endpoint'?{from:gesture.fixed,to:gesture.current,ready:Boolean(gesture.target)}:null;
  const pendingWire=pendingFrom&&connectHover?{from:{x:pendingFrom.position.x+pendingFrom.size.width*(connectFromAnchor?.x??.5),y:pendingFrom.position.y+pendingFrom.size.height*(connectFromAnchor?.y??.5)},to:connectHover.point,ready:Boolean(pendingTarget)}:null;
  const shownWire=wire??pendingWire;
  const wireTarget=gesture&&(gesture.type==='connect'||gesture.type==='endpoint')&&gesture.target?boxOf(doc,'node',gesture.target):pendingTarget?nodeRect(pendingTarget):null;
  const wireEnd=shownWire&&wireTarget?(()=>{const anchor=anchorAt(wireTarget,shownWire.to);return {x:wireTarget.x+wireTarget.width*anchor.x,y:wireTarget.y+wireTarget.height*anchor.y};})():shownWire?.to;

  // Elemento en edición de texto y la caja de pantalla donde se escribe.
  const editing=useMemo(():Editable|null=>{
    if(!editingId||staging)return null;
    const n=doc.nodes.find(x=>x.id===editingId);if(n){const layout=nodeTitleLayout(n,Boolean(n.assetId));return {id:n.id,kind:'node',value:n.label,box:layout.box,size:layout.size,multiline:true,color:layout.color,align:n.style.align??'center',bold:n.style.bold,italic:n.style.italic};}
    const e=doc.edges.find(x=>x.id===editingId),routed=routes.get(editingId);
    if(e&&routed){const at=routed.label??routed.points[Math.floor(routed.points.length/2)];return {id:e.id,kind:'edge',value:e.label,box:{x:at.x-80,y:at.y-22,width:160,height:28},size:11,multiline:false};}
    const z=doc.zones.find(x=>x.id===editingId);if(z)return {id:z.id,kind:'zone',value:z.label,box:{x:z.bounds.x+10,y:z.bounds.y+8,width:Math.min(260,z.bounds.width-20),height:26},size:12,multiline:false};
    const f=doc.frames.find(x=>x.id===editingId);if(f)return {id:f.id,kind:'frame',value:f.label,box:{x:f.bounds.x,y:f.bounds.y-30,width:220,height:26},size:11,multiline:false};
    return null;
  },[editingId,doc,staging,routes]);
  useEffect(()=>{if(editingId&&!editing)viewStore.set({editingId:null});},[editingId,editing]);

  return <div className="canvas-host" ref={hostRef} onDrop={drop}
    onDragOver={e=>{if(e.dataTransfer.types.includes(SHAPE_MIME)){e.preventDefault();e.dataTransfer.dropEffect='copy';setGhostAt(toWorld(e));}}}
    onDragLeave={e=>{if(!hostRef.current?.contains(e.relatedTarget as Node|null))setGhostAt(null);}}>
    <svg ref={svgRef} className={`canvas tool-${tool}`} tabIndex={0} style={{cursor}} role="group" aria-label={`Canvas editable: ${doc.nodes.length} nodos, ${doc.edges.length} conexiones`}
      viewBox={`${camera.x} ${camera.y} ${viewport.width/camera.zoom} ${viewport.height/camera.zoom}`}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={()=>setGhostAt(null)} onPointerCancel={e=>{clearGuide();pointers.current.delete(e.pointerId);pinch.current=null;setGesture(null);}}
      onKeyDown={e=>{if(e.key==='Escape'){clearGuide();setGesture(null);pendingEdit.current=null;return;}const target=hit(e.target);if(target&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.stopPropagation();if(viewStore.get().connectFromId&&target.type==='node'&&!staging){connectTo(target.id);return;}const unit=e.altKey?[target.id]:selectionUnit(doc,target.id);select(e.shiftKey?[...ids,...unit]:unit);}}}>
      <defs><pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" className="grid-dot"/></pattern><marker id="connection-preview-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M1 1L9 5L1 9Z" fill="var(--blue)"/></marker></defs>
      <rect x={camera.x} y={camera.y} width={viewport.width/camera.zoom} height={viewport.height/camera.zoom} fill="url(#grid)" pointerEvents="none"/>
      <DiagramLayer doc={visible} selected={staging?undefined:selected} staged={stagedIds} interactive showAnnotations editing={editing?.id} states={showing?statesAt(animation!,sampled.index):undefined}
        activeNodes={showing?new Set([...sampled.step.nodeIds,...(effects?.nodeIds??[])]):undefined} activeEdges={showing?new Set([...sampled.step.edgeIds,...(effects?.edgeIds??[])]):undefined}
        failed={sampled?.step.tone==='failure'} progress={showing?sampled.progress:null}/>
      {ghost&&<g className="place-ghost" pointerEvents="none" aria-hidden="true"><DiagramLayer doc={ghost}/></g>}
      <g pointerEvents="none">
        {gesture?.type==='move'&&gesture.guides?.map((guide,i)=><line key={i} className="alignment-guide" x1={guide.axis==='x'?guide.at:guide.from} y1={guide.axis==='y'?guide.at:guide.from} x2={guide.axis==='x'?guide.at:guide.to} y2={guide.axis==='y'?guide.at:guide.to} strokeWidth={px}/>)}
        {groupBoxes.map(g=><g key={g.id}><rect className="group-outline" x={g.box.x-8} y={g.box.y-8} width={g.box.width+16} height={g.box.height+16} rx="8" strokeWidth={px}/>{g.label&&<text className="group-label" x={g.box.x-8} y={g.box.y-14} fontSize={11*px}>{g.label}</text>}</g>)}
        {escaped.map(n=><rect key={n.id} className="conflict-outline" x={n.position.x-3} y={n.position.y-3} width={n.size.width+6} height={n.size.height+6} rx="12" strokeWidth={2*px}/>)}
        {escaped.length>0&&gesture?.type==='resize'&&<text className="conflict-label" x={gesture.rect.x} y={gesture.rect.y+gesture.rect.height+18*px} fontSize={12*px}>⚠ {escaped.length} nodo(s) quedarían fuera de la zona: el cambio se va a rechazar.</text>}
        {flash&&flashBoxes.map((r,i)=><rect key={`${flash.key}-${i}`} className={`focus-flash tone-${flash.tone}`} x={r.x-10} y={r.y-10} width={r.width+20} height={r.height+20} rx="14" strokeWidth={4*px}/>)}
        {draft&&<rect className={gesture!.type==='marquee'?'marquee':'draft'} {...draft} strokeWidth={px}/>}
        {wireTarget&&<rect className="drop-target" x={wireTarget.x-4} y={wireTarget.y-4} width={wireTarget.width+8} height={wireTarget.height+8} rx="12" strokeWidth={2*px}/>}
        {shownWire&&wireEnd&&<line className={'draft-edge'+(shownWire.ready?' ready':'')} x1={shownWire.from.x} y1={shownWire.from.y} x2={wireEnd.x} y2={wireEnd.y} strokeWidth={2*px} markerEnd="url(#connection-preview-head)"/>}
        {!staging&&ids.map(id=>{const box=documentBounds(visible,[id]);return box&&<rect key={id} className="selection-outline" x={box.x-5*px} y={box.y-5*px} width={box.width+10*px} height={box.height+10*px} rx={5*px} strokeWidth={px}/>;})}
      </g>
      {gesture?.type==='stroke'&&<g className="ink-preview" pointerEvents="none" aria-hidden="true"><DiagramLayer doc={singleDrawingDocument({id:'ink-preview',kind:gesture.kind,points:gesture.points,style:gesture.style,groupId:null})}/></g>}
      {connectionPortBox&&CONNECT_PORTS.map(port=>{const x=connectionPortBox.x+connectionPortBox.width*port.x+(port.x===0?-15:port.x===1?15:0)*px,y=connectionPortBox.y+connectionPortBox.height*port.y+(port.y===0?-15:port.y===1?15:0)*px;return <g key={port.name} className="connect-port" data-connect-port={port.name} role="button" tabIndex={0} aria-label={'Conectar desde '+port.name.toLowerCase()} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();viewStore.set({tool:'connect',connectFromId:ids[0],connectFromAnchor:{x:port.x,y:port.y}});}}}><circle className="connect-port-hit" cx={x} cy={y} r={16*px}/><circle cx={x} cy={y} r={8*px} strokeWidth={1.5*px}/><path d={`M${x-3*px} ${y}h${6*px}M${x} ${y-3*px}v${6*px}`} strokeWidth={1.5*px}/></g>;})}
      {handleBox&&resizable&&tool==='select'&&<g className="handles">
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
    {!staging&&<PenTools guideLabel={gesture?.type==='stroke'?gesture.guideLabel:undefined}/>}
    {shownWire?.ready&&wireTarget&&<div className="connection-feedback" role="status" style={{left:Math.max(8,Math.min(viewport.width-200,(wireTarget.x-camera.x)*camera.zoom)),top:Math.max(8,Math.min(viewport.height-40,(wireTarget.y-camera.y)*camera.zoom-38))}}>Unir con {doc.nodes.find(n=>n.position.x===wireTarget.x&&n.position.y===wireTarget.y)?.label??'este elemento'}</div>}
    <SelectionToolbar busy={Boolean(gesture)}/>
    {viewStore.get().connectFromId&&tool==='connect'&&<div className="connect-invitation" role="status">Elegí el otro elemento para unirlos.<button onClick={()=>{viewStore.set({connectFromId:null,tool:'select'});notify('Unión cancelada.');}}>Cancelar</button></div>}
    {editing&&<InlineEditor key={editing.id} target={editing} camera={camera}/>}
    {staging&&<p className="canvas-banner" role="status">Vista previa de la propuesta · paso {staging.step} de {staging.total} · aceptala o rechazala en el panel IA</p>}
    {empty&&!editing&&!staging&&!gesture&&tool==='select'&&<Welcome/>}
    {empty&&!editing&&!staging&&!gesture&&tool==='node'&&viewStore.get().startMode==='draw'&&<Welcome/>}
  </div>;
}
