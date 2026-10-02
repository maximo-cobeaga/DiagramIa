// OAuth resource-server + MCP Streamable HTTP reales, con PostgreSQL y issuer/JWKS locales efímeros.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createServer,request as httpRequest} from 'node:http';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import pg from 'pg';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {migrateDocuments,PostgresDocumentRepository} from '../apps/api/dist/repositories/postgres.js';
import {AccountRepository} from '../apps/api/dist/repositories/accounts.js';
import {RemoteMcpService} from '../apps/api/dist/mcp.js';
import {createApp} from '../apps/api/dist/server.js';
import {UsageLedger} from '../apps/api/dist/usage.js';
import {emptyDocument} from '../packages/core/dist/index.js';

const compose=fileURLToPath(new URL('../infra/compose.dev.yml',import.meta.url));
const suffix=randomUUID().slice(0,8),project=`diagramia-mcp-remote-${suffix}`,password=`diagramia-${suffix}`;
const env={...process.env,DIAGRAMIA_DB_PORT:'0',DIAGRAMIA_DB_PASSWORD:password};
const docker=(args)=>execFileSync('docker',['compose','-f',compose,'-p',project,...args],{env,timeout:240_000,maxBuffer:16*1024*1024,stdio:['pipe','pipe','pipe']});
const close=server=>new Promise(resolve=>server.close(resolve));
let pool,issuerServer,apiServer,error=null;
try{
  docker(['up','-d','--wait','--wait-timeout','120','db']);
  const address=docker(['port','db','5432']).toString().trim(),port=Number(address.match(/:(\d+)$/)?.[1]);
  pool=new pg.Pool({host:'127.0.0.1',port,user:'diagramia',database:'diagramia',password,max:5});
  await migrateDocuments(pool);
  const accounts=new AccountRepository(pool),repo=new PostgresDocumentRepository(pool);
  const {privateKey,publicKey}=await generateKeyPair('RS256'),publicJwk={...await exportJWK(publicKey),kid:'test-key',alg:'RS256',use:'sig'};
  issuerServer=createServer((req,res)=>{
    if(req.url==='/jwks'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({keys:[publicJwk]}));return;}
    res.writeHead(404);res.end();
  });
  await new Promise(resolve=>issuerServer.listen(0,'127.0.0.1',resolve));
  const issuer=`http://127.0.0.1:${issuerServer.address().port}/`;
  const alice=await accounts.signIn({issuer,subject:'alice',email:'alice@example.test'}),bob=await accounts.signIn({issuer,subject:'bob',email:'bob@example.test'});
  const docId=`remote-${suffix}`;
  await repo.createFrom(emptyDocument(docId,'De Alice'),alice.session.userId,alice.session.projectId);
  await repo.createFrom(emptyDocument(docId,'De Bob'),bob.session.userId,bob.session.projectId);
  const options={providers:[],ledger:new UsageLedger({dailyTokenBudget:1000,dailyUsdBudget:1,requestsPerMinute:10,ledgerPath:null}),config:{maxOutputTokens:1000,maxContextChars:1000,maxRepairs:0,timeoutMs:1000},productPrompt:'Prueba',allowedOrigins:[],token:null,accounts,documents:repo};
  apiServer=createApp(options);
  await new Promise(resolve=>apiServer.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${apiServer.address().port}`,resource=`${origin}/mcp`;
  options.remoteMcp=new RemoteMcpService({resourceUrl:resource,issuer,jwksUrl:issuer+'jwks'},accounts,repo);
  const mint=(subject,scope,audience=resource,expires='5m')=>new SignJWT({scope,azp:'test-host'}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setIssuer(issuer).setAudience(audience).setSubject(subject).setIssuedAt().setExpirationTime(expires).sign(privateKey);
  const metadata=await(await fetch(`${origin}/.well-known/oauth-protected-resource/mcp`)).json();
  assert.equal(metadata.resource,resource);assert.deepEqual(metadata.authorization_servers,[issuer]);
  const unauth=await fetch(resource,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  assert.equal(unauth.status,401);assert.match(unauth.headers.get('www-authenticate')??'',/resource_metadata=/);
  const wrongHost=await new Promise((resolve,reject)=>{const req=httpRequest(resource,{method:'POST',headers:{host:'evil.test',authorization:'Bearer x'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end('{}');});
  assert.equal(wrongHost,403);
  assert.equal((await fetch(resource,{method:'POST',headers:{origin:'https://evil.test',authorization:'Bearer x'},body:'{}'})).status,403);
  const {privateKey:wrongKey}=await generateKeyPair('RS256');
  const wrongSignature=await new SignJWT({scope:'diagramia:read'}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setIssuer(issuer).setAudience(resource).setSubject('alice').setIssuedAt().setExpirationTime('5m').sign(wrongKey);
  for(const bad of [await mint('alice','diagramia:read','https://other.example/mcp'),await mint('alice','diagramia:read',resource,'-5m'),wrongSignature,await mint('unknown','diagramia:read')]){
    const response=await fetch(resource,{method:'POST',headers:{authorization:`Bearer ${bad}`},body:'{}'});assert.equal(response.status,401);
  }
  const noRead=await fetch(resource,{method:'POST',headers:{authorization:`Bearer ${await mint('alice','diagramia:write')}`},body:'{}'});
  assert.equal(noRead.status,403);
  const connect=async token=>{const client=new Client({name:'diagramia-remote-smoke',version:'1.0.0'});await client.connect(new StreamableHTTPClientTransport(new URL(resource),{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));return client;};
  const readToken=await mint('alice','diagramia:read'),writeToken=await mint('alice','diagramia:read diagramia:write'),bobToken=await mint('bob','diagramia:read diagramia:write');
  const reader=await connect(readToken),writer=await connect(writeToken),bobClient=await connect(bobToken);
  try{
    const read=await reader.callTool({name:'read_canvas',arguments:{documentId:docId}});
    assert.notEqual(read.isError,true);assert.match(read.content[0].text,/De Alice/);
    const batch={id:'remote-edit',baseRevision:0,actions:[{type:'UPDATE_DOCUMENT',changes:{title:'Alice editó'}}]};
    await assert.rejects(reader.callTool({name:'apply_actions',arguments:{documentId:docId,batch}}),/403|Insufficient scope|insufficient_scope/i,'un token de lectura no escribe');
    const applied=await writer.callTool({name:'apply_actions',arguments:{documentId:docId,batch}});
    assert.notEqual(applied.isError,true);assert.equal((await repo.get(docId,alice.session.projectId)).title,'Alice editó');
    assert.equal((await repo.get(docId,bob.session.projectId)).title,'De Bob');
    const own=await bobClient.callTool({name:'read_canvas',arguments:{documentId:docId}});
    assert.match(own.content[0].text,/De Bob/);assert.doesNotMatch(own.content[0].text,/Alice editó/);
    const missing=await bobClient.callTool({name:'read_canvas',arguments:{documentId:'solo-alice'}});
    assert.equal(missing.isError,true);
    await pool.query("UPDATE project_memberships SET role='viewer' WHERE user_id=$1",[alice.session.userId]);
    const viewer=await connect(writeToken);
    try{await assert.rejects(viewer.callTool({name:'apply_actions',arguments:{documentId:docId,batch:{...batch,id:'viewer-edit',baseRevision:1}}}),/403|Insufficient scope|insufficient_scope/i);}finally{await viewer.close();}
  }finally{await Promise.all([reader.close(),writer.close(),bobClient.close()]);}
  console.log('MCP remoto OAuth: JWT/firma/audience, metadata, scopes, proyecto y host/origen aprobados.');
}catch(caught){error=caught;}finally{
  for(const server of [apiServer,issuerServer])if(server)try{await close(server);}catch(caught){error??=caught;}
  if(pool)try{await pool.end();}catch(caught){error??=caught;}
  try{docker(['down','--volumes','--remove-orphans']);}catch(caught){error??=caught;}
}
if(error)throw error;
