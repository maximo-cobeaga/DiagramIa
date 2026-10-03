import {ProviderError,type Pricing,type Provider,type ProviderInfo,type ProviderRequest,type ProviderResult} from './types.js';

export type ReasoningEffort='none'|'low'|'medium'|'high'|'xhigh'|'max';
export type OpenAICompatibleOptions={baseURL?:string;model?:string;apiKey?:string;
  /** Identidad del proveedor en el gateway y nombre de sus variables, para poder tener más de un servidor compatible. */
  id?:string;label?:string;envPrefix?:string;
  /** Mensaje cuando falta la clave; si se indica, el proveedor no queda configurado sin ella. */
  requireApiKey?:string;
  /** El servidor impone `request.schema` con `response_format: json_schema` estricto. */
  structuredOutput?:boolean;
  /** Los modelos de razonamiento de OpenAI exigen `max_completion_tokens`; los servidores locales usan `max_tokens`. */
  maxTokensParam?:'max_tokens'|'max_completion_tokens';
  reasoningEffort?:ReasoningEffort;
  pricing?:Pricing;
  /** Un proveedor pago es remoto aunque su URL apunte a loopback (proxy o prueba): siempre consume presupuesto. */
  kind?:'remote'|'local'};
const isLocal=(url:string)=>{try{return ['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname);}catch{return false;}};
type Completion={model?:string;id?:string;
  choices?:{finish_reason?:string;message?:{content?:unknown;refusal?:unknown}}[];
  usage?:{prompt_tokens?:number;completion_tokens?:number;prompt_tokens_details?:{cached_tokens?:number}}};

/**
 * Adapter para servidores que hablan el protocolo `/chat/completions` (OpenAI, Ollama, LM Studio, vLLM u otros).
 * Sin `structuredOutput` no asume que el servidor respete un schema: el gateway valida y repara la salida.
 */
export function openAICompatibleProvider(options:OpenAICompatibleOptions):Provider{
  const baseURL=(options.baseURL??'').replace(/\/+$/,''),model=options.model??'';
  const prefix=options.envPrefix??'DIAGRAMIA_LOCAL';
  const missing=options.requireApiKey&&!options.apiKey?options.requireApiKey
    :!baseURL?`Falta ${prefix}_BASE_URL (la URL que termina antes de /chat/completions).`:!model?`Falta ${prefix}_MODEL.`:null;
  const local=options.kind?options.kind==='local':isLocal(baseURL),structured=Boolean(options.structuredOutput);
  const info=():ProviderInfo=>({
    id:options.id??'local',label:options.label||(local?'Modelo local compatible':'Servidor compatible (remoto)'),model:model||'sin modelo',kind:local?'local':'remote',
    configured:!missing,missing,capabilities:{structuredOutput:structured,streaming:false,vision:false,cancellation:true},pricing:options.pricing??null
  });
  return {info,async generate(request:ProviderRequest):Promise<ProviderResult>{
    if(missing)throw new ProviderError('NOT_CONFIGURED',missing);
    const format=structured&&request.schema?{type:'json_schema',json_schema:{name:request.schema.name,strict:true,schema:request.schema.schema}}
      :request.json?{type:'json_object'}:undefined;
    let response:Response;
    try{
      response=await fetch(`${baseURL}/chat/completions`,{
        method:'POST',signal:request.signal,
        headers:{'content-type':'application/json',...(options.apiKey?{authorization:`Bearer ${options.apiKey}`}:{})},
        body:JSON.stringify({model,stream:false,[options.maxTokensParam??'max_tokens']:request.maxOutputTokens,
          ...(options.reasoningEffort?{reasoning_effort:options.reasoningEffort}:{}),...(format?{response_format:format}:{}),
          messages:[{role:'system',content:request.system},...request.messages]})
      });
    }catch(error){
      if(request.signal.aborted)throw new ProviderError('CANCELLED','Pedido cancelado.');
      throw new ProviderError('UPSTREAM',`No se pudo conectar con ${baseURL}. ¿Está corriendo el servidor del modelo?`,true);
    }
    if(response.status===401||response.status===403)throw new ProviderError('AUTH','El servidor del modelo rechazó la credencial.');
    if(response.status===429)throw new ProviderError('RATE_LIMIT','El servidor del modelo limitó la frecuencia de pedidos.',true);
    if(!response.ok)throw new ProviderError(response.status>=500?'UPSTREAM':'BAD_REQUEST',`El servidor del modelo respondió ${response.status}: ${(await response.text().catch(()=>'')).slice(0,300)}`,response.status>=500);
    const body=await response.json().catch(()=>null) as Completion|null;
    const choice=body?.choices?.[0],text=choice?.message?.content;
    // Con structured outputs, una negativa llega como `refusal` en lugar de contenido.
    if(typeof choice?.message?.refusal==='string'&&choice.message.refusal||choice?.finish_reason==='content_filter')
      throw new ProviderError('REFUSED','El modelo declinó el pedido. Reformulalo; no se generó ninguna propuesta.');
    if(typeof text!=='string')throw new ProviderError('UPSTREAM','El servidor del modelo devolvió una respuesta sin texto.');
    if(choice?.finish_reason==='length')throw new ProviderError('TRUNCATED','La respuesta superó el máximo de tokens de salida y quedó incompleta. Pedí un cambio más acotado.');
    const cached=body?.usage?.prompt_tokens_details?.cached_tokens??0;
    return {text,model:body?.model??model,stopReason:choice?.finish_reason??'unknown',providerRequestId:body?.id??null,
      usage:{inputTokens:body?.usage?.prompt_tokens??0,outputTokens:body?.usage?.completion_tokens??0,...(cached>0?{cachedInputTokens:cached}:{})}};
  }};
}
