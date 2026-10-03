import type {MODES} from './assist.js';

type Mode=typeof MODES[number];
/** Sin tildes ni mayúsculas: «Explicá», «explica» y «EXPLICAME» valen lo mismo. */
const normalize=(text:string)=>text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const any=(text:string,patterns:RegExp[])=>patterns.some(pattern=>pattern.test(text));

// Pedidos explícitos que no se confunden con una edición. El orden importa: documentar o revisar ganan aunque el texto también diga «explicá».
const DOCUMENT=[/\bdocument(a|ar|ame|alo|acion)\b/,/\breadme\b/,/\bmarkdown\b/,/\bredact(a|ar|ame)\b/,/\bescrib(i|ime) (la |una )?(documentacion|descripcion|especificacion)/];
const REVIEW=[/\brevis(a|ar|ame|alo)\b/,/\briesgos?\b/,/\bpuntos? debiles?\b/,/\bcuellos? de botella\b/,/\bfalencias?\b/,/\bauditor?(a|ia)\b/,/\bque (problemas?|fallas?|mejoras?)\b/,/\bque (le )?(falta|mejorarias|cambiarias)\b/,/\bsugerencias?\b/,/\breview\b/];
const ANIMATE=[/\banim(a|ar|ame|alo|acion|aciones)\b/,/\brecorrido\b/,/\bpasos? de (la )?(animacion|presentacion)\b/];
const TRANSFORM=[/\breorganiz/,/\breacomod/,/\bordena(r|lo|los)?\b/,/\bconverti(r|lo)?\b/,/\btransforma(r|lo)?\b/,/\balinea(r|lo|los)?\b/,/\bpasa(lo)? a (un |una )?(diagrama|flujo|secuencia)/];
// Crear exige verbo + artículo + sustantivo («armá un flujo»): «¿qué hace este sistema?» no es un pedido de creación.
const CREATE=[/\b(crea|crear|crealo|arma|armar|armame|hace|hacer|haceme|genera|generar|generame|dibuja|dibujar|dibujame|disena|disenar|disename|create|make|build)\b(\s+(me|nos))?\s+(un|una|el|la|nuevo|nueva|otro|otra|a|an)\b.{0,40}?\b(diagrama|flujo|arquitectura|mapa|esquema|organigrama|proceso|sistema|diagram|flow|architecture)\b/,/\b(nuevo|otro) diagrama\b/];
// Verbos de cambio: si aparecen, el pedido modifica el canvas aunque también haga una pregunta.
const EDIT=[/\b(agrega|agregar|agregale|suma|sumar|sumale|anade|quita|quitar|saca|sacar|elimina|eliminar|borra|borrar|cambia|cambiar|cambiale|conecta|conectar|uni|unir|move|mover|renombra|renombrar|pone|poner|ponele|pinta|pintar|colorea|reemplaza|reemplazar|duplica|separa|agrupa|inserta|add|remove|delete|rename|connect)\b/];
const EXPLAIN=[/\bexplic(a|ar|ame|alo|ame|anos)\b/,/\bcontame\b/,/\bdescrib(i|ime|ilo)\b/,/\bresumi(me|lo)?\b/,/\bque (es|son|hace|hacen|significa|pasa)\b/,/\bcomo (funciona|funcionan|anda|se conecta)\b/,/\bpor que\b/,/\bpara que (sirve|sirven)\b/,/\bentender\b/,/\bexplain\b/,/\bwhat (is|does)\b/,/\bhow does\b/];

/**
 * Deduce qué quiere el usuario a partir del pedido, sin llamar al modelo: no cuesta tokens y es predecible.
 * Un pedido sin señales claras edita el diagrama existente o, si el canvas está vacío, crea uno.
 */
export function inferMode(prompt:string,documentIsEmpty:boolean):Mode{
  const text=normalize(prompt);
  if(any(text,DOCUMENT))return 'document';
  if(any(text,REVIEW)&&!any(text,EDIT))return 'review';
  if(any(text,ANIMATE))return 'animate';
  if(any(text,TRANSFORM)&&!any(text,EDIT))return 'transform';
  if(any(text,CREATE))return 'create';
  if(any(text,EDIT))return documentIsEmpty?'create':'edit';
  // Una pregunta sin verbos de cambio se responde, no se convierte en cambios.
  if(any(text,EXPLAIN)||/[?¿]/.test(text))return 'explain';
  return documentIsEmpty?'create':'edit';
}

/** Reemplaza `mode: "auto"` por el modo deducido. Cualquier otro cuerpo pasa sin cambios y lo valida el gateway. */
export function resolveAutoMode(body:unknown):unknown{
  if(!body||typeof body!=='object'||(body as {mode?:unknown}).mode!=='auto')return body;
  const {prompt,document}=body as {prompt?:unknown;document?:unknown};
  const nodes=(document as {nodes?:unknown}|null)?.nodes;
  return {...body,mode:inferMode(typeof prompt==='string'?prompt:'',Array.isArray(nodes)&&nodes.length===0)};
}
