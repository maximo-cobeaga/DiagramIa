import {flush as flushTelemetry,track} from '../telemetry';
import {createStore} from './createStore';

export type Billing={available:boolean;plan:'free'|'pro';status?:string|null;renewsAt?:string|null;cancelsAt?:string|null;updatePaymentUrl?:string|null;cancelUrl?:string|null};
export type Account={session:{email:string|null;emailVerified:boolean;projectId:string};storage:{documents:number;bytes:number;maxDocuments:number;maxBytes:number;maxDocumentBytes:number;maxOwnElements:number};credits:{daily:number;monthly:number;dailyLimit:number;monthlyLimit:number};billing:Billing};
/** Tope de elementos propios según el plan: sin cuentas en el servidor no hay tope; un visitante cuenta como Free. */
export function ownElementsLimit():number{const {auth,account}=accountStore.get();return auth==='signed-in'&&account?account.storage.maxOwnElements:auth==='guest'?5:Infinity;}
export type AuthState='loading'|'unavailable'|'guest'|'signed-in';
const headers={'x-diagramia-client':'editor'};

/** Sesión de la cuenta, compartida entre la cabecera y el panel de cuenta: se consulta una vez y se refresca al cambiar. */
export const accountStore=createStore({auth:'loading' as AuthState,account:null as Account|null});

export async function refreshAccount(){
  const status=await fetch('/api/v1/auth/status',{headers}).then(r=>r.ok?r.json():null).catch(()=>null);
  if(!status?.configured){accountStore.set({auth:'unavailable',account:null});return;}
  const response=await fetch('/api/v1/auth/me',{headers}).catch(()=>null);
  if(response?.ok)accountStore.set({auth:'signed-in',account:await response.json() as Account});
  else accountStore.set({auth:response?.status===401?'guest':'unavailable',account:null});
}

/** Lleva al login del proveedor. Antes se envían los eventos pendientes: la página se va. */
export function signIn(trigger:'menu'|'cloud'|'ai'){
  track('signup_started',{trigger});
  void flushTelemetry(true).finally(()=>window.location.assign('/api/v1/auth/login'));
}
