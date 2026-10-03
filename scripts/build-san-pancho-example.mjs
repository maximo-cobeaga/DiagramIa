// Plan editable solicitado por el usuario. Precios observados y supuestos: docs/VIAJE_SAN_PANCHO.md.
import {writeFileSync} from 'node:fs';
import {applyBatch,designDocument,emptyDocument,fitSize,NodeSchema,validateDocument} from '../packages/core/dist/index.js';

const links={flight:'https://www.aeromexico.com/es_ar/vuelos-desde-buenos-aires-a-puerto-vallarta',hotel:'https://www.marakamesanpancho.com/',
  activities:'https://visitnayarit.travel/blog-nayarit/10-experiencias-de-nayarit-que-tienes-que-vivir/',tour:'https://www.vallarta-adventures.com/es/ofertas',
  community:'https://entreamigos.org/about-entreamigos-non-profit-san-pancho/ea-facility-and-tours/',weather:'https://visitapuertovallarta.com.mx/acerca-de-puerto-vallarta/clima'};
const choices=[{id:'nov',label:'18–27 nov 2026',night:2200,description:'Inicio de temporada seca. Salida de PVR el día 9; regreso a Mar del Plata el día 10.'},
  {id:'feb',label:'9–18 feb 2027',night:2700,description:'Invierno de la región. Se reserva más dinero para hotel; es un supuesto, no una tarifa confirmada.'},
  {id:'may',label:'11–20 may 2027',night:2000,description:'Antes del período lluvioso habitual. Más calor; verificar pronóstico cerca de la salida.'}];
const mexico=c=>Math.ceil((8*c.night+5400+4400+2500)*1.15/100)*100;
const money=n=>n.toLocaleString('es-AR');
const zones=[['overview','El viaje'],['dates','Tres fechas posibles'],['route','Cómo llegar'],['days','10 días · 8 noches'],['budget','Presupuesto por persona'],['book','Antes de reservar']];
const nodes=[],edges=[];
function add(id,zoneId,label,details,extra={}){
  const node=NodeSchema.parse({id,zoneId,kind:'note',label,details,position:{x:40,y:60},size:{width:240,height:100},...extra});
  node.size=fitSize(node);nodes.push(node);return id;
}
function connect(from,to,label=''){edges.push({id:`${from}-${to}`,from,to,label});}
add('destination','overview','San Pancho · Nayarit','San Francisco, México. Salida: Mar del Plata. Un adulto, habitación privada, 10 días totales y 8 noches en México.',{shape:'map',icon:'map',link:'https://www.openstreetmap.org/search?query=San%20Francisco%2C%20Nayarit%2C%20Mexico'});
add('assumptions','overview','Plan para cotizar','Estimaciones al 03/10/2026. Sin reservas ni precios garantizados. ARS y MXN separados; no hay conversión de moneda.',{shape:'sticky',icon:'alert'});
for(const c of choices)add(c.id,'dates',c.label,`${c.description}\nReserva Argentina: ARS 3.270.000 + México: MXN ${money(mexico(c))}, con margen del 15 %.`,{shape:'card',icon:'calendar',link:links.weather});
const route=[['mdp','Mar del Plata → Ezeiza','Cotizar ómnibus o traslado. La llegada debe dejar margen suficiente para el vuelo internacional. No hay horario confirmado.'],
  ['eze','EZE → PVR','Cotizar ida y vuelta con conexión, por ejemplo vía Ciudad de México. Confirmar conexión, equipaje y fecha real de llegada.',links.flight],
  ['pvr','PVR → San Pancho','Reservar traslado con el alojamiento. Para el plan se apartan MXN 3.000 ida y vuelta, dentro del rubro transporte.'],
  ['return','Regreso a Mar del Plata','Día 9: San Pancho → PVR → vuelo de regreso. Día 10: llegada a Ezeiza y traslado a Mar del Plata. Ajustar al horario comprado.']];
route.forEach(([id,label,details,link])=>add(id,'route',label,details,{shape:'chevron',icon:id==='eze'?'plane':'bus',...(link?{link}:{})}));
for(let i=1;i<route.length;i++)connect(route[i-1][0],route[i][0]);
const itinerary=[['Traslado y llegada','Mar del Plata → Ezeiza → PVR → San Pancho. Cena simple y descanso. Noche 1; si no se logra la conexión en el día, sumar una jornada.','plane'],
  ['Conocer San Pancho','Caminata por el centro y Avenida Tercer Mundo, cafés y atardecer. Día tranquilo para recuperarse del vuelo.','coffee'],
  ['Sayulita','Excursión de día. Paseo y clase de surf opcional con instructor. Volver a dormir a San Pancho.','wave'],
  ['Cultura y comunidad','Visitar Entreamigos según horario publicado y recorrer galerías. Tarde libre.','users'],
  ['Islas Marietas · opcional','Cotizar tour y punto de salida. Confirmar traslado desde San Pancho, cargos adicionales y acceso ofrecido; no dar por incluida Playa Escondida.','ship'],
  ['Descanso y comida local','Playa, lectura y paseo. Elegir actividades según banderas y condiciones del mar.','sun'],
  ['Lo de Marcos','Paseo de día al pueblo vecino; confirmar transporte de ida y regreso. Alternativa: quedarse en San Pancho.','pin'],
  ['Último día completo','Compras chicas, playa y cena. Preparar equipaje y confirmar el traslado. Noche 8.','bag'],
  ['Vuelo de regreso','Salida de San Pancho con margen al aeropuerto PVR. Conexión internacional y noche en tránsito, según vuelo.','plane'],
  ['Vuelta a Mar del Plata','Llegada a Ezeiza y traslado a casa. Es parte de los 10 días del viaje.','home']];
itinerary.forEach(([label,details,icon],i)=>add(`day-${i+1}`,'days',`Día ${i+1} · ${label}`,details,{shape:'card',icon,link:i===3?links.community:i===4?links.tour:links.activities}));
for(let i=1;i<10;i++)connect(`day-${i}`,`day-${i+1}`);
add('argentina','budget','Argentina · ARS 3.270.000','Reserva estimada: vuelo 2.400.000 + traslados 220.000 + seguro 80.000 + extras 140.000 = 2.840.000. Con 15 % de margen, redondeado hacia arriba.',{icon:'coin',shape:'badge',link:links.flight});
add('lodging','budget','Hotel · 8 noches','Supuestos por noche: noviembre MXN 2.200; febrero 2.700; mayo 2.000. Verificar impuestos, disponibilidad y cancelación con el hotel.',{icon:'bed',shape:'card',link:links.hotel});
add('food','budget','Comidas · MXN 5.400','Supuesto: 9 días × MXN 600. Combinar cafés, comida sencilla y cenas locales; no es una cotización de restaurante.',{icon:'food',shape:'card'});
add('transport','budget','Transporte · MXN 4.400','Supuesto: 3.000 aeropuerto ida y vuelta + 1.400 paseos locales. Sin alquiler de auto.',{icon:'bus',shape:'card'});
add('experiences','budget','Actividades · MXN 2.500','Reserva estimada para Marietas, surf u otras actividades. Confirmar tarifas, traslados y cargos; reemplazar una actividad si excede este rubro.',{icon:'ticket',shape:'card',link:links.tour});
add('totals','budget','México · con 15 % de margen',`Nov: MXN ${money(mexico(choices[0]))} · Feb: ${money(mexico(choices[1]))} · May: ${money(mexico(choices[2]))}. Sumar al presupuesto en ARS; no mezclar monedas sin cotizar el cambio.`,{icon:'chart',shape:'ribbon'});
add('check-flight','book','Cerrar vuelos y conexión','Cotizar primero EZE–PVR y luego el acceso desde Mar del Plata. Las tres ventanas son propuestas; confirmar que permiten 8 noches y regreso dentro del día 10.',{icon:'plane',link:links.flight});
add('check-hotel','book','Hotel y condiciones','Marakame y PAL.MAR son referencias para cotizar. La promoción para residentes de Jalisco/Nayarit no se aplica a este presupuesto.',{icon:'bed',link:links.hotel});
add('check-entry','book','Documentación y seguro','Consultar requisitos de ingreso y tránsito para tu pasaporte antes de pagar. Cotizar seguro, equipaje y forma de pago.',{icon:'file',link:'https://embamex.sre.gob.mx/argentina/'});
add('check-weather','book','Clima y flexibilidad','Verificar pronóstico cerca de la salida. Dejar Marietas y actividades acuáticas sujetas a condiciones del mar y confirmación del operador.',{icon:'umbrella',link:links.weather});
connect('totals','nov','Comparar fecha');connect('pvr','day-1','Llegada');connect('day-9','return','Volver');

let doc=applyBatch(emptyDocument('san-pancho','San Pancho desde Mar del Plata · 10 días'),{id:'trip-content',baseRevision:0,actions:[
  ...zones.map(([id,label])=>({type:'CREATE_ZONE',zone:{id,label,bounds:{x:0,y:0,width:10000,height:10000}}})),
  ...nodes.map(node=>({type:'ADD_NODE',node})),...edges.map(edge=>({type:'ADD_EDGE',edge}))]});
doc=applyBatch(doc,{id:'trip-design',baseRevision:doc.revision,actions:[...designDocument(doc).actions,{type:'ARRANGE_DOCUMENT'}]});
const step=(id,caption,nodeIds,focus='medium',transition='smooth',scenarioIds=[])=>({id,caption,nodeIds,edgeIds:[],focus,transition,scenarioIds,durationMs:4500});
doc=applyBatch(doc,{id:'trip-camera',baseRevision:doc.revision,actions:[{type:'CREATE_ANIMATION',animation:{id:'trip-tour',label:'Guía del viaje · comparar fechas',
  scenarios:choices.map(c=>({id:`date-${c.id}`,label:c.label})),steps:[step('tour-start','El viaje: San Pancho desde Mar del Plata',['destination','assumptions'],'close','slow'),
    ...choices.map(c=>step(`tour-${c.id}`,`Fecha y presupuesto: ${c.label}`,[c.id],'close','slow',[`date-${c.id}`])),
    step('tour-route','Cómo llegar y volver',route.map(r=>r[0]),'close'),step('tour-cost','Presupuesto separado por moneda',['argentina','lodging','food','transport','experiences','totals'],'close'),
    ...itinerary.map(([label],i)=>step(`tour-day-${i+1}`,`Día ${i+1}: ${label}`,[`day-${i+1}`],'close')),
    step('tour-check','Lo que falta cotizar y confirmar',['check-flight','check-hotel','check-entry','check-weather'],'close'),
    step('tour-all','La planificación completa',[],'overview','slow')]}}]});
doc=validateDocument(doc);
writeFileSync(new URL('../examples/san-pancho.diagramia.json',import.meta.url),JSON.stringify(doc,null,2)+'\n');
console.log(`San Pancho: ${doc.nodes.length} elementos, ${doc.zones.length} zonas, ${doc.animations[0].steps.length} pasos, 3 fechas. Presupuestos MXN: ${choices.map(mexico).join(', ')}.`);
