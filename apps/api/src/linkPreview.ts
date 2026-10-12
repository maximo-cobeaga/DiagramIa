import {lookup as dnsLookup} from 'node:dns/promises';
import {request as httpRequest,type IncomingMessage} from 'node:http';
import {request as httpsRequest} from 'node:https';
import {BlockList,isIP,type LookupFunction} from 'node:net';

/**
 * Vista previa de enlaces (P1.7, ADR 066): el servidor visita la página que el usuario pidió y devuelve sólo su título,
 * descripción y sitio, como texto. Es la única ruta del gateway que sale a una URL elegida por el usuario, así que:
 * - sólo http/https, en sus puertos de siempre, sin usuario ni contraseña en la URL;
 * - el nombre se resuelve antes de conectar y se rechaza si alguna dirección no es pública (loopback, red privada,
 *   link-local, metadatos de la nube, multicast, reservadas); la conexión usa esa misma dirección validada, así un
 *   DNS que cambia de respuesta entre la validación y la conexión no lleva a la red interna;
 * - cada redirección se valida igual, hasta tres;
 * - tiempo total, tamaño leído y tipo de contenido acotados; sin cookies ni credenciales.
 */
export type LinkPreview={url:string;title:string|null;description:string|null;site:string|null};
export class LinkPreviewError extends Error{constructor(readonly code:string,message:string,readonly status=422){super(message);}}

const blocked=new BlockList();
for(const [net,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const)blocked.addSubnet(net,prefix,'ipv4');
// IPv6: sólo unicast global (2000::/3), menos los rangos de documentación, túneles que pueden envolver direcciones
// privadas (6to4, Teredo) y NAT64. Las direcciones IPv4 mapeadas se validan como IPv4.
for(const [net,prefix] of [['2001::',32],['2001:db8::',32],['2002::',16],['64:ff9b::',96]] as const)blocked.addSubnet(net,prefix,'ipv6');
const global6=new BlockList();global6.addSubnet('2000::',3,'ipv6');

/** Si una dirección IP es pública y se puede visitar. */
export function publicAddress(address:string):boolean{
  const family=isIP(address);
  if(family===4)return !blocked.check(address,'ipv4');
  if(family!==6)return false;
  const mapped=/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if(mapped)return publicAddress(mapped[1]!);
  return global6.check(address,'ipv6')&&!blocked.check(address,'ipv6');
}

type Options={
  timeoutMs?:number;maxBytes?:number;maxRedirects?:number;
  /** Sólo para pruebas: puertos y direcciones admitidas. En producción, 80/443 y direcciones públicas. */
  ports?:{'http:':number;'https:':number};allowAddress?:(address:string)=>boolean;
  resolve?:(host:string)=>Promise<{address:string;family:number}[]>;
};
const DEFAULTS={timeoutMs:6000,maxBytes:256*1024,maxRedirects:3};

/** Valida la URL pedida antes de cualquier conexión. */
export function checkUrl(raw:string,ports:{'http:':number;'https:':number}={'http:':80,'https:':443}):URL{
  let url:URL;
  try{url=new URL(raw);}catch{throw new LinkPreviewError('INVALID_URL','El enlace no es una dirección web válida.');}
  if(url.protocol!=='http:'&&url.protocol!=='https:')throw new LinkPreviewError('INVALID_URL','Sólo se admiten enlaces http o https.');
  if(url.username||url.password)throw new LinkPreviewError('INVALID_URL','El enlace no puede llevar usuario ni contraseña.');
  if(Number(url.port||ports[url.protocol])!==ports[url.protocol])throw new LinkPreviewError('BLOCKED_URL','Sólo se visitan páginas en los puertos web habituales.');
  url.hash='';
  return url;
}

async function addressFor(url:URL,options:Options):Promise<{address:string;family:number}>{
  const allow=options.allowAddress??publicAddress,host=url.hostname.replace(/^\[|\]$/g,'');
  let found:{address:string;family:number}[];
  if(isIP(host))found=[{address:host,family:isIP(host)}];
  else try{found=await(options.resolve??(h=>dnsLookup(h,{all:true,verbatim:true})))(host);}catch{throw new LinkPreviewError('UNREACHABLE','No se encontró ese sitio.');}
  // Si alguna respuesta es interna, se rechaza todo: no hay forma segura de elegir sólo la pública.
  if(!found.length||found.some(f=>!allow(f.address)))throw new LinkPreviewError('BLOCKED_URL','Ese enlace apunta a una red privada o reservada: no se visita.');
  return found[0]!;
}

function get(url:URL,target:{address:string;family:number},signal:AbortSignal,maxBytes:number):Promise<{response:IncomingMessage;body:Buffer}>{
  // El nombre sigue siendo el del sitio (SNI y certificado de HTTPS), pero la conexión va a la dirección ya validada.
  const lookup:LookupFunction=(_host,opts,callback)=>{if((opts as {all?:boolean}).all)(callback as unknown as (e:null,a:{address:string;family:number}[])=>void)(null,[target]);else callback(null,target.address,target.family);};
  const request=url.protocol==='https:'?httpsRequest:httpRequest;
  return new Promise((resolve,reject)=>{
    const req=request(url,{method:'GET',lookup,signal,agent:false,headers:{'user-agent':'DiagramiaLinkPreview/1.0 (+vista previa de enlaces)','accept':'text/html,application/xhtml+xml','accept-encoding':'identity','accept-language':'es,en;q=0.5'}},response=>{
      const chunks:Buffer[]=[];let size=0;
      const type=String(response.headers['content-type']??'');
      if(response.statusCode&&response.statusCode>=300&&response.statusCode<400||!/text\/html|application\/xhtml\+xml/i.test(type)){response.destroy();return resolve({response,body:Buffer.alloc(0)});}
      response.on('data',(chunk:Buffer)=>{
        // Alcanza con el <head>: se corta al llegar al tope en lugar de rechazar la página.
        const room=maxBytes-size;if(room<=0)return;
        chunks.push(chunk.subarray(0,room));size+=Math.min(room,chunk.length);
        if(size>=maxBytes){response.destroy();resolve({response,body:Buffer.concat(chunks)});}
      });
      response.on('end',()=>resolve({response,body:Buffer.concat(chunks)}));
      response.on('error',error=>size>=maxBytes?resolve({response,body:Buffer.concat(chunks)}):reject(error));
    });
    req.on('error',reject);req.end();
  });
}

export async function fetchLinkPreview(raw:string,options:Options={}):Promise<LinkPreview>{
  const {timeoutMs,maxBytes,maxRedirects}={...DEFAULTS,...options},ports=options.ports??{'http:':80,'https:':443};
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    let url=checkUrl(raw,ports);
    for(let hop=0;;hop++){
      const target=await addressFor(url,options);
      let result:Awaited<ReturnType<typeof get>>;
      try{result=await get(url,target,controller.signal,maxBytes);}
      catch{throw controller.signal.aborted?new LinkPreviewError('TIMEOUT','La página tardó demasiado en responder.'):new LinkPreviewError('UNREACHABLE','No se pudo abrir esa página.');}
      const {response,body}=result,status=response.statusCode??0,location=response.headers.location;
      if(status>=300&&status<400&&location){
        if(hop>=maxRedirects)throw new LinkPreviewError('TOO_MANY_REDIRECTS','La página redirige demasiadas veces.');
        url=checkUrl(new URL(location,url).href,ports);continue;
      }
      if(status<200||status>=300)throw new LinkPreviewError('UNREACHABLE',`La página respondió con un error (${status}).`);
      if(!/text\/html|application\/xhtml\+xml/i.test(String(response.headers['content-type']??'')))throw new LinkPreviewError('NOT_HTML','El enlace no es una página web (por ejemplo, es una imagen o un archivo).');
      return {url:url.href,...readHead(body,String(response.headers['content-type']??''))};
    }
  }finally{clearTimeout(timer);}
}

const ENTITIES:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ntilde:'ñ',Ntilde:'Ñ',aacute:'á',eacute:'é',iacute:'í',oacute:'ó',uacute:'ú',uuml:'ü',Aacute:'Á',Eacute:'É',Iacute:'Í',Oacute:'Ó',Uacute:'Ú',iexcl:'¡',iquest:'¿',mdash:'—',ndash:'–',hellip:'…',laquo:'«',raquo:'»'};
// Largos acotados: una entidad sin cerrar no hace recorrer el texto una y otra vez.
const decode=(text:string)=>text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{1,10});/gi,(whole,name:string)=>{
  if(name[0]==='#'){const code=name[1]==='x'||name[1]==='X'?parseInt(name.slice(2),16):Number(name.slice(1));return code>0&&code<0x110000&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):'';}
  return ENTITIES[name]??whole;
});
// Texto plano de una línea: sin etiquetas, sin caracteres de control y acotado.
const MAX_TEXT=2000;
const clean=(text:string|undefined,max:number)=>{if(!text)return null;const value=decode(text.slice(0,MAX_TEXT)).replace(/<[^>]*>/g,' ').replace(/[\u0000-\u001f\u007f-\u009f]/g,' ').replace(/\s+/g,' ').trim();return value?value.slice(0,max):null;};

// La página es de un tercero y puede estar armada para trabar un patrón (miles de etiquetas sin cerrar): el <head> se lee
// en recorridos lineales, con tope de largo por etiqueta y de etiquetas revisadas. El gateway atiende en un solo hilo.
const MAX_TAG=4096,MAX_TAGS=300;
const space=(char:string|undefined)=>char===' '||char==='\t'||char==='\n'||char==='\r'||char==='\f';
/** Interior de las etiquetas `<name …>`. `lower` es el mismo texto en minúsculas ASCII (mismo largo). Un `>` entre comillas no cierra la etiqueta. */
function tagBodies(html:string,lower:string,name:string,limit=MAX_TAGS):{body:string;end:number}[]{
  const found:{body:string;end:number}[]=[];let from=0;
  for(let tries=0;tries<limit;tries++){
    const at=lower.indexOf('<'+name,from);if(at<0)break;
    const start=at+name.length+1,next=lower[start];from=start;
    if(next!==undefined&&!space(next)&&next!=='/'&&next!=='>')continue;
    const stop=Math.min(lower.length,at+MAX_TAG);let i=start,quote='';
    for(;i<stop;i++){const char=lower[i]!;if(quote){if(char===quote)quote='';}else if(char==='"'||char==="'")quote=char;else if(char==='>')break;}
    if(i<stop){found.push({body:html.slice(start,i),end:i+1});from=i+1;}
  }
  return found;
}
/** Atributos de una etiqueta en un solo recorrido; ante un nombre repetido vale el primero, como en HTML. */
function attributes(tag:string):Map<string,string>{
  const attrs=new Map<string,string>(),n=tag.length;let i=0;
  while(i<n){
    while(i<n&&(space(tag[i])||tag[i]==='/'))i++;
    const start=i;while(i<n&&!space(tag[i])&&tag[i]!=='='&&tag[i]!=='/')i++;
    const name=tag.slice(start,i).toLowerCase();
    while(i<n&&space(tag[i]))i++;
    if(tag[i]!=='=')continue;
    i++;while(i<n&&space(tag[i]))i++;
    const quote=tag[i];let value:string;
    if(quote==='"'||quote==="'"){const end=tag.indexOf(quote,i+1);value=tag.slice(i+1,end<0?n:end);i=end<0?n:end+1;}
    else{const from=i;while(i<n&&!space(tag[i]))i++;value=tag.slice(from,i);}
    if(name&&!attrs.has(name))attrs.set(name,value);
  }
  return attrs;
}

/** Título, descripción y sitio a partir del HTML recibido. Nunca se interpreta ni se ejecuta: sólo se buscan textos. */
export function readHead(body:Buffer,contentType=''):Omit<LinkPreview,'url'>{
  const sniff=body.subarray(0,2048).toString('latin1');
  const charset=(/charset=["']?([\w-]+)/i.exec(contentType)??/<meta[^>]+charset=["']?([\w-]+)/i.exec(sniff))?.[1]?.toLowerCase();
  let html:string;
  try{html=new TextDecoder(charset&&charset!=='utf8'?charset:'utf-8').decode(body);}catch{html=new TextDecoder('utf-8').decode(body);}
  const end=html.search(/<\/head>/i),head=end>=0?html.slice(0,end):html,lower=head.replace(/[A-Z]+/g,upper=>upper.toLowerCase());
  const meta=new Map<string,string>();
  for(const tag of tagBodies(head,lower,'meta')){
    const attrs=attributes(tag.body);
    const key=(attrs.get('property')??attrs.get('name'))?.toLowerCase(),content=attrs.get('content');
    if(key&&content!==undefined&&!meta.has(key))meta.set(key,content);
  }
  // El título es el texto entre <title> y su cierre, sin etiquetas adentro.
  let title:string|undefined;
  for(const tag of tagBodies(head,lower,'title',5)){
    const close=lower.indexOf('<',tag.end);
    if(close>=0&&lower.startsWith('</title',close)){title=head.slice(tag.end,close);break;}
  }
  return {
    title:clean(meta.get('og:title')??meta.get('twitter:title')??title,200),
    description:clean(meta.get('og:description')??meta.get('description')??meta.get('twitter:description'),300),
    site:clean(meta.get('og:site_name'),80),
  };
}

/** Caché chica en memoria: la misma página pedida varias veces en pocos minutos no se vuelve a visitar. */
export class LinkPreviewCache{
  private entries=new Map<string,{at:number;value:LinkPreview}>();
  constructor(private readonly ttlMs=10*60_000,private readonly max=300){}
  get(url:string){const hit=this.entries.get(url);if(!hit||Date.now()-hit.at>this.ttlMs){this.entries.delete(url);return null;}return hit.value;}
  set(url:string,value:LinkPreview){this.entries.delete(url);this.entries.set(url,{at:Date.now(),value});if(this.entries.size>this.max)this.entries.delete(this.entries.keys().next().value!);}
}
