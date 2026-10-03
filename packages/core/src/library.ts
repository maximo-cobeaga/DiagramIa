import {z} from 'zod';
import {Id,NodeSchema,EdgeSchema,ZoneSchema,SCHEMA_VERSION,NODE_KINDS,type ActionInput,type DiagramDocument} from './schema.js';
import {fail} from './errors.js';
import {validateDocument} from './engine.js';
import {nodeRect,unionRects,type Point} from './geometry.js';

export const ComponentSchema=z.strictObject({
  // `custom` son los elementos que arma el usuario: se insertan agrupados, como una sola pieza.
  id:Id,label:z.string().min(1).max(200),category:z.enum(['saas','cloud','process','custom']),description:z.string().max(300).default(''),
  nodes:z.array(NodeSchema).min(1).max(50),edges:z.array(EdgeSchema).max(100).default([]),zones:z.array(ZoneSchema).max(10).default([])
});
export const LibrarySchema=z.strictObject({libraryVersion:z.literal('1.0.0'),id:Id,label:z.string().min(1).max(200),components:z.array(ComponentSchema).max(200)});
export type DiagramComponent=z.infer<typeof ComponentSchema>;
export type DiagramLibrary=z.infer<typeof LibrarySchema>;

export function validateLibrary(input:unknown):DiagramLibrary{
  const library=LibrarySchema.parse(input);
  if(new Set(library.components.map(c=>c.id)).size!==library.components.length)fail('DUPLICATE_ID','La biblioteca repite IDs de componentes.');
  // Cada componente debe ser un fragmento coherente por sí mismo: se valida como un documento mínimo.
  for(const c of library.components){
    try{validateDocument({schemaVersion:SCHEMA_VERSION,id:c.id,title:c.label,revision:0,nodes:c.nodes,edges:c.edges,zones:c.zones,animations:[]});}
    catch(e){fail('INVALID_COMPONENT',`Componente ${c.id}: ${e instanceof Error?e.message:String(e)}`);}
  }
  return library;
}

/**
 * Convierte un componente en acciones con IDs nuevos (`local-N`), ubicado con su esquina superior izquierda en `at`.
 * El sufijo es el menor N libre en el documento: instanciar dos veces nunca colisiona y el resultado es determinista.
 */
export function instantiateComponent(d:DiagramDocument,component:DiagramComponent,at:Point):{actions:ActionInput[];nodeIds:string[]}{
  const taken=new Set([...d.nodes,...d.edges,...d.zones,...d.groups,...d.frames,...d.animations].map(x=>x.id));
  const locals=[...component.nodes,...component.edges,...component.zones].map(x=>x.id);
  let suffix=1;while(locals.some(id=>taken.has(`${id}-${suffix}`)))suffix++;
  const rename=(id:string)=>`${id}-${suffix}`;
  if(locals.some(id=>rename(id).length>80))fail('INVALID_COMPONENT','Los IDs del componente son demasiado largos para instanciarlo.');
  const box=unionRects([...component.nodes.map(nodeRect),...component.zones.map(z=>z.bounds)])!,dx=Math.round(at.x-box.x),dy=Math.round(at.y-box.y);
  const actions:ActionInput[]=[
    ...component.zones.map(z=>({type:'CREATE_ZONE' as const,zone:{...z,id:rename(z.id),bounds:{...z.bounds,x:z.bounds.x+dx,y:z.bounds.y+dy}}})),
    ...component.nodes.map(n=>({type:'ADD_NODE' as const,node:{...n,id:rename(n.id),groupId:null,assetId:null,zoneId:n.zoneId?rename(n.zoneId):null,position:{x:n.position.x+dx,y:n.position.y+dy}}})),
    ...component.edges.map(({points:_route,...e})=>({type:'ADD_EDGE' as const,edge:{...e,id:rename(e.id),from:rename(e.from),to:rename(e.to)}}))
  ];
  return {actions,nodeIds:component.nodes.map(n=>rename(n.id))};
}

type Kind=typeof NODE_KINDS[number];
const node=(id:string,kind:Kind,label:string,x:number,y:number,subtitle='',zoneId:string|null=null)=>({id,kind,label,position:{x,y},size:{width:150,height:82},zoneId,groupId:null,subtitle,assetId:null,icon:null,shape:null,style:{},details:''});
const edge=(from:string,to:string,label='',alternative=false)=>({id:`${from}-${to}`,from,to,label,alternative,fromPort:'auto' as const,toPort:'auto' as const,fromAnchor:null,toAnchor:null,startArrow:'none' as const,endArrow:'arrow' as const,line:'orthogonal' as const,style:{}});
const zone=(id:string,label:string,x:number,y:number,width:number,height:number)=>({id,label,bounds:{x,y,width,height},style:{}});

export const BUILTIN_LIBRARY:DiagramLibrary=validateLibrary({libraryVersion:'1.0.0',id:'diagramia-base',label:'Biblioteca base',components:[
  {id:'three-tier',label:'Aplicación en tres capas',category:'saas',description:'Cliente, frontend, API y base de datos con zona Backend.',
    zones:[zone('backend','Backend',420,0,470,190)],
    nodes:[node('client','actor','Cliente',0,60,'WEB'),node('web','service','Frontend',210,60,'SPA'),node('api','service','API',460,60,'REST','backend'),node('db','database','Base de datos',700,60,'SQL','backend')],
    edges:[edge('client','web','HTTPS'),edge('web','api','REST'),edge('api','db','SQL')]},
  {id:'api-cache',label:'API con caché',category:'saas',description:'Lectura con caché y persistencia.',
    nodes:[node('svc','service','API',0,0,'SERVICIO'),node('cache','cache','Redis',240,0,'CACHÉ'),node('store','database','PostgreSQL',0,160,'PERSISTENCIA')],
    edges:[edge('svc','cache','GET/SET'),edge('svc','store','SQL')]},
  {id:'queue-worker',label:'Cola y worker',category:'saas',description:'Trabajo asíncrono desacoplado por una cola.',
    nodes:[node('producer','service','API',0,0,'PRODUCE'),node('queue','queue','Cola',220,0,'MENSAJES'),node('worker','service','Worker',440,0,'CONSUME'),node('result','database','Resultados',660,0,'STORE')],
    edges:[edge('producer','queue','publica'),edge('queue','worker','entrega'),edge('worker','result','guarda')]},
  {id:'auth-flow',label:'Inicio de sesión',category:'saas',description:'Login delegado en un proveedor de identidad.',
    nodes:[node('person','actor','Usuario',0,90),node('login','service','Login',210,90,'FORM'),node('idp','external','Proveedor de identidad',420,90,'OIDC'),node('valid','decision','¿Válido?',630,90),node('session','service','Sesión',840,0,'TOKEN'),node('denied','note','Acceso denegado',840,180)],
    edges:[edge('person','login'),edge('login','idp','redirige'),edge('idp','valid'),edge('valid','session','sí'),edge('valid','denied','no',true)]},
  {id:'edge-balancer',label:'CDN y balanceador',category:'cloud',description:'Entrada pública con CDN, balanceo y dos réplicas.',
    zones:[zone('vpc','Red privada',420,0,480,300)],
    nodes:[node('visitor','actor','Usuario',0,110),node('cdn','external','CDN',210,110,'EDGE'),node('lb','service','Balanceador',450,110,'L7','vpc'),node('replica-a','service','Servicio A',700,40,'RÉPLICA','vpc'),node('replica-b','service','Servicio B',700,180,'RÉPLICA','vpc')],
    edges:[edge('visitor','cdn','HTTPS'),edge('cdn','lb'),edge('lb','replica-a'),edge('lb','replica-b')]},
  {id:'approval',label:'Proceso de aprobación',category:'process',description:'Solicitud, revisión y corrección con reintento.',
    nodes:[node('request','service','Solicitud',0,90),node('review','decision','¿Aprobada?',210,90),node('done','service','Aprobado',440,0),node('fix','service','Corrección',440,180)],
    edges:[edge('request','review'),edge('review','done','sí'),edge('review','fix','no',true),{...edge('fix','request','reenvía',true),fromPort:'bottom' as const,toPort:'bottom' as const}]}
]});
