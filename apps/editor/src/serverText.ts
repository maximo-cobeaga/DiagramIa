/**
 * Mensajes que llegan del gateway, que escribe en español. En inglés se traducen acá por su texto: los fijos por coincidencia
 * exacta y los que llevan números por patrón. Uno que no esté en la lista se muestra tal como llegó.
 */
const FIXED:Readonly<Record<string,string>>={
  'Verificá tu email para usar la IA con el correo de confirmación. Si ya lo hiciste, tocá «Ya lo verifiqué».':'Verify your email with the confirmation message to use the AI. If you already did, press «I already verified it».',
  'Verificá tu email antes de suscribirte.':'Verify your email before subscribing.',
  'Demasiados pedidos seguidos. Esperá un minuto y volvé a intentar.':'Too many requests in a row. Wait a minute and try again.',
  'Demasiados pedidos desde tu conexión. Esperá un minuto.':'Too many requests from your connection. Wait a minute.',
  'Demasiados guardados seguidos. Se reintenta en un momento.':'Too many saves in a row. It will retry in a moment.',
  'Demasiadas vistas previas seguidas. Probá en un minuto.':'Too many previews in a row. Try again in a minute.',
  'Iniciá sesión para usar IA.':'Sign in to use the AI.',
  'Iniciá sesión para usar la nube.':'Sign in to use the cloud.',
  'Iniciá sesión para pasar a Pro.':'Sign in to go Pro.',
  'Iniciá sesión para eliminar tu cuenta.':'Sign in to delete your account.',
  'Iniciá sesión para traer la vista previa de un enlace.':'Sign in to fetch a link preview.',
  'Este pedido de IA todavía se está procesando.':'This AI request is still being processed.',
  'Ese pedido ya se completó. Enviá uno nuevo.':'That request already completed. Send a new one.',
  'Pedido cancelado. El documento no cambió. El proveedor pudo haber cobrado lo ya procesado.':'Request cancelled. The document did not change. The provider may have charged for what was already processed.',
  'El documento no entra en el presupuesto de contexto ni recortado. Seleccioná una parte más chica.':'The document does not fit in the context budget even when trimmed. Select a smaller part.',
  'El proveedor no está configurado.':'The provider is not configured.',
  'Ya tenés el plan Pro.':'You already have the Pro plan.',
  'El cobro no está configurado.':'Payments are not set up.',
  'El cobro todavía no está disponible.':'Payments are not available yet.',
  'El plan anual no está disponible.':'The yearly plan is not available.',
  'El plan anual todavía no está disponible.':'The yearly plan is not available yet.',
  'El pago está pendiente de una configuración de Diagramia. Contactá a soporte; volver a intentarlo ahora no lo resolverá. Referencia: CHECKOUT_SETUP.':'Checkout is waiting on a Diagramia setting. Contact support; trying again now will not fix it. Reference: CHECKOUT_SETUP.',
  'El dominio del pago todavía no está aprobado en Paddle. Contactá a soporte; volver a intentarlo ahora no lo resolverá. Referencia: CHECKOUT_DOMAIN.':'The checkout domain is not approved in Paddle yet. Contact support; trying again now will not fix it. Reference: CHECKOUT_DOMAIN.',
  'No podemos habilitar el pago en este momento. Contactá a soporte. Referencia: CHECKOUT_ACCESS.':'We cannot enable checkout right now. Contact support. Reference: CHECKOUT_ACCESS.',
  'No pudimos preparar tu pago con Paddle. Esperá unos minutos o contactá a soporte si continúa.':'We could not prepare your payment with Paddle. Wait a few minutes or contact support if it continues.',
  'Estamos actualizando el precio de Pro. Probá de nuevo en unos minutos; no se cobró nada. Referencia: CHECKOUT_PRICE.':'We are updating the Pro price. Try again in a few minutes; nothing was charged. Reference: CHECKOUT_PRICE.',
  'No se pudo contactar al proveedor de pagos.':'Could not reach the payment provider.',
  'Este diagrama excede tu plan actual y quedó en sólo lectura. Pasá a Pro o borrá otros diagramas para editarlo.':'This diagram exceeds your current plan and is read-only. Go Pro or delete other diagrams to edit it.',
  'El documento supera 10 MB.':'The document exceeds 10 MB.',
  'Para eliminar la cuenta, confirmá escribiendo ELIMINAR.':'To delete the account, confirm by typing DELETE.',
  'La página tardó demasiado en responder.':'The page took too long to respond.',
  'Error interno del gateway.':'Internal gateway error.',
  'Ruta inexistente.':'Route not found.'
};
const PATTERNS:readonly [RegExp,(match:RegExpMatchArray)=>string][]=[
  [/^Se agotaron los créditos de IA: máximo (\d+) por día y (\d+) por mes\.( Con el plan Pro tenés más\.)?$/,m=>`You ran out of AI credits: the maximum is ${m[1]} per day and ${m[2]} per month.${m[3]?' The Pro plan gives you more.':''}`],
  [/^El plan gratuito admite hasta (\d+) diagramas en la nube\. Pasá a Pro para guardar más\.$/,m=>`The Free plan allows up to ${m[1]} cloud diagrams. Go Pro to save more.`],
  [/^El plan Pro admite hasta (\d+) diagramas en la nube\.$/,m=>`The Pro plan allows up to ${m[1]} cloud diagrams.`],
  [/^El proveedor «(.+)» no está incluido en tu plan\.$/,m=>`The provider «${m[1]}» is not included in your plan.`],
  [/^El proveedor no respondió en (\d+) s\. No se reintenta automáticamente para no duplicar gasto\.$/,m=>`The provider did not answer in ${m[1]} s. It is not retried automatically to avoid duplicate spending.`],
  [/^Se alcanzó el presupuesto diario de USD ([\d.]+) \(estimado\)\. No se llamó al proveedor\.$/,m=>`The daily budget of USD ${m[1]} (estimated) was reached. The provider was not called.`],
  [/^Se alcanzó el presupuesto mensual de IA de USD ([\d.]+) \(estimado\)\. La IA incluida queda pausada hasta el mes próximo\. No se llamó al proveedor\.$/,m=>`The monthly AI budget of USD ${m[1]} (estimated) was reached. The included AI is paused until next month. The provider was not called.`],
  [/^Se alcanzó el presupuesto diario de ([\d.,]+) tokens/,m=>`The daily budget of ${m[1]} tokens was reached. The provider was not called.`],
  [/^Demasiados pedidos: el máximo es (\d+) por minuto\.$/,m=>`Too many requests: the maximum is ${m[1]} per minute.`],
  [/^Abriste el pago varias veces seguidas\. Podés volver a probar en (\d+) minuto\(s\)\.$/,m=>`You opened checkout several times in a row. You can try again in ${m[1]} minute(s).`],
  [/^El pedido supera (\d+) MB\.$/,m=>`The request exceeds ${m[1]} MB.`]
];
/** Función pura, para probarla sin navegador. */
export function serverTextIn(lang:'es'|'en',message:string):string{
  if(lang!=='en')return message;
  const fixed=FIXED[message.trim()];
  if(fixed)return fixed;
  for(const [pattern,build] of PATTERNS){const match=message.trim().match(pattern);if(match)return build(match);}
  return message;
}
