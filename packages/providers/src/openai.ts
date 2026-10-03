import {openAICompatibleProvider,type ReasoningEffort} from './openaiCompatible.js';
import type {Pricing,Provider} from './types.js';

/**
 * Tarifas Standard publicadas (USD por millón de tokens), consultadas el 02/10/2026; ver docs/REFERENCIAS.md.
 * Valen para pedidos de hasta 272K tokens de entrada: el gateway limita el contexto muy por debajo de eso.
 * Sirven para estimar y cortar gasto; el cobro real lo informa la consola de OpenAI.
 */
const PRICES:Record<string,Pricing>={
  'gpt-6-luna':{inputPerMTok:0.10,cachedInputPerMTok:0.01,outputPerMTok:0.50}
};
const EFFORTS:readonly ReasoningEffort[]=['none','low','medium','high','xhigh','max'];
export type OpenAIOptions={apiKey?:string;model?:string;baseURL?:string;reasoningEffort?:string};

/**
 * GPT-6 Luna (u otro modelo de OpenAI) por Chat Completions, con structured outputs estrictos donde el gateway
 * entrega un schema. Es el modelo de la IA incluida en Free (ADR 045). La clave vive sólo en el servidor.
 * El razonamiento se cobra como salida: el esfuerzo por defecto es bajo y se ajusta con mediciones.
 */
export function openAIProvider(options:OpenAIOptions):Provider{
  const model=options.model||'gpt-6-luna',effort=(options.reasoningEffort||'low') as ReasoningEffort;
  const badEffort=!EFFORTS.includes(effort)?`DIAGRAMIA_OPENAI_REASONING_EFFORT debe ser uno de: ${EFFORTS.join(', ')}.`:null;
  return openAICompatibleProvider({
    id:'openai',label:model==='gpt-6-luna'?'GPT-6 Luna (OpenAI)':`OpenAI · ${model}`,envPrefix:'DIAGRAMIA_OPENAI',
    baseURL:options.baseURL||'https://api.openai.com/v1',model,apiKey:options.apiKey,
    requireApiKey:badEffort??'Falta OPENAI_API_KEY en el entorno del gateway.',
    ...(badEffort?{apiKey:undefined}:{}),
    kind:'remote',structuredOutput:true,maxTokensParam:'max_completion_tokens',reasoningEffort:effort,pricing:PRICES[model]??null
  });
}
