import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,type IncomingMessage,type Server,type ServerResponse} from 'node:http';
import type {AddressInfo} from 'node:net';
import {checkUrl,fetchLinkPreview,publicAddress,readHead,type LinkPreview} from '../src/linkPreview.js';
import {createApp} from '../src/server.js';
import {UsageLedger} from '../src/usage.js';

const listen=(server:Server)=>new Promise<number>(resolve=>server.listen(0,'127.0.0.1',()=>resolve((server.address() as AddressInfo).port)));
const close=(server:Server)=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);});
async function site(handler:(req:IncomingMessage,res:ServerResponse,port:number)=>void){
  let port=0;const server=createServer((req,res)=>handler(req,res,port));port=await listen(server);
  // La página de prueba vive en loopback: sólo esa dirección se habilita, el resto sigue la regla de producción.
  const options={ports:{'http:':port,'https:':443},allowAddress:(a:string)=>a==='127.0.0.1'||publicAddress(a)};
  return {port,options,url:`http://127.0.0.1:${port}`,close:()=>close(server)};
}

test('only public unicast addresses can be visited',()=>{
  for(const address of ['8.8.8.8','151.101.1.69','2606:4700::6810:85e5','::ffff:8.8.8.8'])assert.equal(publicAddress(address),true,address);
  for(const address of ['127.0.0.1','10.1.2.3','172.20.0.1','192.168.1.10','169.254.169.254','100.64.0.1','0.0.0.0','224.0.0.1','255.255.255.255',
    '::1','::','fe80::1','fc00::1','fd12::1','ff02::1','::ffff:127.0.0.1','::ffff:10.0.0.1','2002:7f00:1::1','64:ff9b::a00:1','2001:db8::1','localhost','not-an-ip'])assert.equal(publicAddress(address),false,address);
});

test('a link must be plain http or https on its usual port, without credentials',()=>{
  assert.equal(checkUrl('https://example.com/a#b').href,'https://example.com/a');
  for(const [url,code] of [['file:///etc/passwd','INVALID_URL'],['javascript:alert(1)','INVALID_URL'],['ftp://example.com','INVALID_URL'],['https://user:pw@example.com','INVALID_URL'],
    ['http://example.com:8080/','BLOCKED_URL'],['https://example.com:22/','BLOCKED_URL'],['no es una url','INVALID_URL']] as const)
    assert.throws(()=>checkUrl(url),(e:{code?:string})=>e.code===code,url);
});

test('internal names and mixed DNS answers are refused before connecting',async()=>{
  const resolve=(answers:string[])=>async()=>answers.map(address=>({address,family:address.includes(':')?6:4}));
  const guard=async(url:string,answers:string[])=>{
    try{await fetchLinkPreview(url,{resolve:resolve(answers)});assert.fail('debió rechazarse');}
    catch(e){assert.equal((e as {code?:string}).code,'BLOCKED_URL');}
  };
  await guard('http://metadata.internal/',['169.254.169.254']);
  await guard('http://intranet.example/',['10.0.0.8']);
  // Una respuesta pública y una interna: no hay forma segura de elegir, se rechaza todo.
  await guard('http://rebind.example/',['93.184.216.34','127.0.0.1']);
  await guard('http://[::1]/',[]);
  await guard('http://127.0.0.1/',[]);
});

test('a page gives back its title, description and site as plain text, read from the head only',async()=>{
  const s=await site((req,res)=>{
    res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
    res.end(`<!doctype html><html><head><title>Fallback</title><meta property="og:title" content="Playa &amp; sol en Mar del Plata"><meta name="description" content='Guía &#8220;completa&#8221; <b>para</b>
      ir en verano'><meta property="og:site_name" content="Turismo\u0007 MdP"><script>alert(1)</script></head><body><meta property="og:title" content="no"></body></html>`);
  });
  try{
    const preview=await fetchLinkPreview(s.url+'/guia',s.options);
    assert.deepEqual(preview,{url:s.url+'/guia',title:'Playa & sol en Mar del Plata',description:'Guía “completa” para ir en verano',site:'Turismo MdP'});
  }finally{await s.close();}
  assert.deepEqual(readHead(Buffer.from('<title>Peña</title>','latin1'),'text/html; charset=iso-8859-1'),{title:'Peña',description:null,site:null});
});

test('every redirect is checked again, and redirects, slow pages and non-HTML are bounded',async()=>{
  const s=await site((req,res,port)=>{
    if(req.url==='/to-internal'){res.writeHead(302,{location:`http://10.0.0.5:${port}/`});return void res.end();}
    if(req.url==='/loop'){res.writeHead(301,{location:'/loop'});return void res.end();}
    if(req.url==='/moved'){res.writeHead(301,{location:'/final'});return void res.end();}
    if(req.url==='/final'){res.writeHead(200,{'content-type':'text/html'});return void res.end('<title>Llegaste</title>');}
    if(req.url==='/image'){res.writeHead(200,{'content-type':'image/png'});return void res.end(Buffer.alloc(100));}
    if(req.url==='/huge'){res.writeHead(200,{'content-type':'text/html'});res.write('<title>Grande</title>');const chunk=Buffer.alloc(64*1024,32);for(let i=0;i<64;i++)res.write(chunk);return void res.end();}
    if(req.url==='/slow'){res.writeHead(200,{'content-type':'text/html'});res.write('<title>');return;}
    res.writeHead(404);res.end();
  });
  const code=async(path:string,extra:object={})=>{try{await fetchLinkPreview(s.url+path,{...s.options,...extra});return 'ok';}catch(e){return (e as {code?:string}).code;}};
  try{
    assert.equal((await fetchLinkPreview(s.url+'/moved',s.options)).title,'Llegaste');
    assert.equal(await code('/to-internal'),'BLOCKED_URL');
    assert.equal(await code('/loop'),'TOO_MANY_REDIRECTS');
    assert.equal(await code('/image'),'NOT_HTML');
    assert.equal(await code('/missing'),'UNREACHABLE');
    assert.equal(await code('/slow',{timeoutMs:300}),'TIMEOUT');
    assert.equal((await fetchLinkPreview(s.url+'/huge',s.options)).title,'Grande');
  }finally{await s.close();}
});

test('the gateway route keeps the link out of the log, validates it and caches the answer',async()=>{
  const calls:string[]=[],logged:string[]=[];
  const fake=async(url:string):Promise<LinkPreview>=>{calls.push(url);return {url,title:'Hotel',description:null,site:null};};
  const ledger=new UsageLedger({dailyTokenBudget:1000,dailyUsdBudget:1,requestsPerMinute:10,ledgerPath:null});
  const server=createApp({providers:[],ledger,productPrompt:'',allowedOrigins:[],token:null,linkPreview:fake,log:entry=>logged.push(entry.path),config:{maxOutputTokens:100,maxContextChars:1000,maxRepairs:0,timeoutMs:1000}});
  const url=`http://127.0.0.1:${await listen(server)}/v1/link-preview`;
  const post=(body:object)=>fetch(url,{method:'POST',headers:{'content-type':'application/json','x-diagramia-client':'editor'},body:JSON.stringify(body)});
  try{
    const first=await post({url:'https://hotel.example/reserva?x=1#top'});
    assert.equal(first.status,200);assert.equal((await first.json()).title,'Hotel');
    assert.equal((await post({url:'https://hotel.example/reserva?x=1'})).status,200);
    assert.deepEqual(calls,['https://hotel.example/reserva?x=1']);
    const bad=await post({url:'file:///etc/passwd'});
    assert.equal(bad.status,422);assert.equal((await bad.json()).error.code,'INVALID_URL');
    assert.equal((await post({})).status,400);
    assert.ok(logged.every(path=>path==='/v1/link-preview'));
  }finally{await close(server);}
});
