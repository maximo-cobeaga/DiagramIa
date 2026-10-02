// Verifica pg_dump/pg_restore con dos instancias aisladas; no toca la base de desarrollo.
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const compose=fileURLToPath(new URL('../infra/compose.dev.yml',import.meta.url));
const suffix=randomUUID().slice(0,8),source=`diagramia-smoke-source-${suffix}`,target=`diagramia-smoke-target-${suffix}`;
const env={...process.env,DIAGRAMIA_DB_PORT:'0',DIAGRAMIA_DB_PASSWORD:`diagramia-smoke-${suffix}`};
const docker=(project,args,input)=>execFileSync('docker',['compose','-f',compose,'-p',project,...args],{
  env,input,maxBuffer:16*1024*1024,timeout:240_000,stdio:['pipe','pipe','pipe']
});
const sql=(project,command)=>docker(project,['exec','-T','db','psql','-X','-v','ON_ERROR_STOP=1','-U','diagramia','-d','diagramia','-At','-c',command]).toString().trim();
let result='',failure=null;
try{
  docker(source,['up','-d','--wait','--wait-timeout','120','db']);
  sql(source,"CREATE TABLE backup_probe (id integer PRIMARY KEY, note text NOT NULL); INSERT INTO backup_probe VALUES (42, 'restaurado');");
  const archive=docker(source,['exec','-T','db','pg_dump','-Fc','--no-owner','--no-privileges','-U','diagramia','-d','diagramia']);
  if(archive.subarray(0,5).toString()!=='PGDMP')throw new Error('pg_dump no produjo un archivo custom válido.');
  docker(target,['up','-d','--wait','--wait-timeout','120','db']);
  docker(target,['exec','-T','db','pg_restore','--exit-on-error','--no-owner','--no-privileges','-U','diagramia','-d','diagramia'],archive);
  const restored=sql(target,"SELECT id || ':' || note FROM backup_probe WHERE id = 42;");
  if(restored!=='42:restaurado')throw new Error(`Restauración incorrecta: ${restored||'(sin fila)'}`);
  result=`PostgreSQL: backup custom (${archive.length} bytes) restaurado y verificado en instancia aislada.`;
}catch(error){failure=error;
}finally{
  // Los nombres se generaron para esta prueba y se eliminan sólo sus volúmenes efímeros.
  for(const project of [target,source]){
    try{docker(project,['down','--volumes','--remove-orphans']);}catch(error){failure??=new Error(`No se pudo limpiar ${project}: ${error.message}`);}
  }
}
if(failure)throw failure;
console.log(result);
