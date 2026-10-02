import {readFile,writeFile,rename,unlink,open,lstat,realpath} from 'node:fs/promises';
import {dirname,basename,resolve,isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';
import {applyBatch,openDocument,type DiagramDocument} from '@diagramia/core';

// This starter owns one explicitly configured file. No tool accepts a path.
export async function documentPath(input:string|undefined){
  if(!input||!isAbsolute(input)||!input.endsWith('.diagramia.json'))throw new Error('DIAGRAMIA_DOCUMENT debe ser una ruta absoluta a un archivo .diagramia.json existente.');
  if((await lstat(input)).isSymbolicLink())throw new Error('El documento no puede ser un enlace simbólico.');
  const parent=await realpath(dirname(input));return resolve(parent,basename(input));
}
export async function loadDocument(path:string):Promise<DiagramDocument>{
  const stats=await lstat(path);if(stats.isSymbolicLink()||!stats.isFile()||stats.size>3_000_000)throw new Error('Documento inválido o mayor a 3 MB.');
  // Los archivos de versiones anteriores se migran en memoria; el archivo se reescribe recién al aplicar un lote.
  return openDocument(JSON.parse(await readFile(path,'utf8'))).document;
}
export async function persistBatch(path:string,batch:unknown):Promise<DiagramDocument>{
  const lock=path+'.lock';let handle;
  try{handle=await open(lock,'wx');}catch{throw new Error('Documento ocupado. Volvé a leer y reintentá. Si quedó un lock tras un cierre abrupto, comprobá que no haya otro proceso antes de retirarlo.');}
  const temp=path+'.'+randomUUID()+'.tmp';
  try{
    const current=await loadDocument(path);const next=applyBatch(current,batch);
    if(next.revision===current.revision)return current;
    const body=JSON.stringify(next,null,2)+'\n';if(Buffer.byteLength(body)>3_000_000)throw new Error('El resultado supera 3 MB.');
    await writeFile(temp,body,{flag:'wx'});const output=await open(temp,'r+');try{await output.sync();}finally{await output.close();}
    await rename(temp,path);return next;
  }finally{await unlink(temp).catch(()=>{});await handle.close();await unlink(lock);}
}
