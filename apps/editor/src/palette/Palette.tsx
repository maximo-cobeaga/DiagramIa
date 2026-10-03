import {useMemo,useState} from 'react';
import {nodeRect,type DiagramNode} from '@diagramia/core';
import {useStore} from '../store/createStore';
import {viewStore,type NodeTemplate} from '../store/viewStore';
import {SHAPE_MIME} from '../canvas/Canvas';
import {DiagramLayer} from '../canvas/DiagramLayer';
import {singleNodeDocument,templateNode} from '../canvas/templateNode';

type Item=NodeTemplate&{name:string;keywords?:string};
type Shape=NonNullable<NodeTemplate['shape']>;
type Icon=NonNullable<DiagramNode['icon']>;
const item=(name:string,kind:NodeTemplate['kind'],shape:NodeTemplate['shape'],width=160,height=80,label=name):Item=>({name,kind,shape,label,size:{width,height}});

// Pares de relleno y acento de la marca. El acento pinta encabezados, círculos de icono, anillos y bordes.
const TONES={
  blue:{fill:'#e5ecff',stroke:'#245cf6'},lime:{fill:'#f1fbcf',stroke:'#8aa81c'},coral:{fill:'#ffe1d6',stroke:'#e2603a'},mint:{fill:'#dcf5e9',stroke:'#1f9d5c'},
  violet:{fill:'#ece6ff',stroke:'#7c5cf0'},pink:{fill:'#fde2ef',stroke:'#d9488f'},sun:{fill:'#fff3c4',stroke:'#c99700'},slate:{fill:'#eef1f4',stroke:'#606975'},
  sticky:{fill:'#ffe978',stroke:'#e2c341'},stickyMint:{fill:'#c9f0dc',stroke:'#86cfa8'},stickyPink:{fill:'#ffcfe4',stroke:'#eaa1c3'}
} as const;
type Tone=keyof typeof TONES;
/** Elemento de diseño propio: forma con su dibujo, tono y, si corresponde, icono y texto de ejemplo. */
function el(name:string,shape:Shape,[width,height]:[number,number],tone:Tone|'white',options:{icon?:Icon;kind?:NodeTemplate['kind'];label?:string;details?:string;large?:boolean;keywords?:string;accent?:Tone}={}):Item{
  // La tarjeta y la ventana son blancas: el color va en el encabezado o el borde.
  const style=tone==='white'?{fill:'#ffffff',stroke:TONES[options.accent??'slate'].stroke}:{...TONES[tone]};
  return {name,kind:options.kind??'custom',shape,label:options.label??name,size:{width,height},icon:options.icon,details:options.details,keywords:options.keywords,
    style:options.large?{...style,iconSize:'large'}:style};
}

/**
 * Paleta. `kind` conserva el significado (lo que la IA y la documentación entienden); `shape` es el dibujo.
 * Los temas generales usan formas con diseño propio, no la misma caja con otro icono: nota adhesiva, tarjeta, globo,
 * píldora, avatar, insignia, cinta, carpeta, ventana y paso.
 */
export const PALETTE:{title:string;open?:boolean;items:Item[]}[]=[
  {title:'Ideas y notas',open:true,items:[
    el('Nota adhesiva','sticky',[160,150],'sticky',{kind:'note',label:'Escribí acá',keywords:'post-it sticky nota'}),
    el('Nota verde','sticky',[160,150],'stickyMint',{kind:'note',label:'Otra idea',keywords:'post-it sticky'}),
    el('Idea','cloud',[200,124],'sun',{icon:'idea',large:true,kind:'note',keywords:'bombilla ocurrencia pensamiento'}),
    el('Pregunta','bubble',[200,100],'violet',{icon:'question',label:'¿Cómo lo hacemos?',keywords:'duda consulta'}),
    el('Objetivo','badge',[88,88],'mint',{icon:'target',keywords:'meta logro'}),
    el('Importante','ribbon',[200,56],'coral',{label:'Importante',keywords:'destacado prioridad cinta'}),
    el('Hecho','pill',[150,44],'mint',{icon:'check',keywords:'listo completado ok'}),
    el('Atención','pill',[150,44],'coral',{icon:'alert',keywords:'alerta riesgo problema cuidado'}),
    el('Etiqueta','pill',[150,44],'slate',{icon:'tag',keywords:'categoría'})
  ]},
  {title:'Personas',open:true,items:[
    el('Persona','avatar',[88,88],'blue',{kind:'actor',label:'Ana',keywords:'usuario cliente perfil'}),
    el('Cliente','avatar',[88,88],'pink',{kind:'actor',icon:'heart',keywords:'comprador'}),
    el('Estudiante','avatar',[88,88],'lime',{kind:'actor',icon:'graduation',keywords:'alumno'}),
    el('Docente','avatar',[88,88],'mint',{kind:'actor',icon:'book',keywords:'profesor maestro'}),
    el('Equipo','card',[190,104],'white',{kind:'actor',icon:'users',accent:'violet',details:'3 personas',keywords:'grupo área'}),
    el('Testimonio','bubble',[210,100],'pink',{label:'«Me resolvió el problema»',keywords:'opinión cita comentario'})
  ]},
  {title:'Viajes y planes',open:true,items:[
    el('Mapa','map',[168,112],'blue',{label:'Destino',keywords:'ubicación lugar recorrido ciudad'}),
    el('Avión','pill',[150,44],'blue',{icon:'plane',label:'Vuelo',keywords:'aeropuerto viaje'}),
    el('Auto','pill',[150,44],'slate',{icon:'car',label:'En auto',keywords:'ruta manejar'}),
    el('Micro','pill',[150,44],'sun',{icon:'bus',label:'Micro',keywords:'colectivo bus'}),
    el('Tren','pill',[150,44],'violet',{icon:'train',label:'Tren',keywords:'ferrocarril'}),
    el('Alojamiento','card',[190,104],'white',{icon:'bed',accent:'violet',label:'Hotel',details:'Check-in 14 h',keywords:'hotel hostel dormir'}),
    el('Día del viaje','card',[190,104],'white',{icon:'calendar',accent:'coral',label:'Día 1',details:'Llegada y paseo',keywords:'itinerario agenda'}),
    el('Playa','badge',[88,88],'sun',{icon:'umbrella',keywords:'mar costa verano'}),
    el('Comida','pill',[150,44],'coral',{icon:'food',label:'Restaurante',keywords:'comer cena almuerzo'}),
    el('Excursión','bubble',[200,100],'mint',{icon:'mountain',label:'Excursión a la sierra',keywords:'paseo salida'}),
    el('Entradas','pill',[150,44],'pink',{icon:'ticket',label:'Museo',keywords:'teatro cine show'}),
    el('Presupuesto','card',[190,104],'white',{icon:'coin',accent:'lime',label:'Presupuesto',details:'Total estimado',keywords:'dinero gastos costo'})
  ]},
  {title:'Procesos',items:[
    el('Paso','chevron',[170,64],'blue',{label:'Paso 1',keywords:'etapa fase flecha proceso'}),
    el('Siguiente paso','chevron',[170,64],'mint',{label:'Paso 2',keywords:'etapa fase flecha'}),
    el('Inicio','pill',[140,44],'blue',{icon:'flag',keywords:'comienzo arranque'}),
    el('Meta','ribbon',[190,56],'lime',{label:'Meta',keywords:'resultado logro final'}),
    el('Decisión','diamond',[170,104],'sun',{kind:'decision',label:'¿Sí o no?',keywords:'condición pregunta'}),
    el('Hito','badge',[88,88],'violet',{icon:'flag',keywords:'logro fecha'})
  ]},
  {title:'Negocio',items:[
    el('Producto','card',[190,104],'white',{icon:'box',accent:'coral',details:'Descripción breve',keywords:'paquete oferta'}),
    el('Métrica','card',[190,104],'white',{icon:'chart',accent:'blue',label:'Ventas',details:'+12 % este mes',keywords:'gráfico datos indicador kpi'}),
    el('Venta','pill',[150,44],'mint',{icon:'cart',keywords:'compra carrito'}),
    el('Dinero','badge',[88,88],'lime',{icon:'coin',keywords:'pago precio costo'}),
    el('Crecimiento','chevron',[180,64],'mint',{label:'Crecimiento',keywords:'tendencia aumento'}),
    el('Contrato','document',[170,100],'white',{icon:'file',accent:'slate',keywords:'documento papel acuerdo'}),
    el('Empresa','folder',[190,110],'sun',{keywords:'organización área carpeta'}),
    el('Envío','pill',[150,44],'coral',{icon:'truck',keywords:'logística entrega'})
  ]},
  {title:'Educación',items:[
    el('Tema','folder',[190,110],'blue',{keywords:'unidad carpeta materia'}),
    el('Curso','card',[190,104],'white',{icon:'graduation',accent:'mint',details:'8 clases',keywords:'clase materia'}),
    el('Tarea','sticky',[160,150],'stickyPink',{kind:'note',keywords:'ejercicio pendiente'}),
    el('Concepto','ellipse',[180,96],'sun',{keywords:'idea mapa mental'}),
    el('Investigar','bubble',[200,100],'blue',{icon:'search',label:'¿Qué sabemos?',keywords:'buscar averiguar'}),
    el('Evaluación','badge',[88,88],'mint',{icon:'check',keywords:'examen prueba nota'})
  ]},
  {title:'Comunicación y tecnología',items:[
    el('Página web','browser',[220,140],'white',{accent:'slate',label:'Inicio',keywords:'sitio pantalla navegador web'}),
    el('Video','browser',[220,140],'white',{accent:'pink',icon:'play',large:true,keywords:'reproducir youtube'}),
    el('App','rounded',[110,170],'slate',{icon:'phone',large:true,keywords:'celular móvil teléfono'}),
    el('Mensaje','bubble',[200,100],'blue',{icon:'chat',label:'Hola, ¿cómo va?',keywords:'chat conversación'}),
    el('Correo','card',[190,104],'white',{icon:'mail',accent:'blue',details:'Asunto del mensaje',keywords:'email'}),
    el('Aviso','pill',[150,44],'coral',{icon:'bell',keywords:'notificación'}),
    el('Internet','cloud',[200,124],'blue',{icon:'wifi',large:true,keywords:'red conexión nube'}),
    el('Enlace','pill',[150,44],'violet',{icon:'link',keywords:'link url'})
  ]},
  {title:'Lugares y tiempo',items:[
    el('Fecha','card',[180,104],'white',{icon:'calendar',accent:'coral',label:'15 de marzo',details:'Reunión de equipo',keywords:'día evento calendario'}),
    el('Hora','pill',[140,44],'violet',{icon:'clock',label:'10:30',keywords:'tiempo plazo'}),
    el('Semana','chevron',[170,64],'sun',{label:'Semana 1',keywords:'cronograma etapa tiempo'}),
    el('Casa','badge',[88,88],'coral',{icon:'home',keywords:'hogar'}),
    el('Lugar','avatar',[88,88],'pink',{icon:'pin',keywords:'ubicación mapa'}),
    el('Naturaleza','ellipse',[180,100],'mint',{icon:'leaf',large:true,keywords:'planta ambiente'}),
    el('Seguridad','badge',[88,88],'slate',{icon:'shield',keywords:'protección'}),
    el('Acceso','pill',[150,44],'sun',{icon:'key',keywords:'llave clave'})
  ]},
  {title:'Arquitectura',open:true,items:[
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

/**
 * Miniatura: el mismo nodo que se va a crear, dibujado por el canvas y reducido.
 */
function Thumb({template}:{template:NodeTemplate}){
  // El tamaño sale del texto real; después se dibuja sin texto (el avatar conserva la inicial, que es parte del diseño).
  const node=useMemo(()=>{const real=templateNode(template,{x:0,y:0});return {...real,label:real.shape==='avatar'&&!real.icon?real.label[0]??' ':' ',details:''};},[template]);
  const doc=useMemo(()=>singleNodeDocument(node),[node]),box=nodeRect(node),pad=Math.max(box.width,box.height)*.08+6;
  return <svg viewBox={`${box.x-pad} ${box.y-pad-6} ${box.width+pad*2} ${box.height+pad*2+6}`} aria-hidden="true" className="thumb"><DiagramLayer doc={doc}/></svg>;
}

// El navegador mostraría una foto del botón al arrastrar: se reemplaza por nada y el canvas dibuja el elemento real.
const EMPTY_DRAG=typeof Image==='function'?Object.assign(new Image(),{src:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}):null;
const normalize=(text:string)=>text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');

export function Palette(){
  const {tool,template}=useStore(viewStore),[query,setQuery]=useState('');
  const wanted=normalize(query.trim());
  // Al buscar, los resultados de todos los grupos se ven juntos y sin desplegables.
  const groups=wanted?[{title:`Resultados para «${query.trim()}»`,open:true,items:PALETTE.flatMap(g=>g.items.filter(i=>normalize(`${i.name} ${i.keywords??''} ${g.title}`).includes(wanted)))}]:PALETTE;
  const button=(group:string,{name,keywords:_keywords,...shape}:Item)=>{
    const chosen=tool==='node'&&template.kind===shape.kind&&template.shape===shape.shape&&template.label===shape.label&&template.icon===shape.icon;
    return <button key={group+name} className={'palette-item'+(chosen?' chosen':'')} aria-pressed={chosen} title={`${name}: clic y después clic en el canvas, o arrastrala`} draggable
      onClick={()=>viewStore.set({tool:'node',template:shape})}
      onDragStart={e=>{e.dataTransfer.setData(SHAPE_MIME,JSON.stringify(shape));e.dataTransfer.effectAllowed='copy';if(EMPTY_DRAG)e.dataTransfer.setDragImage(EMPTY_DRAG,0,0);viewStore.set({dragTemplate:shape});}}
      onDragEnd={()=>viewStore.set({dragTemplate:null})}>
      <Thumb template={shape}/><span>{name}</span>
    </button>;
  };
  return <div className="palette">
    <input type="search" className="palette-search" placeholder="Buscar elementos…" aria-label="Buscar elementos" value={query} onChange={e=>setQuery(e.target.value)}/>
    {groups.map(group=>wanted
      ?<div key={group.title}><p className="palette-results">{group.items.length?group.title:'Nada coincide. Probá con otra palabra.'}</p><div className="palette-grid">{group.items.map(i=>button(group.title,i))}</div></div>
      :<details key={group.title} open={group.open}>
        <summary>{group.title}</summary>
        <div className="palette-grid">{group.items.map(i=>button(group.title,i))}</div>
      </details>)}
  </div>;
}
