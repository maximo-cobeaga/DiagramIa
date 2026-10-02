import {McpServer,requireScopes} from '@modelcontextprotocol/server';
import {z} from 'zod';
import {BatchSchema,DocumentSchema,Id,CAPABILITIES,describeError,errorCode,getContext,previewBatch} from '@diagramia/core';
import {loadDocument,persistBatch} from './storage.js';

const result=(value:unknown)=>({content:[{type:'text' as const,text:JSON.stringify(value,null,2)}]});
function error(e:unknown){return {content:[{type:'text' as const,text:JSON.stringify({code:errorCode(e),message:describeError(e)})}],isError:true};}
export type DocumentBackend={load:()=>Promise<Awaited<ReturnType<typeof loadDocument>>>;apply:(batch:unknown)=>Promise<Awaited<ReturnType<typeof loadDocument>>>};
export type ProjectBackendResolver=(documentId:string)=>DocumentBackend;
export function createServer(source:string|DocumentBackend|ProjectBackendResolver){
  const remote=typeof source==='function';
  const backend:DocumentBackend|null=remote?null:typeof source==='string'?{load:()=>loadDocument(source),apply:batch=>persistBatch(source,batch)}:source;
  const resolve=(documentId:string|undefined)=>{
    if(backend)return backend;
    return (source as ProjectBackendResolver)(Id.parse(documentId));
  };
  const documentId=z.string().optional();
  const server=new McpServer({name:remote?'diagramia-remote':'diagramia-local',version:'0.1.0'});
  server.registerTool('read_canvas',{description:'Lee el documento y su revisión. En MCP remoto, documentId es obligatorio. scope=selection devuelve sólo la selección, sus vecinos y zonas; maxElements acota la respuesta.',inputSchema:z.object({documentId,selectedIds:z.array(z.string()).max(500).default([]),scope:z.enum(['document','selection']).default('document'),maxElements:z.number().int().min(2).max(6000).optional()}),annotations:{readOnlyHint:true}},async({documentId,selectedIds,scope,maxElements})=>{try{return result(getContext(await resolve(documentId).load(),selectedIds,{scope,maxElements}));}catch(e){return error(e);}});
  server.registerTool('get_schema',{description:'Obtiene los contratos JSON Schema para documentos y lotes de acciones, y las capacidades reales del engine.',inputSchema:z.object({}),annotations:{readOnlyHint:true}},async()=>result({capabilities:CAPABILITIES,document:z.toJSONSchema(DocumentSchema),batch:z.toJSONSchema(BatchSchema)}));
  server.registerTool('validate_actions',{description:'Valida un lote y devuelve un diff sin modificar el documento. En MCP remoto, documentId es obligatorio.',inputSchema:z.object({documentId,batch:BatchSchema}),annotations:{readOnlyHint:true}},async({documentId,batch})=>{try{const p=previewBatch(await resolve(documentId).load(),batch);return result({beforeRevision:p.beforeRevision,afterRevision:p.afterRevision,changes:p.changes,prunedReferences:p.prunedReferences});}catch(e){return error(e);}});
  server.registerTool('apply_actions',{description:'Aplica un lote atómico al documento indicado. Requiere revisión vigente e ID de lote único. El host debe obtener autorización del usuario para editar.',inputSchema:z.object({documentId,batch:BatchSchema}),annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:true},...(remote?{scopeChallenge:requireScopes('diagramia:write')}:{})},async({documentId,batch})=>{try{const d=await resolve(documentId).apply(batch);return result({id:d.id,revision:d.revision,nodes:d.nodes.length,edges:d.edges.length});}catch(e){return error(e);}});
  return server;
}
