export type ChatMessage={role:'user'|'assistant';content:string};
export type ProviderRequest={
  system:string;messages:ChatMessage[];maxOutputTokens:number;signal:AbortSignal;
  /** La respuesta debe ser un único objeto JSON. Los adapters que tienen un modo JSON nativo lo activan; el engine valida igual. */
  json?:boolean;
};
export type ProviderResult={text:string;model:string;stopReason:string;usage:{inputTokens:number;outputTokens:number};providerRequestId:string|null};
/** Precio publicado por millón de tokens, o null si no hay una tarifa conocida para estimar. */
export type Pricing={inputPerMTok:number;outputPerMTok:number}|null;
export type ProviderInfo={
  id:string;label:string;model:string;
  /** `mock` nunca llama a un modelo: la interfaz debe mostrarlo como tal. */
  kind:'remote'|'local'|'mock';
  configured:boolean;missing:string|null;
  /** Sólo lo que el adapter hace hoy; la salida se valida siempre contra el engine. */
  capabilities:{structuredOutput:boolean;streaming:boolean;vision:boolean;cancellation:boolean};
  pricing:Pricing;
};
export interface Provider{info():ProviderInfo;generate(request:ProviderRequest):Promise<ProviderResult>;}

export type ProviderErrorCode='NOT_CONFIGURED'|'AUTH'|'RATE_LIMIT'|'REFUSED'|'CANCELLED'|'BAD_REQUEST'|'TRUNCATED'|'UPSTREAM';
export class ProviderError extends Error{
  constructor(public code:ProviderErrorCode,message:string,public retryable=false){super(message);this.name='ProviderError';}
}
