import {z} from 'zod';

export class DiagramError extends Error{constructor(public code:string,message:string){super(message);this.name='DiagramError';}}
export const fail=(code:string,message:string):never=>{throw new DiagramError(code,message);};
export const find=<T extends {id:string}>(items:T[],id:string):T=>items.find(n=>n.id===id)??fail('NOT_FOUND',`No existe ${id} entre los elementos que esta acción puede modificar`);

/** Mensaje legible para el usuario final: sin stack traces, con la ubicación del error de schema. */
export function describeError(e:unknown):string{
  if(e instanceof z.ZodError){
    const issues=e.issues.slice(0,4).map(i=>`${i.path.join('.')||'documento'}: ${i.message}`);
    return `Estructura inválida — ${issues.join(' · ')}${e.issues.length>4?` (+${e.issues.length-4} más)`:''}`;
  }
  if(e instanceof SyntaxError)return `JSON inválido: ${e.message}`;
  return e instanceof Error?e.message:String(e);
}
export const errorCode=(e:unknown)=>e instanceof DiagramError?e.code:e instanceof z.ZodError?'INVALID_SCHEMA':'UNKNOWN';
