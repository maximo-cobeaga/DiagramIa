import {EN} from './i18n.en';

/**
 * Idioma del editor (ADR 105). El español es el texto fuente: cada cadena visible pasa por `t()` y el inglés sale de un
 * diccionario que tiene el español como clave. Lo que falte en el diccionario se ve en español, nunca vacío.
 * Cambiar de idioma recarga el editor: así también se traducen las constantes de módulo.
 *
 * Dos palabras iguales con sentidos distintos se separan con un contexto que no se muestra: `t('Auto@@vehículo')`.
 */
export type Lang='es'|'en';
export const LANG_KEY='diagramia.language';

/** El parámetro `?lang=` (lo manda la landing) gana sobre lo guardado, y lo guardado sobre el idioma del navegador. */
export function pickLanguage(param:string|null,stored:string|null,browser:string|null):Lang{
  if(param==='es'||param==='en')return param;
  if(stored==='es'||stored==='en')return stored;
  return (browser??'').toLowerCase().startsWith('es')?'es':'en';
}
function boot():Lang{
  // Sin navegador (pruebas en Node) el texto fuente es el español.
  if(typeof window==='undefined'||typeof localStorage==='undefined')return 'es';
  let param:string|null=null,stored:string|null=null;
  try{param=new URLSearchParams(window.location.search).get('lang');}catch{/* URL ilegible: se sigue con lo guardado */}
  try{stored=localStorage.getItem(LANG_KEY);}catch{/* almacenamiento bloqueado: vale sólo para esta visita */}
  const lang=pickLanguage(param,stored,navigator.language);
  if(param==='es'||param==='en'){
    try{localStorage.setItem(LANG_KEY,lang);}catch{/* sin almacenamiento */}
    try{const url=new URL(window.location.href);url.searchParams.delete('lang');history.replaceState(history.state,'',url.pathname+url.search+url.hash);}catch{/* la URL queda como está */}
  }
  document.documentElement.lang=lang;
  return lang;
}
export const LANG:Lang=boot();

/** Traduce con un diccionario dado. Separada de `t` para poder probarla sin navegador. */
export function translate(dictionary:Readonly<Record<string,string>>|null,text:string,args:readonly unknown[]=[]):string{
  const cut=text.indexOf('@@'),base=dictionary?.[text]??(cut<0?text:text.slice(0,cut));
  return args.length?base.replace(/\{(\d+)\}/g,(_,index:string)=>String(args[Number(index)]??'')):base;
}
/** Texto visible en el idioma del editor. Los `{0}`, `{1}`… se reemplazan por los argumentos, en el orden que pida cada idioma. */
export const t=(text:string,...args:unknown[])=>translate(LANG==='en'?EN:null,text,args);

export function setLanguage(lang:Lang){
  if(lang===LANG)return;
  try{localStorage.setItem(LANG_KEY,lang);}catch{/* sin almacenamiento el cambio no se conserva */}
  window.location.reload();
}
