import {ProviderError,type Provider,type ProviderInfo,type ProviderRequest,type ProviderResult} from './types.js';

export type OpenAICompatibleOptions={baseURL?:string;model?:string;apiKey?:string;
  /** Identidad del proveedor en el gateway y nombre de sus variables, para poder tener más de un servidor compatible. */
  id?:string;label?:string;envPrefix?:string};
const isLocal=(url:string)=>{try{return ['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname);}catch{return false;}};

/**
 * Adapter para servidores que hablan el protocolo `/chat/completions` (Ollama, LM Studio, vLLM u otros).
 * Pensado para modelos locales o BYOK: no asume structured output; el gateway valida y repara la salida.
 */
export function openAICompatibleProvider(options:OpenAICompatibleOptions):Provider{
  const baseURL=(options.baseURL??'').replace(/\/+$/,''),model=options.model??'';
  const prefix=options.envPrefix??'DIAGRAMIA_LOCAL';
  const missing=!baseURL?`Falta ${prefix}_BASE_URL (la URL que termina antes de /chat/completions).`:!model?`Falta ${prefix}_MODEL.`:null;
  const local=isLocal(baseURL);
  const info=():ProviderInfo=>({
    id:options.id??'local',label:options.label||(local?'Modelo local compatible':'Servidor compatible (remoto)'),model:model||'sin modelo',kind:local?'local':'remote',
    configured:!missing,missing,capabilities:{structuredOutput:false,streaming:false,vision:false,cancellation:true},pricing:null
  });
  return {info,async generate(request:ProviderRequest):Promise<ProviderResult>{
    if(missing)throw new ProviderError('NOT_CONFIGURED',missing);
    let response:Response;
    try{
      response=await fetch(`${baseURL}/chat/completions`,{
        method:'POST',signal:request.signal,
        headers:{'content-type':'application/json',...(options.apiKey?{authorization:`Bearer ${options.apiKey}`}:{})},
        body:JSON.stringify({model,stream:false,max_tokens:request.maxOutputTokens,...(request.json?{response_format:{type:'json_object'}}:{}),messages:[{role:'system',content:request.system},...request.messages]})
      });
    }catch(error){
      if(request.signal.aborted)throw new ProviderError('CANCELLED','Pedido cancelado.');
      throw new ProviderError('UPSTREAM',`No se pudo conectar con ${baseURL}. ¿Está corriendo el servidor del modelo?`,true);
    }
    if(response.status===401||response.status===403)throw new ProviderError('AUTH','El servidor del modelo rechazó la credencial.');
    if(response.status===429)throw new ProviderError('RATE_LIMIT','El servidor del modelo limitó la frecuencia de pedidos.',true);
    if(!response.ok)throw new ProviderError(response.status>=500?'UPSTREAM':'BAD_REQUEST',`El servidor del modelo respondió ${response.status}: ${(await response.text().catch(()=>'')).slice(0,300)}`,response.status>=500);
    const body=await response.json().catch(()=>null) as {model?:string;id?:string;choices?:{finish_reason?:string;message?:{content?:unknown}}[];usage?:{prompt_tokens?:number;completion_tokens?:number}}|null;
    const choice=body?.choices?.[0],text=choice?.message?.content;
    if(typeof text!=='string')throw new ProviderError('UPSTREAM','El servidor del modelo devolvió una respuesta sin texto.');
    if(choice?.finish_reason==='length')throw new ProviderError('TRUNCATED','La respuesta superó el máximo de tokens de salida y quedó incompleta. Pedí un cambio más acotado.');
    return {text,model:body?.model??model,stopReason:choice?.finish_reason??'unknown',providerRequestId:body?.id??null,
      usage:{inputTokens:body?.usage?.prompt_tokens??0,outputTokens:body?.usage?.completion_tokens??0}};
  }};
}
