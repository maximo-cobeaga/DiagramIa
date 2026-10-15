import {LANG} from './i18n';

/**
 * Inglés del contenido que trae el producto (ADR 105): los seis ejemplos y la biblioteca base. No es interfaz sino texto de
 * diagramas, así que se traduce al abrir el ejemplo o insertar el componente y desde ahí es contenido de la persona.
 * Lo que no figure acá queda como está (siglas, nombres de productos, códigos como «POST /orders»).
 */
export const CONTENT_EN:Readonly<Record<string,string>>={
  // Arquitectura SaaS
  'Arquitectura SaaS':'SaaS architecture','Usuario':'User','PERSISTENCIA':'PERSISTENCE','Una request':'One request',
  'El usuario abre la aplicación.':'The user opens the application.','El frontend solicita los datos.':'The frontend requests the data.',
  'La API consulta la base de datos.':'The API queries the database.','La base de datos devuelve el resultado.':'The database returns the result.',
  // Compra confirmada
  'Compra confirmada':'Order confirmed','Validación':'Validation','Reservar stock':'Reserve stock','Inventario':'Inventory','Pasarela':'Gateway','¿Autorizado?':'Authorized?',
  'Pedido':'Order','Eventos':'Events','Enviar email':'Send email','Preparar envío':'Prepare shipping','Registrar':'Log','Válido':'Valid','Disponible':'Available','Sí':'Yes',
  'Servicios':'Services','Recorrido del pedido':'Order walkthrough','El usuario envía el pedido.':'The user submits the order.','La API recibe y valida la solicitud.':'The API receives and validates the request.',
  'Los datos son válidos. Se reserva stock.':'The data is valid. Stock is reserved.','Inventario comprueba la disponibilidad.':'Inventory checks availability.',
  'Hay stock. El pedido pasa a la pasarela.':'There is stock. The order goes to the gateway.','RESERVADO':'RESERVED','La pasarela solicita autorización.':'The gateway requests authorization.',
  'Pago autorizado: se confirma el pedido.':'Payment authorized: the order is confirmed.','El pedido se guarda y responde al usuario.':'The order is saved and the user gets a response.','CONFIRMADO':'CONFIRMED',
  'Un evento dispara tres tareas en paralelo.':'One event triggers three tasks in parallel.','Email, envío y auditoría completan el recorrido.':'Email, shipping and audit complete the walkthrough.',
  // Rechazo y recuperación
  'Rechazo y recuperación':'Decline and recovery','Pendiente':'Pending','Avisar al usuario':'Notify the user','Otro medio':'Another method','Reintentar':'Retry','Confirmado':'Confirmed',
  'Vence el plazo':'Deadline expires','Cancelar':'Cancel','Liberar stock':'Release stock','Cambiar':'Change','Nuevo intento':'New attempt','Sí / intento 02':'Yes / attempt 02','Sin respuesta':'No response',
  'Recuperado con otro medio':'Recovered with another method','El usuario cambia el medio de pago y el segundo intento se autoriza.':'The user changes the payment method and the second attempt is authorized.',
  'Vence el plazo y se cancela':'Deadline expires and it is cancelled','Nadie responde: el pedido se cancela y el stock reservado se libera.':'Nobody responds: the order is cancelled and the reserved stock is released.',
  'El usuario inicia la compra.':'The user starts the purchase.','La API valida la solicitud.':'The API validates the request.','La solicitud es válida. Se reserva stock.':'The request is valid. Stock is reserved.',
  'Inventario consulta las unidades disponibles.':'Inventory looks up the available units.','Las unidades quedan reservadas temporalmente.':'The units are reserved temporarily.','Primer intento de autorización.':'First authorization attempt.',
  'La pasarela rechaza el pago.':'The gateway declines the payment.','El pedido queda pendiente, no se pierde.':'The order stays pending; it is not lost.','PENDIENTE':'PENDING',
  'Se avisa al usuario. Tiene un plazo para cambiar el medio de pago.':'The user is notified and has a deadline to change the payment method.','El usuario decide cambiar el medio de pago.':'The user decides to change the payment method.',
  'El usuario elige otro medio de pago.':'The user picks another payment method.','El flujo vuelve a la pasarela con un nuevo intento.':'The flow goes back to the gateway with a new attempt.',
  'Segundo intento, sin duplicar el pedido.':'Second attempt, without duplicating the order.','INTENTO 02':'ATTEMPT 02','Esta vez se autoriza el pago.':'This time the payment is authorized.',
  'Compra recuperada: el pedido queda confirmado.':'Purchase recovered: the order is confirmed.','RESUELTO':'RESOLVED','Nadie responde dentro del plazo.':'Nobody responds within the deadline.',
  'Vence el plazo: el pedido se cancela.':'The deadline expires: the order is cancelled.','CANCELADO':'CANCELLED','La cancelación libera las unidades reservadas.':'The cancellation releases the reserved units.',
  'El stock vuelve a estar disponible. No hubo cobro ni pedido duplicado.':'The stock is available again. There was no charge and no duplicate order.','LIBERADO':'RELEASED',
  // Inicio de sesión
  'Inicio de sesión':'Login','API de autenticación':'Authentication API','Base de usuarios':'User database','¿Credenciales válidas?':'Valid credentials?','Sesión creada':'Session created',
  'Acceso denegado':'Access denied','Ingresa usuario y contraseña':'Enters username and password','Envía credenciales':'Sends credentials','Consulta usuario':'Looks up user','Verificación':'Verification',
  'Token o cookie':'Token or cookie','Error visible':'Visible error','Cliente':'Client','Autenticación':'Authentication','Credenciales correctas':'Correct credentials','Credenciales incorrectas':'Wrong credentials',
  'El usuario completa el formulario.':'The user fills in the form.','El frontend envía las credenciales.':'The frontend sends the credentials.','La API consulta la base de usuarios.':'The API queries the user database.',
  'La API verifica el resultado.':'The API verifies the result.','Se crea una sesión y se devuelve al frontend.':'A session is created and returned to the frontend.','El acceso se rechaza y se informa el error.':'Access is denied and the error is reported.',
  'Foco técnico':'Technical focus','Explicación':'Explanation','Se entrega una credencial de sesión.':'A session credential is issued.','No se crea una sesión.':'No session is created.','Cámara':'Camera',
  // Explicar una idea y Planificar una tarea
  'Explicar una idea':'Explain an idea','Mi idea':'My idea','Contá tu idea con una frase.':'Tell your idea in one sentence.','A quién ayuda':'Who it helps','¿Qué problema resuelve?':'What problem does it solve?',
  'El primer paso':'The first step','Elegí una acción pequeña para empezar.':'Pick a small action to get started.','Contar mi idea':'Tell my idea',
  'Planificar una tarea':'Plan a task','Lo que quiero lograr':'What I want to achieve','Escribí un resultado concreto.':'Write a concrete result.','Lo que necesito':'What I need',
  'Personas, materiales o tiempo.':'People, materials or time.','Manos a la obra':'Getting to work','Dividí el trabajo en pasos pequeños.':'Split the work into small steps.',
  'Revisar y compartir':'Review and share','¿Está listo? Mostralo y pedí una opinión.':'Is it ready? Show it and ask for an opinion.',
  // Biblioteca base
  'Biblioteca base':'Base library','Aplicación en tres capas':'Three-tier application','Cliente, frontend, API y base de datos con zona Backend.':'Client, frontend, API and database with a Backend zone.',
  'API con caché':'API with cache','Lectura con caché y persistencia.':'Reads with cache and persistence.','Cola y worker':'Queue and worker','Trabajo asíncrono desacoplado por una cola.':'Asynchronous work decoupled by a queue.',
  'Login delegado en un proveedor de identidad.':'Login delegated to an identity provider.','CDN y balanceador':'CDN and load balancer','Entrada pública con CDN, balanceo y dos réplicas.':'Public entry with CDN, load balancing and two replicas.',
  'Proceso de aprobación':'Approval process','Solicitud, revisión y corrección con reintento.':'Request, review and correction with retry.',
  'Base de datos':'Database','SERVICIO':'SERVICE','CACHÉ':'CACHE','Cola':'Queue','MENSAJES':'MESSAGES','Resultados':'Results','Proveedor de identidad':'Identity provider','Red privada':'Private network',
  'RÉPLICA':'REPLICA','Servicio A':'Service A','Servicio B':'Service B','Sesión':'Session','Solicitud':'Request','Revisión':'Review','Aprobado':'Approved','Corrección':'Correction',
  '¿Aprobada?':'Approved?','¿Válido?':'Valid?','Balanceador':'Load balancer','entrega':'delivers','guarda':'saves','publica':'publishes','redirige':'redirects','reenvía':'forwards','sí':'yes'
};
const FIELDS=new Set(['label','title','subtitle','details','caption','text','description','name','note','suggestion']);

/** Copia con los textos conocidos en el idioma pedido. Sólo cambia campos de texto: IDs, posiciones y referencias quedan intactos. */
export function localizeContentIn<T>(lang:'es'|'en',value:T):T{
  if(lang!=='en')return value;
  const walk=(node:unknown,key:string):unknown=>{
    if(typeof node==='string')return FIELDS.has(key)?CONTENT_EN[node]??node:node;
    if(Array.isArray(node))return node.map(item=>walk(item,key));
    if(node&&typeof node==='object')return Object.fromEntries(Object.entries(node).map(([name,child])=>[name,walk(child,name)]));
    return node;
  };
  return walk(value,'') as T;
}
/** Ejemplos y componentes de la biblioteca base, en el idioma del editor. */
export const localizeContent=<T>(value:T):T=>localizeContentIn(LANG,value);
