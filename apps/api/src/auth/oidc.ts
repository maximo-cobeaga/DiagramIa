import {randomBytes,timingSafeEqual} from 'node:crypto';
import * as oidc from 'openid-client';
import type {Identity} from '../repositories/accounts.js';

export type OidcSettings={issuer:string;clientId:string;clientSecret:string;redirectUri:string;homeUrl:string};
type Flow={verifier:string;nonce:string;cookie:string;expiresAt:number};
const isLocal=(url:URL)=>url.protocol==='http:'&&['127.0.0.1','localhost','::1'].includes(url.hostname);
const checkUrl=(input:string,label:string)=>{const url=new URL(input);if(url.protocol!=='https:'&&!isLocal(url))throw new Error(`${label} debe usar HTTPS o HTTP en loopback.`);return url;};

/** Sólo maneja el protocolo OIDC; openid-client valida issuer, state, nonce, PKCE y el ID Token. */
export class OidcAuthenticator{
  private config:Promise<oidc.Configuration>|null=null;
  private flows=new Map<string,Flow>();
  readonly redirectUri:URL;
  readonly homeUrl:URL;
  constructor(private readonly settings:OidcSettings){
    checkUrl(settings.issuer,'OIDC issuer');
    this.redirectUri=checkUrl(settings.redirectUri,'OIDC redirect URI');
    this.homeUrl=checkUrl(settings.homeUrl,'OIDC home URL');
  }
  private configuration(){
    if(!this.config){
      const issuer=checkUrl(this.settings.issuer,'OIDC issuer');
      this.config=oidc.discovery(issuer,this.settings.clientId,this.settings.clientSecret,undefined,
        isLocal(issuer)?{execute:[oidc.allowInsecureRequests,oidc.enableNonRepudiationChecks],timeout:10}:{execute:[oidc.enableNonRepudiationChecks],timeout:10}).catch(error=>{this.config=null;throw error;});
    }
    return this.config;
  }
  async begin(){
    const config=await this.configuration(),verifier=oidc.randomPKCECodeVerifier(),nonce=oidc.randomNonce(),state=oidc.randomState(),cookie=randomBytes(32).toString('base64url');
    const challenge=await oidc.calculatePKCECodeChallenge(verifier);
    for(const [key,value] of this.flows)if(value.expiresAt<Date.now())this.flows.delete(key);
    if(this.flows.size>=1000)throw new Error('Hay demasiados inicios de sesión pendientes.');
    this.flows.set(state,{verifier,nonce,cookie,expiresAt:Date.now()+600_000});
    const redirect=oidc.buildAuthorizationUrl(config,{redirect_uri:this.redirectUri.href,scope:'openid email',code_challenge:challenge,code_challenge_method:'S256',state,nonce});
    return {redirect,cookie};
  }
  async finish(callback:URL,cookie:string|undefined):Promise<Identity>{
    const state=callback.searchParams.get('state')??'',flow=this.flows.get(state);
    this.flows.delete(state);
    if(!flow||flow.expiresAt<Date.now()||!cookie||cookie.length!==flow.cookie.length||!timingSafeEqual(Buffer.from(cookie),Buffer.from(flow.cookie)))throw new Error('Inicio de sesión vencido o no iniciado en este navegador.');
    const config=await this.configuration();
    const tokens=await oidc.authorizationCodeGrant(config,callback,{pkceCodeVerifier:flow.verifier,expectedState:state,expectedNonce:flow.nonce});
    const claims=tokens.claims();
    if(!claims?.iss||!claims.sub)throw new Error('El proveedor no devolvió una identidad OIDC completa.');
    return {issuer:claims.iss,subject:claims.sub,email:claims.email_verified===true&&typeof claims.email==='string'?claims.email:null};
  }
}
