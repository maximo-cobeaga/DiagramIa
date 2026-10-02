import type {IncomingMessage,ServerResponse} from 'node:http';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {createMcpHandler,getOAuthProtectedResourceMetadataUrl,OAuthError,OAuthErrorCode,requireBearerAuth,type AuthInfo} from '@modelcontextprotocol/server';
import {toNodeHandler} from '@modelcontextprotocol/node';
import {createServer} from '@diagramia/mcp/server';
import type {AccountRepository} from './repositories/accounts.js';
import type {PostgresDocumentRepository} from './repositories/postgres.js';

export type RemoteMcpSettings={resourceUrl:string;issuer:string;jwksUrl:string};
const local=(url:URL)=>url.protocol==='http:'&&['127.0.0.1','localhost','::1'].includes(url.hostname);
const trusted=(input:string,label:string)=>{const url=new URL(input);if(url.protocol!=='https:'&&!local(url))throw new Error(`${label} requiere HTTPS o loopback HTTP.`);return url;};

/** Resource server OAuth: el proveedor emite tokens; Diagramia verifica firma, audience y permisos. */
export class RemoteMcpService{
  readonly resourceUrl:URL;
  readonly metadataPath:string;
  private readonly issuer:URL;
  private readonly nodeHandler:ReturnType<typeof toNodeHandler>;

  constructor(settings:RemoteMcpSettings,accounts:AccountRepository,repo:PostgresDocumentRepository){
    const resource=trusted(settings.resourceUrl,'MCP resource URL'),issuer=trusted(settings.issuer,'MCP issuer'),jwksUrl=trusted(settings.jwksUrl,'MCP JWKS URL');
    if(resource.pathname!=='/mcp'||resource.search||resource.hash)throw new Error('La URL pública MCP debe terminar en /mcp y no contener query ni fragmento.');
    if(jwksUrl.origin!==issuer.origin)throw new Error('La URL JWKS debe pertenecer al mismo origen del issuer configurado.');
    this.resourceUrl=resource;this.issuer=issuer;
    this.metadataPath=new URL(getOAuthProtectedResourceMetadataUrl(resource)).pathname;
    const keys=createRemoteJWKSet(jwksUrl,{timeoutDuration:5000});
    const verifier={verifyAccessToken:async(token:string):Promise<AuthInfo>=>{
      let payload:Awaited<ReturnType<typeof jwtVerify>>['payload'];
      try{({payload}=await jwtVerify(token,keys,{issuer:issuer.href,audience:resource.href,algorithms:['RS256'],requiredClaims:['sub','exp']}));}
      catch{throw new OAuthError(OAuthErrorCode.InvalidToken,'El token MCP es inválido, venció o no corresponde a este recurso.');}
      if(!payload.sub||!payload.exp)throw new OAuthError(OAuthErrorCode.InvalidToken,'Access token sin sujeto o caducidad.');
      const identity=await accounts.lookupIdentity(issuer.href,payload.sub);
      if(!identity)throw new OAuthError(OAuthErrorCode.InvalidToken,'La cuenta del token MCP no existe en Diagramia.');
      const scopes=typeof payload.scope==='string'?payload.scope.split(/\s+/).filter(Boolean):[];
      if(identity.role==='viewer')scopes.splice(0,scopes.length,...scopes.filter(scope=>scope!=='diagramia:write'));
      const clientId=typeof payload.azp==='string'?payload.azp:typeof payload.client_id==='string'?payload.client_id:payload.sub;
      return {token,clientId,scopes,expiresAt:payload.exp,resource,extra:{userId:identity.userId,projectId:identity.projectId}};
    }};
    const gate=requireBearerAuth({verifier,requiredScopes:['diagramia:read'],resourceMetadataUrl:getOAuthProtectedResourceMetadataUrl(resource)});
    const handler=createMcpHandler(({authInfo})=>{
      const userId=authInfo?.extra?.userId,projectId=authInfo?.extra?.projectId;
      if(typeof userId!=='string'||typeof projectId!=='string')throw new Error('Identidad MCP sin proyecto autorizado.');
      return createServer(documentId=>({
        load:()=>repo.get(documentId,projectId),
        apply:async batch=>(await repo.apply(documentId,batch,userId,projectId)).document
      }));
    });
    this.nodeHandler=toNodeHandler({fetch:async request=>{
      const auth=await gate(request);
      return auth instanceof Response?auth:handler.fetch(request,{authInfo:auth});
    }},{maxRequestBodySize:4_000_000});
  }

  matchesHost(req:IncomingMessage){
    if(req.headers.host?.toLowerCase()!==this.resourceUrl.host.toLowerCase())return false;
    if(!req.headers.origin)return true;
    try{return new URL(req.headers.origin).origin===this.resourceUrl.origin;}catch{return false;}
  }
  metadata(){return {resource:this.resourceUrl.href,authorization_servers:[this.issuer.href],scopes_supported:['diagramia:read','diagramia:write'],resource_name:'Diagramia MCP'};}
  async handle(req:IncomingMessage,res:ServerResponse){await this.nodeHandler(req,res);}
}
