import {MAX_ASSET_BYTES,type DiagramAsset} from './schema.js';
import {fail} from './errors.js';

const decode=(base64:string)=>Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
export const assetBytes=(data:string)=>Math.floor(data.length*3/4)-(data.endsWith('==')?2:data.endsWith('=')?1:0);
export const assetDataUrl=(asset:Pick<DiagramAsset,'mediaType'|'data'>)=>`data:${asset.mediaType};base64,${asset.data}`;
const startsWith=(bytes:Uint8Array,signature:number[],offset=0)=>signature.every((byte,i)=>bytes[offset+i]===byte);
// Un SVG sólo se acepta si es estático: sin scripts, manejadores de eventos, contenido embebido ni referencias externas.
const UNSAFE_SVG=/<\s*(script|foreignObject|iframe|embed|object|use|image|a)\b|\son[a-z]+\s*=|javascript:|href\s*=\s*["'](?!#)|url\(\s*["']?(?!#)|<!ENTITY|<\?xml-stylesheet/i;

/**
 * Comprueba que el contenido sea realmente del formato declarado y, para SVG, que no pueda ejecutar ni cargar nada.
 * Además el editor dibuja todo asset con <image>, donde el navegador no ejecuta scripts ni hace pedidos.
 */
export function inspectAsset(asset:DiagramAsset){
  if(asset.data.length%4)fail('INVALID_ASSET',`El asset ${asset.id} no es base64 válido.`);
  if(assetBytes(asset.data)>MAX_ASSET_BYTES)fail('ASSET_TOO_LARGE',`El asset «${asset.label}» supera ${Math.round(MAX_ASSET_BYTES/1000)} KB. Reducí la imagen antes de agregarla.`);
  let head:Uint8Array;
  try{head=decode(asset.data.slice(0,24));}catch{return fail('INVALID_ASSET',`El asset ${asset.id} no es base64 válido.`);}
  const mismatch=()=>fail('INVALID_ASSET',`El contenido de «${asset.label}» no es ${asset.mediaType}.`);
  switch(asset.mediaType){
    case 'image/png':if(!startsWith(head,[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))mismatch();break;
    case 'image/jpeg':if(!startsWith(head,[0xff,0xd8,0xff]))mismatch();break;
    case 'image/webp':if(!startsWith(head,[0x52,0x49,0x46,0x46])||!startsWith(head,[0x57,0x45,0x42,0x50],8))mismatch();break;
    case 'image/svg+xml':{
      const text=new TextDecoder().decode(decode(asset.data));
      if(!/^\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(text))mismatch();
      if(UNSAFE_SVG.test(text))fail('UNSAFE_ASSET',`El SVG «${asset.label}» contiene scripts, eventos, contenido embebido o referencias externas. Sólo se aceptan SVG estáticos.`);
      break;
    }
  }
}
/** Huella corta de un contenido grande, para registrar lotes sin copiar la imagen entera en el ledger. */
export function digest(text:string){
  let hash=0x811c9dc5;
  for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,0x01000193);}
  return `${(hash>>>0).toString(16)}:${text.length}`;
}
