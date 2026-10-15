import {useMemo,useState} from 'react';
import {nodeRect,type DiagramNode} from '@diagramia/core';
import {useStore} from '../store/createStore';
import {viewStore,type NodeTemplate} from '../store/viewStore';
import {SHAPE_MIME} from '../canvas/Canvas';
import {DiagramLayer} from '../canvas/DiagramLayer';
import {singleNodeDocument,templateNode} from '../canvas/templateNode';
import {t} from '../i18n';

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
  {title:t('Ideas y notas'),open:true,items:[
    el(t('Nota adhesiva'),'sticky',[160,150],'sticky',{kind:'note',keywords:t('post-it sticky nota')}),
    el(t('Nota verde'),'sticky',[160,150],'stickyMint',{kind:'note',label:t('Otra idea'),keywords:t('post-it sticky')}),
    el(t('Idea'),'cloud',[200,124],'sun',{icon:'idea',large:true,kind:'note',keywords:t('bombilla ocurrencia pensamiento')}),
    el(t('Pregunta'),'bubble',[200,100],'violet',{icon:'question',label:t('¿Cómo lo hacemos?'),keywords:t('duda consulta')}),
    el(t('Objetivo'),'badge',[88,88],'mint',{icon:'target',keywords:t('meta logro')}),
    el(t('Importante'),'ribbon',[200,56],'coral',{label:t('Importante'),keywords:t('destacado prioridad cinta')}),
    el(t('Hecho'),'pill',[150,44],'mint',{icon:'check',keywords:t('listo completado ok')}),
    el(t('Atención'),'pill',[150,44],'coral',{icon:'alert',keywords:t('alerta riesgo problema cuidado')}),
    el(t('Etiqueta'),'pill',[150,44],'slate',{icon:'tag',keywords:t('categoría')})
  ]},
  {title:t('Personas'),open:true,items:[
    el(t('Persona'),'avatar',[88,88],'blue',{kind:'actor',label:t('Ana'),keywords:t('usuario cliente perfil')}),
    el(t('Cliente'),'avatar',[88,88],'pink',{kind:'actor',icon:'heart',keywords:t('comprador')}),
    el(t('Estudiante'),'avatar',[88,88],'lime',{kind:'actor',icon:'graduation',keywords:t('alumno')}),
    el(t('Docente'),'avatar',[88,88],'mint',{kind:'actor',icon:'book',keywords:t('profesor maestro')}),
    el(t('Equipo'),'card',[190,104],'white',{kind:'actor',icon:'users',accent:'violet',details:t('3 personas'),keywords:t('grupo área')}),
    el(t('Testimonio'),'bubble',[210,100],'pink',{label:t('«Me resolvió el problema»'),keywords:t('opinión cita comentario')})
  ]},
  {title:t('Viajes y planes'),open:true,items:[
    el(t('Mapa'),'map',[168,112],'blue',{label:t('Destino'),keywords:t('ubicación lugar recorrido ciudad')}),
    el(t('Avión'),'pill',[150,44],'blue',{icon:'plane',label:t('Vuelo'),keywords:t('aeropuerto viaje')}),
    el(t('Auto@@vehículo'),'pill',[150,44],'slate',{icon:'car',label:t('En auto'),keywords:t('ruta manejar')}),
    el(t('Micro@@vehículo'),'pill',[150,44],'sun',{icon:'bus',label:t('Micro@@vehículo'),keywords:t('colectivo bus')}),
    el(t('Tren'),'pill',[150,44],'violet',{icon:'train',label:t('Tren'),keywords:t('ferrocarril')}),
    el(t('Alojamiento'),'card',[190,104],'white',{icon:'bed',accent:'violet',label:t('Hotel'),details:t('Check-in 14 h'),keywords:t('hotel hostel dormir')}),
    el(t('Día del viaje'),'card',[190,104],'white',{icon:'calendar',accent:'coral',label:t('Día 1'),details:t('Llegada y paseo'),keywords:t('itinerario agenda')}),
    el(t('Playa'),'badge',[88,88],'sun',{icon:'umbrella',keywords:t('mar costa verano')}),
    el(t('Comida'),'pill',[150,44],'coral',{icon:'food',label:t('Restaurante'),keywords:t('comer cena almuerzo')}),
    el(t('Excursión'),'bubble',[200,100],'mint',{icon:'mountain',label:t('Excursión a la sierra'),keywords:t('paseo salida')}),
    el(t('Entradas'),'pill',[150,44],'pink',{icon:'ticket',label:t('Museo'),keywords:t('teatro cine show')}),
    el(t('Presupuesto'),'card',[190,104],'white',{icon:'coin',accent:'lime',label:t('Presupuesto'),details:t('Total estimado'),keywords:t('dinero gastos costo')})
  ]},
  {title:t('Procesos'),items:[
    el(t('Paso'),'chevron',[170,64],'blue',{label:t('Paso 1'),keywords:t('etapa fase flecha proceso')}),
    el(t('Siguiente paso'),'chevron',[170,64],'mint',{label:t('Paso 2'),keywords:t('etapa fase flecha')}),
    el(t('Inicio'),'pill',[140,44],'blue',{icon:'flag',keywords:t('comienzo arranque')}),
    el(t('Meta'),'ribbon',[190,56],'lime',{label:t('Meta'),keywords:t('resultado logro final')}),
    el(t('Decisión'),'diamond',[170,104],'sun',{kind:'decision',label:t('¿Sí o no?'),keywords:t('condición pregunta')}),
    el(t('Hito'),'badge',[88,88],'violet',{icon:'flag',keywords:t('logro fecha')})
  ]},
  {title:t('Negocio'),items:[
    el(t('Producto'),'card',[190,104],'white',{icon:'box',accent:'coral',details:t('Descripción breve'),keywords:t('paquete oferta')}),
    el(t('Métrica'),'card',[190,104],'white',{icon:'chart',accent:'blue',label:t('Ventas'),details:t('+12 % este mes'),keywords:t('gráfico datos indicador kpi')}),
    el(t('Venta'),'pill',[150,44],'mint',{icon:'cart',keywords:t('compra carrito')}),
    el(t('Dinero'),'badge',[88,88],'lime',{icon:'coin',keywords:t('pago precio costo')}),
    el(t('Crecimiento'),'chevron',[180,64],'mint',{label:t('Crecimiento'),keywords:t('tendencia aumento')}),
    el(t('Contrato'),'document',[170,100],'white',{icon:'file',accent:'slate',keywords:t('documento papel acuerdo')}),
    el(t('Empresa'),'folder',[190,110],'sun',{keywords:t('organización área carpeta')}),
    el(t('Envío'),'pill',[150,44],'coral',{icon:'truck',keywords:t('logística entrega')})
  ]},
  {title:t('Educación'),items:[
    el(t('Tema'),'folder',[190,110],'blue',{keywords:t('unidad carpeta materia')}),
    el(t('Curso'),'card',[190,104],'white',{icon:'graduation',accent:'mint',details:t('8 clases'),keywords:t('clase materia')}),
    el(t('Tarea'),'sticky',[160,150],'stickyPink',{kind:'note',keywords:t('ejercicio pendiente')}),
    el(t('Concepto'),'ellipse',[180,96],'sun',{keywords:t('idea mapa mental')}),
    el(t('Investigar'),'bubble',[200,100],'blue',{icon:'search',label:t('¿Qué sabemos?'),keywords:t('buscar averiguar')}),
    el(t('Evaluación'),'badge',[88,88],'mint',{icon:'check',keywords:t('examen prueba nota')})
  ]},
  {title:t('Comunicación y tecnología'),items:[
    el(t('Página web'),'browser',[220,140],'white',{accent:'slate',label:t('Inicio@@web'),keywords:t('sitio pantalla navegador web')}),
    el(t('Video'),'browser',[220,140],'white',{accent:'pink',icon:'play',large:true,keywords:t('reproducir youtube')}),
    el(t('App'),'rounded',[110,170],'slate',{icon:'phone',large:true,keywords:t('celular móvil teléfono')}),
    el(t('Mensaje'),'bubble',[200,100],'blue',{icon:'chat',label:t('Hola, ¿cómo va?'),keywords:t('chat conversación')}),
    el(t('Correo'),'card',[190,104],'white',{icon:'mail',accent:'blue',details:t('Asunto del mensaje'),keywords:'email'}),
    el(t('Aviso'),'pill',[150,44],'coral',{icon:'bell',keywords:t('notificación')}),
    el(t('Internet'),'cloud',[200,124],'blue',{icon:'wifi',large:true,keywords:t('red conexión nube')}),
    el(t('Enlace'),'pill',[150,44],'violet',{icon:'link',keywords:t('link url')})
  ]},
  {title:t('Lugares y tiempo'),items:[
    el(t('Fecha'),'card',[180,104],'white',{icon:'calendar',accent:'coral',label:t('15 de marzo'),details:t('Reunión de equipo'),keywords:t('día evento calendario')}),
    el(t('Hora'),'pill',[140,44],'violet',{icon:'clock',label:'10:30',keywords:t('tiempo plazo')}),
    el(t('Semana'),'chevron',[170,64],'sun',{label:t('Semana 1'),keywords:t('cronograma etapa tiempo')}),
    el(t('Casa'),'badge',[88,88],'coral',{icon:'home',keywords:t('hogar')}),
    el(t('Lugar'),'avatar',[88,88],'pink',{icon:'pin',keywords:t('ubicación mapa')}),
    el(t('Naturaleza'),'ellipse',[180,100],'mint',{icon:'leaf',large:true,keywords:t('planta ambiente')}),
    el(t('Seguridad'),'badge',[88,88],'slate',{icon:'shield',keywords:t('protección')}),
    el(t('Acceso'),'pill',[150,44],'sun',{icon:'key',keywords:t('llave clave')})
  ]},
  {title:t('Arquitectura'),open:true,items:[
    item(t('Servicio'),'service',null),item(t('Base de datos'),'database',null,160,88),item(t('Caché'),'cache',null),item(t('Cola'),'queue',null),
    item(t('Externo'),'external',null,160,80,t('Sistema externo')),item(t('Actor'),'actor',null,150,64,t('Usuario')),item(t('Decisión'),'decision',null,160,96,t('¿Condición?')),item(t('Nota'),'note',null,176,88),item(t('Texto'),'text',null,160,40)
  ]},
  {title:t('Básicas'),items:[
    item(t('Rectángulo'),'custom','rectangle'),item(t('Redondeado'),'custom','rounded'),item(t('Elipse'),'custom','ellipse',160,88),item(t('Círculo'),'custom','circle',96,96),
    item(t('Rombo'),'custom','diamond',152,96),item(t('Triángulo'),'custom','triangle',128,104),item(t('Hexágono'),'custom','hexagon',160,88),item(t('Paralelogramo'),'custom','parallelogram',168,80),
    item(t('Trapecio'),'custom','trapezoid',168,80),item(t('Estrella'),'custom','star',112,104),item(t('Nube'),'custom','cloud',176,104),item(t('Cilindro'),'custom','cylinder',128,96)
  ]},
  {title:t('Diagrama de flujo'),items:[
    item(t('Inicio / fin'),'custom','terminator',152,56,t('Inicio')),item(t('Proceso'),'custom','rectangle',160,72),item(t('Decisión'),'decision','diamond',160,96,t('¿Condición?')),item(t('Datos'),'custom','parallelogram',168,72,t('Entrada / salida')),
    item(t('Documento'),'custom','document',160,88),item(t('Subproceso'),'custom','predefined',168,72),item(t('Entrada manual'),'custom','manual-input',160,72),item(t('Espera'),'custom','delay',152,72),
    item(t('Preparación'),'custom','hexagon',168,72),item(t('Almacén'),'database','cylinder',128,96,t('Datos'))
  ]},
  {title:'UML',items:[
    item(t('Clase'),'custom','class',184,112,'NombreDeClase'),item(t('Actor'),'actor','actor',56,88),item(t('Caso de uso'),'custom','ellipse',176,80),item(t('Paquete'),'custom','package',176,104),
    item(t('Componente'),'custom','component',168,80),item(t('Estado'),'custom','rounded',152,64),item(t('Nota'),'note','note',176,88),item(t('Inicio'),'custom','start',36,36),item(t('Fin'),'custom','end',36,36)
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
  const {tool,template,paletteLayout}=useStore(viewStore),[query,setQuery]=useState('');
  const wanted=normalize(query.trim());
  // Al buscar, los resultados de todos los grupos se ven juntos y sin desplegables.
  const groups=wanted?[{title:t('Resultados para «{0}»',query.trim()),open:true,items:PALETTE.flatMap(g=>g.items.filter(i=>normalize(`${i.name} ${i.keywords??''} ${g.title}`).includes(wanted)))}]:PALETTE;
  const button=(group:string,{name,keywords:_keywords,...shape}:Item)=>{
    const chosen=tool==='node'&&template.kind===shape.kind&&template.shape===shape.shape&&template.label===shape.label&&template.icon===shape.icon;
    return <button key={group+name} className={'palette-item'+(chosen?' chosen':'')} aria-label={name} aria-pressed={chosen} title={t('{0}: clic y después clic en el canvas, o arrastrala',name)} draggable
      onClick={()=>viewStore.set({tool:'node',template:shape})}
      onDragStart={e=>{e.dataTransfer.setData(SHAPE_MIME,JSON.stringify(shape));e.dataTransfer.effectAllowed='copy';if(EMPTY_DRAG)e.dataTransfer.setDragImage(EMPTY_DRAG,0,0);viewStore.set({dragTemplate:shape});}}
      onDragEnd={()=>viewStore.set({dragTemplate:null})}>
      <Thumb template={shape}/><span>{name}</span>
    </button>;
  };
  return <div className={'palette catalog-'+paletteLayout}>
    <div className="catalog-heading"><span className="eyebrow">{t('TU CAJA DE IDEAS')}</span><button className="quiet" aria-label={paletteLayout==='list'?t('Ver elementos en cuadrícula'):t('Ver elementos en lista')} title={t('Cambiar vista del catálogo')} onClick={()=>viewStore.set({paletteLayout:paletteLayout==='list'?'grid':'list'})}>{paletteLayout==='list'?'▦':'☰'}</button></div>
    <input type="search" className="palette-search" placeholder={t('Buscar elementos…')} aria-label={t('Buscar elementos')} value={query} onChange={e=>setQuery(e.target.value)}/>
    {groups.map(group=>wanted
      ?<div key={group.title}><p className="palette-results">{group.items.length?group.title:t('Nada coincide. Probá con otra palabra.')}</p><div className="palette-grid">{group.items.map(i=>button(group.title,i))}</div></div>
      :<details key={group.title} open={group.open}>
        <summary>{group.title}</summary>
        <div className="palette-grid">{group.items.map(i=>button(group.title,i))}</div>
      </details>)}
  </div>;
}
