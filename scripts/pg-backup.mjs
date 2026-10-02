// Respaldo lógico de la base local de desarrollo. Escribe primero un archivo temporal y sólo publica uno válido.
import {spawn} from 'node:child_process';
import {createWriteStream,mkdirSync,openSync,readSync,closeSync,renameSync,rmSync,statSync} from 'node:fs';
import {finished} from 'node:stream/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url)),compose=join(root,'infra','compose.dev.yml');
const folder=join(root,'state','backups');mkdirSync(folder,{recursive:true});
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),file=join(folder,`diagramia-${stamp}.dump`),partial=file+'.partial';
const project=process.env.DIAGRAMIA_COMPOSE_PROJECT;
if(project&&!/^[a-z][a-z0-9_-]{0,62}$/.test(project))throw new Error('DIAGRAMIA_COMPOSE_PROJECT inválido.');
const args=['compose','-f',compose,...(project?['-p',project]:[]),'exec','-T','db','pg_dump','-Fc','--no-owner','--no-privileges','-U','diagramia','-d','diagramia'];
const child=spawn('docker',args,{cwd:root,stdio:['ignore','pipe','pipe']});
const sink=createWriteStream(partial,{flags:'wx'}),errors=[];
child.stderr.on('data',chunk=>{if(errors.join('').length<4000)errors.push(chunk.toString());});
child.stdout.pipe(sink);
try{
  const [exit]=await Promise.all([new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);}),finished(sink)]);
  if(exit!==0)throw new Error(`pg_dump falló: ${errors.join('').trim()||`docker salió con ${exit}`}`);
  const fd=openSync(partial,'r'),header=Buffer.alloc(5);try{readSync(fd,header,0,5,0);}finally{closeSync(fd);}
  if(header.toString()!=='PGDMP')throw new Error('El respaldo no tiene el encabezado de pg_dump custom.');
  renameSync(partial,file);
  console.log(`Respaldo local: ${file} (${statSync(file).size} bytes).`);
}catch(error){child.kill();rmSync(partial,{force:true});throw error;}
