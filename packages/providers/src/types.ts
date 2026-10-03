export type ChatMessage={role:'user'|'assistant';content:string};
export type ProviderRequest={
  system:string;messages:ChatMessage[];maxOutputTokens:number;signal:AbortSignal;
  /** La respuesta debe ser un único objeto JSON. Los adapters que tienen un modo JSON nativo lo activan; el engine valida igual. */
  json?:boolean;
  /**
   * JSON Schema en el subconjunto estricto (todo campo requerido, opcionales como null, sin propiedades extra).
   * Un adapter con structured outputs lo impone en el proveedor; los demás lo ignoran y el engine valida igual.
   */
  schema?:{name:string;schema:Record<string,unknown>};
};
/** `cachedInputTokens` es la parte de `inputTokens` que el proveedor leyó de su caché y cobra con descuento. */
export type Usage={inputTokens:number;outputTokens:number;cachedInputTokens?:number};
export type ProviderResult={text:string;model:string;stopReason:string;usage:Usage;providerRequestId:string|null};
/** Precio publicado por millón de tokens, o null si no hay una tarifa conocida para estimar. */
export type Pricing={inputPerMTok:number;outputPerMTok:number;
  /** Tarifa de la entrada leída de caché; si falta, se cobra como entrada normal. */
  cachedInputPerMTok?:number}|null;
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
