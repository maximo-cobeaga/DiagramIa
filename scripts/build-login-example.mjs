// Ejemplo reproducible de P2.4: una sola estructura editable con dos resultados y pistas sincronizadas.
import {writeFileSync} from 'node:fs';
import {SCHEMA_VERSION,validateDocument} from '../packages/core/dist/index.js';

const node=(id,kind,label,x,y,zoneId=null,shape=null)=>({id,kind,label,position:{x,y},size:{width:160,height:80},zoneId,shape});
const edge=(id,from,to,label='',alternative=false)=>({id,from,to,label,alternative});
const step=(id,caption,nodeIds,edgeIds,scenarioIds=[])=>({id,caption,nodeIds,edgeIds,scenarioIds,durationMs:1800});
const clip=(id,stepId,extra)=>({id,stepId,...extra});
const document=validateDocument({
  schemaVersion:SCHEMA_VERSION,id:'login-flow',title:'Inicio de sesión',revision:0,
  zones:[
    {id:'client-zone',label:'Cliente',bounds:{x:20,y:80,width:420,height:500}},
    {id:'backend-zone',label:'Backend',bounds:{x:500,y:80,width:760,height:580}}
  ],
  nodes:[
    node('user','actor','Usuario',80,240,'client-zone','actor'),
    node('frontend','service','Frontend',260,240,'client-zone'),
    node('api','service','API de autenticación',550,240,'backend-zone'),
    node('database','database','Base de usuarios',790,150,'backend-zone'),
    node('check','decision','¿Credenciales válidas?',800,350,'backend-zone','diamond'),
    node('session','cache','Sesión creada',1050,260,'backend-zone'),
    node('denied','note','Acceso denegado',1050,470,'backend-zone')
  ],
  edges:[
    edge('user-frontend','user','frontend','Ingresa usuario y contraseña'),
    edge('frontend-api','frontend','api','Envía credenciales'),
    edge('api-database','api','database','Consulta usuario'),
    edge('database-check','database','check','Verificación'),
    edge('check-session','check','session','Sí'),
    edge('session-frontend','session','frontend','Token o cookie'),
    edge('check-denied','check','denied','No',true),
    edge('denied-frontend','denied','frontend','Error visible',true)
  ],
  drawings:[],groups:[],frames:[{id:'backend-focus',label:'Autenticación',bounds:{x:490,y:70,width:780,height:610}}],
  animations:[{
    id:'login-animation',label:'Inicio de sesión',scenarios:[{id:'accepted',label:'Credenciales correctas'},{id:'rejected',label:'Credenciales incorrectas'}],
    steps:[
      step('enter','El usuario completa el formulario.',['user','frontend'],['user-frontend']),
      step('send','El frontend envía las credenciales.',['frontend','api'],['frontend-api']),
      step('lookup','La API consulta la base de usuarios.',['api','database'],['api-database']),
      step('decide','La API verifica el resultado.',['check'],['database-check']),
      step('allow','Se crea una sesión y se devuelve al frontend.',['session','frontend'],['check-session','session-frontend'],['accepted']),
      step('reject','El acceso se rechaza y se informa el error.',['denied','frontend'],['check-denied','denied-frontend'],['rejected'])
    ],
    tracks:[
      {id:'focus-track',label:'Foco técnico',kind:'highlight',clips:[clip('focus-db','lookup',{nodeIds:['database']}),clip('focus-check','decide',{nodeIds:['check']})]},
      {id:'caption-track',label:'Explicación',kind:'caption',clips:[clip('caption-allow','allow',{caption:'Se entrega una credencial de sesión.'}),clip('caption-reject','reject',{caption:'No se crea una sesión.'})]},
      {id:'camera-track',label:'Cámara',kind:'camera',clips:[clip('camera-lookup','lookup',{frameId:'backend-focus'})]}
    ]
  }],assets:[],annotations:[],appliedBatches:[]
});
writeFileSync(new URL('../examples/login.diagramia.json',import.meta.url),JSON.stringify(document,null,2)+'\n');
