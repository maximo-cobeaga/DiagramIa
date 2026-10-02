import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
test('MCP host can discover, preview and atomically apply the same canonical actions',{timeout:15000},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'diagramia-mcp-'));const file=join(dir,'document.diagramia.json');
  const initial=await readFile('examples/architecture.diagramia.json','utf8');await writeFile(file,initial);
  const env=Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>typeof entry[1]==='string'));
  const transport=new StdioClientTransport({command:process.execPath,args:[resolve('apps/mcp/dist/index.js')],env:{...env,DIAGRAMIA_DOCUMENT:file},stderr:'pipe'});
  const client=new Client({name:'diagramia-test-host',version:'1.0.0'});
  try{
    await client.connect(transport);
    const tools=await client.listTools();assert.deepEqual(tools.tools.map(t=>t.name).sort(),['apply_actions','get_schema','read_canvas','validate_actions']);
    const batch=JSON.parse(await readFile('examples/add-redis.actions.json','utf8'));
    const read=await client.callTool({name:'read_canvas',arguments:{selectedIds:['api']}});assert.ok(!read.isError);
    const preview=await client.callTool({name:'validate_actions',arguments:{batch}});assert.ok(!preview.isError);assert.equal(await readFile(file,'utf8'),initial);
    const applied=await client.callTool({name:'apply_actions',arguments:{batch}});assert.ok(!applied.isError);
    const saved=JSON.parse(await readFile(file,'utf8'));assert.equal(saved.revision,1);assert.ok(saved.nodes.some((n:{id:string})=>n.id==='redis'));
    const again=await client.callTool({name:'apply_actions',arguments:{batch}});assert.ok(!again.isError);assert.equal(JSON.parse(await readFile(file,'utf8')).revision,1);
    const stale=await client.callTool({name:'apply_actions',arguments:{batch:{...batch,id:'other-id'}}});assert.equal(stale.isError,true);
  }finally{await client.close().catch(()=>{});await rm(dir,{recursive:true,force:true});}
});
