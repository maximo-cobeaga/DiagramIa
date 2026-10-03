import {anthropicProvider} from './anthropic.js';
import {openAICompatibleProvider} from './openaiCompatible.js';
import {openAIProvider} from './openai.js';
import {ProviderError,type Provider,type ProviderRequest} from './types.js';

export * from './types.js';
export {anthropicProvider} from './anthropic.js';
export {openAICompatibleProvider,type ReasoningEffort} from './openaiCompatible.js';
export {openAIProvider} from './openai.js';

/**
 * Proveedor de demostración: NO es un modelo. Devuelve siempre la misma propuesta para poder recorrer
 * la interfaz sin credenciales. Sólo se registra con DIAGRAMIA_ENABLE_MOCK=1 y se anuncia como `mock`.
 */
export function mockProvider(delayMs=150):Provider{
  return {
    info:()=>({id:'mock',label:'Demostración (sin modelo)',model:'mock',kind:'mock',configured:true,missing:null,capabilities:{structuredOutput:false,streaming:false,vision:false,cancellation:true},pricing:null}),
    async generate(request:ProviderRequest){
      await new Promise<void>((resolve,reject)=>{
        const timer=setTimeout(resolve,delayMs);
        request.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new ProviderError('CANCELLED','Pedido cancelado.'));},{once:true});
      });
      const prompt=request.messages[request.messages.length-1]?.content??'',anchor=prompt.match(/"focusNodeIds":\s*\["([^"]+)"/)?.[1]??prompt.match(/"nodes":\s*\[\s*\{\s*"id":\s*"([^"]+)"/)?.[1];
      // El ID evita chocar con una demostración ya aplicada, para poder repetir el recorrido sobre el mismo documento.
      let id='mock-cache';for(let n=2;prompt.includes(`"${id}"`);n++)id=`mock-cache-${n}`;
      const text=/MODO: (explain|document)/.test(prompt)?'Respuesta de demostración: no hay un modelo conectado.'
        :/MODO: review/.test(prompt)?JSON.stringify({summary:'Revisión de demostración.',findings:anchor?[{targetId:anchor,severity:'info',observation:'Observación de demostración sobre este elemento.',evidence:'Generada sin modelo.',suggestion:''}]:[]})
        :JSON.stringify({summary:'Propuesta de demostración: agrega un nodo de caché.',clarification:null,actions:[
          {type:'ADD_NODE',node:{id,kind:'cache',label:'Caché',position:{x:0,y:0},size:{width:150,height:82},subtitle:'DEMO'},...(anchor?{placement:{below:anchor,gap:60}}:{})},
          ...(anchor?[{type:'ADD_EDGE',edge:{id:`${id}-edge`,from:anchor,to:id,label:'cache'}}]:[])]});
      return {text,model:'mock',stopReason:'end_turn',usage:{inputTokens:0,outputTokens:0},providerRequestId:null};
    }
  };
}

type Env=Record<string,string|undefined>;
/** Arma los proveedores a partir del entorno del servidor. Ninguna de estas variables debe usar el prefijo VITE_. */
export function providersFromEnv(env:Env):Provider[]{
  return [
    // Primero el modelo de la IA Free (ADR 045): el editor elige el primer proveedor configurado.
    openAIProvider({apiKey:env.OPENAI_API_KEY,model:env.DIAGRAMIA_OPENAI_MODEL,baseURL:env.DIAGRAMIA_OPENAI_BASE_URL,reasoningEffort:env.DIAGRAMIA_OPENAI_REASONING_EFFORT}),
    anthropicProvider({apiKey:env.ANTHROPIC_API_KEY,model:env.DIAGRAMIA_ANTHROPIC_MODEL}),
    openAICompatibleProvider({baseURL:env.DIAGRAMIA_LOCAL_BASE_URL,model:env.DIAGRAMIA_LOCAL_MODEL,apiKey:env.DIAGRAMIA_LOCAL_API_KEY}),
    // Segundo servidor compatible con /chat/completions, para un proveedor remoto con su propia clave. Sólo aparece si se configura.
    ...(env.DIAGRAMIA_COMPAT_BASE_URL||env.DIAGRAMIA_COMPAT_API_KEY?[openAICompatibleProvider({id:'compatible',label:env.DIAGRAMIA_COMPAT_LABEL,envPrefix:'DIAGRAMIA_COMPAT',baseURL:env.DIAGRAMIA_COMPAT_BASE_URL,model:env.DIAGRAMIA_COMPAT_MODEL,apiKey:env.DIAGRAMIA_COMPAT_API_KEY})]:[]),
    ...(env.DIAGRAMIA_ENABLE_MOCK==='1'?[mockProvider(Number(env.DIAGRAMIA_MOCK_DELAY_MS)||150)]:[])
  ];
}
