import {openDocument,type DiagramDocument} from '@diagramia/core';
import type {DocumentBackend} from './server.js';

/** El token queda en el proceso stdio del host MCP; jamás forma parte del bundle del editor. */
export function remoteDocumentBackend(origin:string,id:string,token:string):DocumentBackend{
  const base=new URL(origin);
  if(base.protocol!=='https:'&&!(['127.0.0.1','localhost','::1'].includes(base.hostname)&&base.protocol==='http:'))throw new Error('DIAGRAMIA_DOCUMENTS_URL requiere HTTPS o loopback HTTP.');
  if(!token||!id)throw new Error('DIAGRAMIA_DOCUMENT_ID y DIAGRAMIA_DOCUMENTS_TOKEN son obligatorios en modo remoto.');
  const url=new URL(`/v1/documents/${encodeURIComponent(id)}`,base);
  const request=async(path:string,body?:unknown):Promise<DiagramDocument>=>{
    const response=await fetch(url+path,{method:body===undefined?'GET':'POST',headers:{'x-diagramia-client':'editor',authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
    const data=await response.json() as {document?:unknown;error?:{code?:string;message?:string}};
    if(!response.ok)throw new Error(`${data.error?.code??'HTTP_'+response.status}: ${data.error?.message??'No se pudo leer el documento remoto.'}`);
    return openDocument(data.document).document;
  };
  return {load:()=>request(''),apply:batch=>request('/batches',batch)};
}
