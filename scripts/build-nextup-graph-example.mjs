// Diagrama de exhibición pedido por el usuario a partir de graph-diagram.txt: NextUp + Microsoft Graph.
// La disposición es manual (tres zonas en banda, personas fuera de ellas); el engine valida y enruta.
import {writeFileSync} from 'node:fs';
import {applyBatch,DESIGN_TONES,emptyDocument,findOverlaps,fitSize,NodeSchema,nodeVisualRect,validateDocument} from '../packages/core/dist/index.js';

const tone=Object.fromEntries(DESIGN_TONES.map(t=>[t.name,t]));
const HUMAN='#c99700',ERROR='#e2603a',INK='#141619';
const docs={graph:'https://learn.microsoft.com/en-us/graph/overview',rbac:'https://learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac',
  auth:'https://learn.microsoft.com/en-us/graph/auth-v2-service',delta:'https://learn.microsoft.com/en-us/graph/api/message-delta?view=graph-rest-1.0'};

const nodes=[],edges=[];
/** Nodo centrado en (cx, cy), con el tamaño que su texto necesita o el mínimo pedido. */
function add(id,zoneId,cx,cy,label,extra={},min={}){
  const node=NodeSchema.parse({id,zoneId,kind:'service',label,position:{x:0,y:0},size:{width:100,height:60},...extra});
  const fit=fitSize(node);
  node.size={width:Math.max(fit.width,min.width??0),height:Math.max(fit.height,min.height??0)};
  node.position={x:Math.round(cx-node.size.width/2),y:Math.round(cy-node.size.height/2)};
  nodes.push(node);return id;
}
const card=(name,icon,more={})=>({shape:'card',icon,style:{fill:'#ffffff',stroke:tone[name].stroke},...more});
const FLOW={style:{strokeWidth:2}},CONFIG={style:{stroke:HUMAN,strokeWidth:1.75,dash:'dashed'},endArrow:'open'},PERSON={style:{stroke:HUMAN,strokeWidth:2}};
const FAILURE={style:{stroke:ERROR,strokeWidth:1.75,dash:'dashed'},alternative:true};
function connect(from,to,label='',kind=FLOW,extra={}){const id=extra.id??`${from}-${to}`;edges.push({from,to,label,...kind,...extra,id});return id;}
/** Enganche sobre un lado del nodo, en una coordenada absoluta: dos extremos a la misma altura dan una línea recta. */
function pin(id,side,at){
  const n=nodes.find(x=>x.id===id),t=side==='left'||side==='right'?(at-n.position.y)/n.size.height:(at-n.position.x)/n.size.width;
  return side==='left'?{x:0,y:t}:side==='right'?{x:1,y:t}:side==='top'?{x:t,y:0}:{x:t,y:1};
}
function level(from,to,label,at,kind=FLOW,extra={}){
  const right=nodes.find(x=>x.id===from).position.x<nodes.find(x=>x.id===to).position.x;
  return connect(from,to,label,kind,{fromAnchor:pin(from,right?'right':'left',at),toAnchor:pin(to,right?'left':'right',at),...extra});
}

// Título, fuera de las zonas.
add('title',null,270,44,'NextUp × Microsoft Graph',{kind:'text',style:{fontSize:26,bold:true,align:'left'}},{width:460});
add('subtitle',null,270,104,'Control de reportes de backup recibidos por correo',{kind:'text',style:{fontSize:15,align:'left'}},{width:460});

// 1. Origen de reportes.
add('clients','origin',170,540,'Clientes',{kind:'external',...card('slate','building'),details:'Cada uno ejecuta sus backups\ncon una o más herramientas.'});
const tools=[['veeam','Veeam','server'],['iperius','Iperius','laptop'],['azure-backup','Azure Backup','cloud'],['aws-dlm','AWS DLM','box']];
tools.forEach(([id,label,icon],i)=>add(id,'origin',470,390+i*100,label,{kind:'external',shape:'pill',icon,style:{fill:tone.slate.fill,stroke:tone.slate.stroke}},{width:170}));

// 2. Microsoft 365. Todo lo que no es de NextUp se dibuja con borde punteado.
const ms=(icon,more)=>({kind:'external',...card('blue',icon),...more});
add('rbac','m365',900,420,'Exchange Online RBAC',ms('lock',{details:'Application Mail.Read, limitado\nal buzón de reportes.',link:docs.rbac}),{height:136});
add('entra','m365',1250,420,'Microsoft Entra ID',ms('key',{details:'Identifica a la app NextUp\ny emite tokens temporales.',link:docs.auth}),{height:136});
add('mailbox','m365',900,630,'Buzón de reportes',ms('mail',{subtitle:'EXCHANGE ONLINE',details:'Recibe y conserva los correos\nde todas las herramientas.'}));
add('graph','m365',1250,630,'Microsoft Graph',ms('cloud',{details:'API HTTPS para consultar\ncarpetas y mensajes.',link:docs.graph}),{height:136});
add('m365-pending','m365',1075,772,'Conexión real: pendiente de validar',{kind:'note',shape:'pill',icon:'clock',style:{fill:tone.sun.fill,stroke:HUMAN}});

// 3. NextUp.
const c=[1740,2110,2430,2750,3070,3500],r=[285,515,752];
add('config','nextup',c[0],r[0],'Configuración protegida',card('mint','key',{details:'Tenant ID · Client ID\nCertificado · ID del buzón'}));
add('worker','nextup',c[0],r[1],'Worker de NextUp',{icon:'gear',subtitle:'RONDA CADA 5 MIN',details:'MSAL · client credentials\nSólo solicitudes GET\nPrimera lectura: últimas 48 h',style:{fill:tone.mint.fill,stroke:tone.mint.stroke,iconSize:'large',bold:true}},{width:240,height:280});
add('health','nextup',c[0],r[2],'Salud y cobertura',card('mint','chart',{details:'Hasta dónde se leyó completo\nel buzón.'}));
add('next-link','nextup',c[1],r[0],'nextLink',card('mint','link',{details:'Quedan más páginas\nen esta ronda.'}));
add('delta-link','nextup',c[2],r[0],'deltaLink',card('mint','flag',{details:'Desde dónde seguir\nen la próxima ronda.',link:docs.delta}),{height:136});
add('parsers','nextup',c[1],r[1],'Parsers',card('mint','file',{details:'Herramienta, tarea, resultado,\ninicio, fin y errores.'}));
add('correlation','nextup',c[2],r[1],'Motor de correlación',card('mint','search',{details:'Carpeta, herramienta, tarea,\nremitente, asunto y horarios.'}));
add('rules','nextup',c[3],r[1],'Motor de reglas',card('mint','target',{details:'Agenda + evidencia + historial\n+ cobertura del buzón.'}));
add('postgres','nextup',c[4],r[1],'PostgreSQL',{kind:'database',details:'Catálogo, ejecuciones, evidencia,\ncursores, auditoría e informes.',style:{fill:tone.mint.fill,stroke:tone.mint.stroke}});
add('web','nextup',c[5],r[1],'Aplicación web',{shape:'browser',details:'Resumen, tareas, control diario,\nrevisión, salud e informes.',style:{fill:'#ffffff',stroke:tone.mint.stroke}});
add('review','nextup',c[2],r[2],'Bandeja de revisión',card('mint','question',{details:'Varios candidatos o datos\ninsuficientes: decide una persona.'}));
add('nolog','nextup',c[3],r[2],'«No llegó log»',{kind:'note',shape:'sticky',details:'Sólo si venció el plazo y la\nlectura completa del buzón\ncubrió ese momento.',style:{fill:'#ffe978',stroke:'#e2c341'}});
add('queue','nextup',c[5],r[2],'Cola de trabajos',{kind:'queue',icon:'queue',details:'Informes y exportaciones\nen segundo plano.',style:{fill:tone.mint.fill,stroke:tone.mint.stroke}});

// Personas, junto a lo que usan. Sin relleno propio: el nombre va debajo, sobre el lienzo, y tiene que leerse en claro y en oscuro.
const person={kind:'actor',shape:'avatar',icon:'user',style:{stroke:HUMAN,strokeWidth:2.5}};
add('admin',null,1075,72,'Administrador de Microsoft 365',person);
add('operator',null,3860,r[1]-20,'Operador',person);
add('restore',null,3860,r[0]-10,'Éxito informado no es backup restaurable',{kind:'note',shape:'sticky',details:'El reporte dice lo que informó\nla herramienta. La restauración\nse comprueba con una prueba aparte.',style:{fill:'#ffe978',stroke:'#e2c341'}});

// Rama de error, estado actual y leyenda.
const failures=[['err-auth','Token rechazado o acceso denegado','La integración informa\nel problema.','lock'],['err-throttle','Microsoft limita las solicitudes','El adaptador espera\ny reintenta.','clock'],
  ['err-folder','Una carpeta no termina de sincronizar','La cobertura no avanza más allá\nde lo comprobado.','file'],['err-stale','El buzón no está actualizado','Se muestra la degradación y no\nse declaran faltantes.','alert']];
failures.forEach(([id,label,details,icon],i)=>add(id,'failures',1420+i*330,1070,label,card('coral',icon,{kind:'note',details}),{width:270,height:150}));
add('done','status',330,1070,'Implementado y probado en simulación',card('mint','check',{kind:'note',details:'Adaptador Graph, autenticación,\nlectura por carpetas, delta,\ndeduplicación, parsers sintéticos,\ncorrelación, reglas, interfaz\ny almacenamiento.'}),{width:270});
add('pending','status',660,1070,'Pendiente de validación real',card('sun','clock',{kind:'note',details:'Identidad y permisos del tenant,\ncredencial, acceso al buzón,\nformatos reales de correo,\nstaging y piloto operativo.'}),{width:270,height:nodes.at(-1).size.height});
const legend=[['flow','Automático','lo hace NextUp sin intervención',FLOW],['config','Configuración','se hace una sola vez',CONFIG],['person','Persona','revisa, decide y queda auditado',PERSON],['failure','Si algo falla','rama alternativa',FAILURE]];
legend.forEach(([id,label,meaning,kind],i)=>{
  add(`legend-${id}`,'legend',3000,1010+i*44,label,{kind:'text',style:{fontSize:14,bold:true,textColor:INK}},{width:140});
  add(`legend-${id}-meaning`,'legend',3380,1010+i*44,meaning,{kind:'text',style:{fontSize:13,align:'left',textColor:INK}},{width:270});
  connect(`legend-${id}`,`legend-${id}-meaning`,'',kind,{fromPort:'right',toPort:'left'});
});

// Flujo automático. Entre el worker y Microsoft, cada ida y vuelta es una línea recta propia.
for(const [id] of tools){connect('clients',id,'',{style:{strokeWidth:1.5}},{fromPort:'right',toPort:'left',line:'curved'});connect(id,'mailbox','envía reporte',FLOW,{fromPort:'right',toPort:'left',line:'curved'});}
connect('config','worker','carga credencial',FLOW,{fromAnchor:pin('config','bottom',c[0]-96),toAnchor:pin('worker','top',c[0]-96)});
level('worker','entra','solicita token',402);
level('entra','worker','devuelve token',462);
level('worker','graph','consulta carpetas',580);
level('worker','graph','consulta cambios',612,FLOW,{id:'worker-graph-delta'});
level('graph','worker','devuelve mensajes',644);
connect('graph','mailbox','lee el buzón',FLOW,{fromPort:'left',toPort:'right'});
connect('worker','next-link','sigue paginando',FLOW,{fromAnchor:pin('worker','right',420),toPort:'left'});
connect('next-link','delta-link','ronda completa');
connect('delta-link','postgres','guarda el cursor',FLOW,{fromPort:'right',toPort:'top'});
level('worker','parsers','interpreta',r[1]);
connect('parsers','correlation','asocia');connect('correlation','rules','evalúa');connect('rules','postgres','persiste');
connect('correlation','review','caso ambiguo',FLOW,{fromPort:'bottom',toPort:'top'});
connect('worker','health','actualiza',FLOW,{fromPort:'bottom',toPort:'top'});
level('postgres','web','muestra resultados',r[1]-18);
// Acciones humanas: configuración inicial (punteada) y trabajo diario del operador.
connect('admin','rbac','limita Mail.Read',CONFIG,{fromPort:'left',toAnchor:pin('rbac','top',972)});
connect('admin','entra','registra la app',CONFIG,{fromPort:'right',toAnchor:pin('entra','top',1338)});
connect('admin','config','entrega IDs y credencial',CONFIG,{fromPort:'right',toAnchor:pin('config','top',c[0]+96)});
connect('rbac','mailbox','sólo este buzón',CONFIG,{fromAnchor:pin('rbac','bottom',812),toAnchor:pin('mailbox','top',812)});
connect('operator','web','revisa',PERSON,{fromPort:'left',toPort:'right'});
level('web','postgres','registra decisiones',r[1]+20,PERSON);
connect('web','queue','pide informes',PERSON,{fromPort:'bottom',toPort:'top'});
for(const [id] of failures)connect('health',id,'',FAILURE,{fromPort:'bottom',toPort:'top'});

// Zonas: se ajustan a sus miembros; las tres principales comparten borde superior e inferior.
const zones=[['origin','1 · Origen de reportes','slate','solid'],['m365','2 · Microsoft 365','blue','dashed'],['nextup','3 · NextUp','mint','solid'],
  ['failures','Fallas y límites','coral','solid'],['status','Estado actual','violet','solid'],['legend','Cómo leer las flechas','lime','solid']];
const boxes=new Map(zones.map(([id])=>{
  const rects=nodes.filter(n=>n.zoneId===id).map(nodeVisualRect),x=Math.min(...rects.map(q=>q.x))-28,y=Math.min(...rects.map(q=>q.y))-56;
  return [id,{x,y,width:Math.max(...rects.map(q=>q.x+q.width))+28-x,height:Math.max(...rects.map(q=>q.y+q.height))+28-y}];
}));
function sameBand(ids){const band=ids.map(id=>boxes.get(id)),top=Math.min(...band.map(b=>b.y)),bottom=Math.max(...band.map(b=>b.y+b.height));for(const b of band){b.y=top;b.height=bottom-top;}}
sameBand(['origin','m365','nextup']);sameBand(['failures','status','legend']);

let doc=applyBatch(emptyDocument('nextup-graph','NextUp × Microsoft Graph · reportes de backup'),{id:'nextup-content',baseRevision:0,actions:[
  ...zones.map(([id,label,name,dash])=>({type:'CREATE_ZONE',zone:{id,label,bounds:boxes.get(id),style:{fill:tone[name].zoneFill,stroke:tone[name].zoneStroke,textColor:tone[name].stroke,dash}}})),
  ...nodes.map(node=>({type:'ADD_NODE',node})),...edges.map(edge=>({type:'ADD_EDGE',edge})),
  {type:'ADD_ANNOTATION',annotation:{id:'note-pending',targetId:'m365',severity:'warning',text:'La conexión real con Microsoft 365 todavía no está activada: el recorrido se probó en simulación.',suggestion:'Validar identidad, permisos y acceso al buzón en el tenant antes del piloto.'}},
  {type:'ADD_ANNOTATION',annotation:{id:'note-restore',targetId:'rules',severity:'info',text:'Un estado correcto refleja lo que informó la herramienta; no prueba que el backup pueda restaurarse.'}}]});

const pace=caption=>Math.max(3600,Math.min(8000,1800+caption.length*42));
const step=(id,caption,nodeIds=[],edgeIds=[],more={})=>({id,caption,nodeIds,edgeIds,durationMs:pace(caption),focus:'medium',...more});
const only=(scenario,more={})=>({scenarioIds:[scenario],...more});
doc=applyBatch(doc,{id:'nextup-motion',baseRevision:doc.revision,actions:[
  {type:'CREATE_ANIMATION',animation:{id:'cycle',label:'Ciclo automático de lectura · probado en simulación',scenarios:[{id:'normal',label:'Todo funciona',description:'La ronda completa, del reporte al operador.'},{id:'falla',label:'Algo falla',description:'Qué hace NextUp cuando no puede leer el buzón.'}],steps:[
    step('cycle-intro','NextUp centraliza el control de los reportes de backup. Las herramientas avisan por correo; NextUp lee ese buzón con Microsoft Graph, interpreta cada mensaje y lo compara con las tareas configuradas.',[],[],{focus:'overview',transition:'slow'}),
    step('cycle-reports','Veeam, Iperius, Azure Backup y AWS DLM ejecutan los backups y envían su reporte al buzón central de Microsoft 365. Graph todavía no interviene.',['clients',...tools.map(t=>t[0]),'mailbox'],tools.map(t=>`${t[0]}-mailbox`),{focus:'close',states:[{nodeId:'mailbox',label:'Reporte recibido'}]}),
    step('cycle-token','Cada 5 minutos el worker carga sus identificadores y la credencial, y MSAL solicita un token a Microsoft Entra ID. No hace falta ninguna sesión de usuario.',['config','worker','entra'],['config-worker','worker-entra']),
    step('cycle-token-back','Entra valida la identidad de NextUp y devuelve un token temporal, que queda en la memoria del proceso.',['entra','worker'],['entra-worker'],only('normal',{states:[{nodeId:'worker',label:'Token en memoria'}]})),
    step('cycle-folders','Con el token, el worker consulta las carpetas y subcarpetas del buzón. Microsoft verifica que el permiso alcance a ese buzón y a ningún otro.',['worker','graph','rbac','mailbox'],['worker-graph','graph-mailbox'],only('normal')),
    step('cycle-delta','Después pide los cambios de cada carpeta con delta y Graph devuelve los mensajes. Son sólo solicitudes GET: nada se marca como leído, se mueve ni se borra.',['worker','graph'],['worker-graph-delta','graph-worker'],only('normal',{states:[{nodeId:'graph',label:'Sólo lectura'}]})),
    step('cycle-cursors','nextLink avisa que quedan páginas en la ronda. deltaLink marca desde dónde seguir la próxima vez, y se guarda recién al terminar la carpeta.',['worker','next-link','delta-link','postgres'],['worker-next-link','next-link-delta-link','delta-link-postgres'],only('normal',{focus:'close'})),
    step('cycle-parse','Los parsers leen cada correo y extraen herramienta, tarea, resultado, inicio, fin y errores. El cuerpo completo se procesa en memoria.',['worker','parsers'],['worker-parsers'],only('normal')),
    step('cycle-match','El motor de correlación asocia el correo con una tarea y su ejecución. Si hay varios candidatos o faltan datos, el mensaje va a la bandeja de revisión.',['parsers','correlation','review'],['parsers-correlation','correlation-review'],only('normal')),
    step('cycle-rules','El motor de reglas combina agenda, evidencia, historial y cobertura del buzón. «No llegó log» sólo se declara si venció el plazo y la lectura cubrió ese momento.',['correlation','rules','nolog'],['correlation-rules'],only('normal',{states:[{nodeId:'rules',label:'Estado calculado'}]})),
    step('cycle-store','PostgreSQL conserva catálogo, ejecuciones, evidencia, cursores y auditoría. Del correo guarda metadatos, un hash y un extracto saneado.',['rules','postgres'],['rules-postgres'],only('normal')),
    step('cycle-operator','El operador revisa los resultados, resuelve los casos ambiguos, deja observaciones y pide informes. Cada decisión queda auditada.',['operator','web','postgres','queue','review'],['operator-web','postgres-web','web-postgres','web-queue'],only('normal',{focus:'close'})),
    step('cycle-denied','Si el token es rechazado o el acceso está denegado, la integración informa el problema en lugar de seguir.',['entra','worker','health','err-auth'],['worker-health','health-err-auth'],only('falla',{tone:'failure',focus:'close'})),
    step('cycle-throttled','Si Microsoft limita las solicitudes, el adaptador espera y reintenta.',['graph','worker','err-throttle'],['health-err-throttle'],only('falla',{tone:'failure',focus:'close'})),
    step('cycle-coverage','Si una carpeta no termina de sincronizarse o el buzón está desactualizado, la cobertura no avanza. NextUp muestra la degradación y no declara faltantes sin evidencia.',['health','err-folder','err-stale','rules'],['health-err-folder','health-err-stale'],only('falla',{tone:'failure',focus:'close'})),
    step('cycle-end','De la herramienta de backup al operador. Un reporte de éxito cuenta lo que informó la herramienta: que el backup pueda restaurarse se comprueba con una prueba aparte.',[],[],{focus:'overview',transition:'slow'})]}},
  {type:'CREATE_ANIMATION',animation:{id:'setup',label:'Configuración inicial · una sola vez',steps:[
    step('setup-admin','Antes del primer correo, el administrador de Microsoft 365 prepara identidad y permisos. Se hace una sola vez y no forma parte del ciclo automático.',['admin'],[],{focus:'wide',transition:'slow'}),
    step('setup-app','Registra una aplicación exclusiva para NextUp en Microsoft Entra ID. De ahí salen el Tenant ID y el Client ID.',['admin','entra'],['admin-entra'],{states:[{nodeId:'entra',label:'App registrada'}]}),
    step('setup-rbac','En Exchange Online concede Application Mail.Read mediante RBAC, limitado al buzón de reportes. No hacen falta permisos de envío ni de modificación.',['admin','rbac','mailbox'],['admin-rbac','rbac-mailbox'],{states:[{nodeId:'rbac',label:'Sólo lectura'}]}),
    step('setup-secret','NextUp guarda Tenant ID, Client ID, el certificado con su clave privada y el identificador del buzón en su configuración protegida.',['admin','config'],['admin-config'],{states:[{nodeId:'config',label:'Credencial protegida'}]}),
    step('setup-status','Hoy el recorrido está implementado y probado en simulación. La identidad, los permisos y el acceso real al buzón todavía esperan validación.',['done','pending','m365-pending'],[],{focus:'wide'})]}}]});
doc=validateDocument(doc);
writeFileSync(new URL('../examples/nextup-graph.diagramia.json',import.meta.url),JSON.stringify(doc,null,2)+'\n');
const issues=findOverlaps(doc);
console.log(`NextUp × Graph: ${doc.nodes.length} elementos, ${doc.edges.length} conexiones, ${doc.zones.length} zonas, ${doc.animations.map(a=>a.steps.length).join(' + ')} pasos.`);
console.log(issues.length?issues.map(i=>`  ${i.type}: ${i.message}`).join('\n'):'  Sin superposiciones.');
