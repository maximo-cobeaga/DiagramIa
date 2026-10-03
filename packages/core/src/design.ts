import type {ActionInput,DiagramDocument,DiagramNode,ICONS,SHAPES} from './schema.js';

type Icon=typeof ICONS[number];
type Shape=typeof SHAPES[number];
type NodeStyle=DiagramNode['style'];

/**
 * Tonos de la marca para diseñar un diagrama: relleno y acento de los nodos, fondo y borde de su zona.
 * Mismos pares que la paleta del editor, para que lo que arma la IA y lo que arma una persona se vean igual.
 */
export const DESIGN_TONES=[
  {name:'blue',fill:'#e5ecff',stroke:'#245cf6',zoneFill:'#f5f8ff',zoneStroke:'#9db6fb'},
  {name:'coral',fill:'#ffe1d6',stroke:'#e2603a',zoneFill:'#fff7f3',zoneStroke:'#f3b39b'},
  {name:'mint',fill:'#dcf5e9',stroke:'#1f9d5c',zoneFill:'#f4fbf7',zoneStroke:'#93d3b1'},
  {name:'violet',fill:'#ece6ff',stroke:'#7c5cf0',zoneFill:'#f8f6ff',zoneStroke:'#c3b4f7'},
  {name:'sun',fill:'#fff3c4',stroke:'#c99700',zoneFill:'#fffcef',zoneStroke:'#e8cf6f'},
  {name:'pink',fill:'#fde2ef',stroke:'#d9488f',zoneFill:'#fff6fa',zoneStroke:'#efa6c9'},
  {name:'lime',fill:'#f1fbcf',stroke:'#8aa81c',zoneFill:'#fafdee',zoneStroke:'#c6dc72'},
  {name:'slate',fill:'#eef1f4',stroke:'#606975',zoneFill:'#f8f9fa',zoneStroke:'#b9c0c9'}
] as const;
type Tone=typeof DESIGN_TONES[number];
const STICKY={fill:'#ffe978',stroke:'#e2c341'};

const normalize=(text:string)=>text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
/** Palabras → icono, en orden de prioridad. Castellano rioplatense y algo de inglés. */
const ICON_WORDS:[Icon,RegExp][]=[
  ['plane',/\b(avion|vuelo|aeropuerto|aeroparque|ezeiza|plane|flight)/],['train',/\b(tren|train)/],['bus',/\b(micro|colectivo|omnibus|bus)\b/],['car',/\b(auto|ruta|manejar|nafta|estacionamiento|car)\b/],
  ['ship',/\b(barco|ferry|crucero|buquebus)/],['bike',/\b(bici|bicicleta|bike)/],['umbrella',/\b(playa|playas|balneario|carpa|sombrilla|beach)/],['wave',/\b(mar|olas?|escollera|costa|surf)\b/],
  ['mountain',/\b(sierra|montana|cerro|trekking|mountain)/],['leaf',/\b(bosque|parque|laguna|naturaleza|reserva natural|jardin)/],['sun',/\b(sol|verano|clima|calor|temporada|epoca)/],
  ['bed',/\b(hotel|alojamiento|hostel|hospedaje|dormir|departamento|cabana)/],['coffee',/\b(cafe|desayuno|merienda|churros?|alfajor)/],
  ['food',/\b(comer|comida|restaurante?|parrilla|pizza|empanadas?|mariscos|pescados?|almuerzo|cena|milanesas?|gastronomia|food)/],
  ['ticket',/\b(museo|teatro|cine|casino|entradas?|show|espectaculo|recital)/],['music',/\b(musica|concierto|boliche)/],['bag',/\b(compras|feria|shopping|tienda|peatonal|artesanos)/],
  ['camera',/\b(fotos?|mirador|paseo|torreon|catedral|faro|monumento)/],['map',/\b(mapa|recorrido|itinerario|como llegar|traslado)/],['pin',/\b(lugar|ubicacion|direccion|destino|barrio)/],
  ['calendar',/\b(dia|dias|fecha|calendario|mes|semana|fin de semana|feriado)\b/],['clock',/\b(hora|horario|tiempo|duracion|minutos)\b/],
  ['coin',/\b(presupuesto|dinero|precio|costo|pago|gasto|ahorro|tarifa)/],['idea',/\b(tip|tips|consejo|idea|recomendacion|sugerencia)/],['alert',/\b(alerta|riesgo|cuidado|atencion|evitar)/],
  ['check',/\b(listo|hecho|reservar|reserva|checklist)/],['users',/\b(equipo|grupo|familia|amigos)/],['user',/\b(persona|usuario|cliente|viajero)/],['heart',/\b(favorito|romantico|amor)/],
  ['graduation',/\b(curso|clase|estudio|universidad)/],['book',/\b(libro|lectura|tema)/],['mail',/\b(correo|email|mail)\b/],['chat',/\b(mensaje|chat|conversacion)/],['phone',/\b(celular|telefono|app)\b/],
  ['globe',/\b(web|sitio|pagina|internet)\b/],['shield',/\b(seguridad|seguro)/],['target',/\b(objetivo|meta)\b/],['question',/\b(pregunta|duda)/],['sparkle',/\b(imperdible|especial|destacado)/]
];
/** Icono que mejor describe un texto, o null si ninguna palabra lo sugiere. */
export function iconFor(text:string):Icon|null{
  const t=normalize(text);
  return ICON_WORDS.find(([,words])=>words.test(t))?.[0]??null;
}

// Tipos que ya tienen su propio dibujo técnico: el diseñador no les cambia la forma.
const TECHNICAL=new Set<DiagramNode['kind']>(['service','database','cache','queue','external','image','text']);
const TIP_ZONE=/\b(tip|tips|consejo|nota|recordatorio|importante|tener en cuenta)/;

/**
 * Secuencias dentro de cada zona (A→B→C…, al menos tres): un itinerario, los pasos de un proceso. Sólo cuentan las
 * conexiones internas de la zona y cada nodo pertenece a una sola secuencia, aunque también apunte a otras zonas.
 */
function chainsOf(doc:DiagramDocument){
  const inChain=new Set<string>(),chains:string[][]=[];
  for(const zoneId of new Set(doc.nodes.map(n=>n.zoneId))){
    const ids=new Set(doc.nodes.filter(n=>n.zoneId===zoneId).map(n=>n.id));
    const inner=doc.edges.filter(e=>ids.has(e.from)&&ids.has(e.to)&&e.from!==e.to),out=new Map<string,string[]>(),incoming=new Map<string,number>();
    for(const e of inner){out.set(e.from,[...(out.get(e.from)??[]),e.to]);incoming.set(e.to,(incoming.get(e.to)??0)+1);}
    const single=(id:string)=>(out.get(id)?.length??0)===1;
    for(const id of doc.nodes.filter(n=>ids.has(n.id)).map(n=>n.id)){
      if(inChain.has(id)||incoming.get(id)===1&&[...out].some(([from,to])=>single(from)&&to[0]===id))continue;
      const chain=[id];let at=id;
      while(single(at)&&chain.length<60){const nextId=out.get(at)![0];if(chain.includes(nextId)||inChain.has(nextId)||(incoming.get(nextId)??0)!==1)break;chain.push(nextId);at=nextId;}
      if(chain.length>=3){chains.push(chain);chain.forEach(x=>inChain.add(x));}
    }
  }
  return {chains,inChain};
}

export type DesignResult={actions:ActionInput[];styled:number};
/**
 * Diseño automático de un documento: un tono por zona, una forma según el rol de cada elemento, iconos por
 * significado y conexiones del color de su origen. Sólo completa lo que el autor no eligió: un nodo con estilo,
 * forma o icono propios conserva esa elección. No mueve nada; el ordenador (`tidyBatch`) hace lugar después.
 */
// Familias para que zonas parecidas no se vean iguales: tarjeta, globo, mosaico con icono grande y carpeta.
const FAMILIES:{shape:Shape;large?:boolean}[]=[{shape:'card'},{shape:'bubble'},{shape:'rounded',large:true},{shape:'folder'}];
export function designDocument(doc:DiagramDocument,options:{overwrite?:boolean;vary?:boolean}={}):DesignResult{
  const actions:ActionInput[]=[],free=(style:object)=>options.overwrite||!Object.keys(style).length;
  const toneOfZone=new Map(doc.zones.map((z,i)=>[z.id,DESIGN_TONES[i%DESIGN_TONES.length]]));
  for(const z of doc.zones){
    const tone=toneOfZone.get(z.id)!;
    if(free(z.style))actions.push({type:'UPDATE_ZONE',id:z.id,changes:{style:{fill:tone.zoneFill,stroke:tone.zoneStroke,textColor:tone.stroke,dash:'solid'}}});
  }
  const {inChain}=chainsOf(doc),siblings=new Map<string|null,DiagramNode[]>();
  for(const n of doc.nodes)siblings.set(n.zoneId,[...(siblings.get(n.zoneId)??[]),n]);
  let loose=0;
  const toneOfNode=new Map<string,Tone>();
  // Con `vary`, una zona sin secuencia que quedó toda en tarjetas toma la siguiente familia: el conjunto no se ve repetido.
  const family=new Map<string,typeof FAMILIES[number]>();
  if(options.vary){
    let k=0;
    for(const z of doc.zones){
      const members=doc.nodes.filter(n=>n.zoneId===z.id&&!TECHNICAL.has(n.kind));
      if(members.length<2||members.some(n=>inChain.has(n.id))||!members.every(n=>n.shape==='card'||n.shape==='rounded'))continue;
      family.set(z.id,FAMILIES[k++%FAMILIES.length]);
    }
  }
  for(const n of doc.nodes){
    const tone=n.zoneId&&toneOfZone.get(n.zoneId)||DESIGN_TONES[(doc.zones.length+loose++)%DESIGN_TONES.length];
    toneOfNode.set(n.id,tone);
    if(TECHNICAL.has(n.kind)&&!options.overwrite)continue;
    const zone=doc.zones.find(z=>z.id===n.zoneId),group=siblings.get(n.zoneId)??[],text=`${n.label} ${n.subtitle}`;
    const short=n.label.length<=26,tips=Boolean(zone&&TIP_ZONE.test(normalize(zone.label)));
    // La forma cuenta qué es cada cosa: la fila de un itinerario, una nota, una persona, un ítem de lista.
    const chosen=n.zoneId?family.get(n.zoneId):undefined;
    const shape:Shape|null=chosen&&!inChain.has(n.id)?chosen.shape:n.kind==='decision'?null
      :inChain.has(n.id)?'card'
      :n.kind==='actor'&&n.label.length<=16?'avatar'
      :tips||(n.kind==='note'&&n.label.length>48)?'sticky'
      :short&&group.length>=3?'pill'
      :'card';
    const icon=n.icon??iconFor(text)??(zone?iconFor(zone.label):null);
    const base:NodeStyle=shape==='sticky'?{...STICKY}:shape==='card'?{fill:'#ffffff',stroke:tone.stroke}:{fill:tone.fill,stroke:tone.stroke};
    const style:NodeStyle=chosen?.large&&icon?{...base,iconSize:'large'}:base;
    const changes:{shape?:Shape|null;icon?:Icon|null;style?:NodeStyle}={};
    if(options.overwrite||!n.shape||chosen)changes.shape=shape;
    if(!n.icon&&icon&&shape!=='sticky')changes.icon=icon;
    if(free(n.style))changes.style=style;
    if(Object.keys(changes).length)actions.push({type:'UPDATE_NODE',id:n.id,changes});
  }
  // Dentro de una zona, la conexión es parte de la historia y va firme; entre zonas es una referencia y va suave,
  // curva y punteada, para que muchas relaciones no se vuelvan una maraña.
  const zoneOf=new Map(doc.nodes.map(n=>[n.id,n.zoneId]));
  for(const e of doc.edges){
    const tone=toneOfNode.get(e.from);
    if(!tone||!free(e.style))continue;
    const across=zoneOf.get(e.from)!==zoneOf.get(e.to)||!zoneOf.get(e.from);
    actions.push({type:'UPDATE_EDGE',id:e.id,changes:across?{style:{stroke:tone.zoneStroke,strokeWidth:1.5,dash:'dashed'},...(e.line==='orthogonal'&&!e.points?{line:'curved' as const}:{})}:{style:{stroke:tone.stroke,strokeWidth:2}}});
  }
  return {actions,styled:actions.length};
}

/**
 * Recorrido animado de un diagrama: una escena por zona, y dentro de una secuencia (A→B→C), un paso por elemento.
 * Sirve para presentar lo que se acaba de crear sin armar la animación a mano.
 */
export function tourOf(doc:DiagramDocument,id:string,label='Recorrido'):Extract<ActionInput,{type:'CREATE_ANIMATION'}>|null{
  const {chains}=chainsOf(doc),steps:{caption:string;nodeIds:string[];edgeIds:string[]}[]=[];
  const label_=(nodeId:string)=>doc.nodes.find(n=>n.id===nodeId)?.label??nodeId;
  const zones=doc.zones.length?doc.zones:[null];
  for(const zone of zones){
    const members=doc.nodes.filter(n=>zone?n.zoneId===zone.id:true).map(n=>n.id);
    if(!members.length)continue;
    const chain=chains.find(c=>members.includes(c[0])&&c.every(id=>members.includes(id)));
    if(chain){
      chain.slice(0,12).forEach((nodeId,i)=>steps.push({caption:label_(nodeId),nodeIds:[nodeId],edgeIds:i?doc.edges.filter(e=>e.from===chain[i-1]&&e.to===nodeId).map(e=>e.id):[]}));
    }else steps.push({caption:zone?.label??doc.title,nodeIds:members.slice(0,100),edgeIds:doc.edges.filter(e=>members.includes(e.from)&&members.includes(e.to)).map(e=>e.id).slice(0,100)});
  }
  if(steps.length<2)return null;
  return {type:'CREATE_ANIMATION',animation:{id,label,scenarios:[],tracks:[],
    steps:steps.slice(0,40).map((s,i)=>({id:`${id}-${i+1}`,caption:s.caption.slice(0,500),durationMs:Math.max(2400,Math.min(6000,1400+s.caption.length*45)),nodeIds:s.nodeIds,edgeIds:s.edgeIds,tone:'normal' as const,frameId:null,scenarioIds:[],states:[]}))}};
}
