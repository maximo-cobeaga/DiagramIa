import Anthropic from '@anthropic-ai/sdk';
import {ProviderError,type Pricing,type Provider,type ProviderInfo,type ProviderRequest,type ProviderResult} from './types.js';

// Tarifas publicadas (USD por millón de tokens). Sirven para estimar; el cobro real lo informa la consola del proveedor.
const PRICES:Record<string,Pricing>={
  'claude-fable-5-1':{inputPerMTok:10,outputPerMTok:50},'claude-opus-5-5':{inputPerMTok:4,outputPerMTok:20},'claude-opus-5':{inputPerMTok:5,outputPerMTok:25},
  'claude-sonnet-5-5':{inputPerMTok:2,outputPerMTok:10},'claude-haiku-4-5':{inputPerMTok:1,outputPerMTok:5}
};
export type AnthropicOptions={apiKey?:string;model?:string;baseURL?:string;effort?:'low'|'medium'|'high'|'xhigh'|'max'};

/** Adapter de Claude por el SDK oficial. La clave vive sólo en el servidor: nunca llega al navegador. */
export function anthropicProvider(options:AnthropicOptions):Provider{
  const model=options.model||'claude-opus-5-5';
  let client:Anthropic|undefined;
  const info=():ProviderInfo=>({
    id:'anthropic',label:'Claude (Anthropic)',model,kind:'remote',
    configured:Boolean(options.apiKey),missing:options.apiKey?null:'Falta ANTHROPIC_API_KEY en el entorno del gateway.',
    capabilities:{structuredOutput:false,streaming:false,vision:false,cancellation:true},pricing:PRICES[model]??null
  });
  // Haiku 4.5 no acepta `effort` ni el fallback del servidor; el resto de los modelos actuales sí.
  const tuned=!model.startsWith('claude-haiku');
  return {info,async generate(request:ProviderRequest):Promise<ProviderResult>{
    if(!options.apiKey)throw new ProviderError('NOT_CONFIGURED',info().missing!);
    // maxRetries 0: los reintentos los decide el gateway, que es quien lleva el presupuesto.
    client??=new Anthropic({apiKey:options.apiKey,baseURL:options.baseURL,maxRetries:0});
    try{
      const response=await client.beta.messages.create({
        model,max_tokens:request.maxOutputTokens,
        // El prompt de sistema es estable entre pedidos: se cachea para no pagarlo completo cada vez.
        system:[{type:'text',text:request.system,cache_control:{type:'ephemeral'}}],
        messages:request.messages,
        // Si un clasificador de seguridad declina el pedido, el servidor lo reintenta en el modelo recomendado.
        ...(tuned?{betas:['server-side-fallback-2026-07-01'],fallbacks:'default' as const,output_config:{effort:options.effort??'medium'}}:{})
      },{signal:request.signal});
      if(response.stop_reason==='refusal')throw new ProviderError('REFUSED',`El modelo declinó el pedido${response.stop_details?.category?` (categoría: ${response.stop_details.category})`:''}. Reformulalo; no se generó ninguna propuesta.`);
      const text=response.content.flatMap(block=>block.type==='text'?[block.text]:[]).join('');
      if(response.stop_reason==='max_tokens')throw new ProviderError('TRUNCATED','La respuesta superó el máximo de tokens de salida y quedó incompleta. Pedí un cambio más acotado.');
      const usage=response.usage;
      return {text,model:response.model,stopReason:response.stop_reason??'unknown',providerRequestId:response._request_id??null,
        usage:{inputTokens:usage.input_tokens+(usage.cache_creation_input_tokens??0)+(usage.cache_read_input_tokens??0),outputTokens:usage.output_tokens}};
    }catch(error){
      if(error instanceof ProviderError)throw error;
      if(error instanceof Anthropic.APIUserAbortError)throw new ProviderError('CANCELLED','Pedido cancelado.');
      if(error instanceof Anthropic.AuthenticationError||error instanceof Anthropic.PermissionDeniedError)throw new ProviderError('AUTH','Anthropic rechazó la credencial del gateway. Revisá ANTHROPIC_API_KEY.');
      if(error instanceof Anthropic.RateLimitError)throw new ProviderError('RATE_LIMIT','Anthropic limitó la frecuencia de pedidos. Esperá un momento y reintentá.',true);
      if(error instanceof Anthropic.BadRequestError||error instanceof Anthropic.NotFoundError)throw new ProviderError('BAD_REQUEST',`Anthropic rechazó el pedido: ${error.message}`);
      if(error instanceof Anthropic.APIConnectionError)throw new ProviderError('UPSTREAM','No se pudo conectar con Anthropic.',true);
      if(error instanceof Anthropic.APIError)throw new ProviderError('UPSTREAM',`Error ${error.status??''} de Anthropic.`,true);
      throw error;
    }
  }};
}
