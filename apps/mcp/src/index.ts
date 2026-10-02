import {serveStdio} from '@modelcontextprotocol/server/stdio';
import {createServer} from './server.js';
import {documentPath,loadDocument} from './storage.js';
import {remoteDocumentBackend} from './remote.js';
try{
  const backend=process.env.DIAGRAMIA_DOCUMENTS_URL
    ?remoteDocumentBackend(process.env.DIAGRAMIA_DOCUMENTS_URL,process.env.DIAGRAMIA_DOCUMENT_ID??'',process.env.DIAGRAMIA_DOCUMENTS_TOKEN??'')
    :await documentPath(process.env.DIAGRAMIA_DOCUMENT);
  if(typeof backend==='string')await loadDocument(backend);else await backend.load();
  await serveStdio(()=>createServer(backend));
}catch(e){console.error(e instanceof Error?e.message:String(e));process.exitCode=1;}
