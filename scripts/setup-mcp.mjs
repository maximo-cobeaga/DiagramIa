import {copyFile,writeFile,access} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve('.'),file=resolve('state/working.diagramia.json');
try{await access(file);}catch{await copyFile('examples/architecture.diagramia.json',file);}
const settings={mcpServers:{diagramia:{command:process.execPath,args:[resolve('apps/mcp/dist/index.js')],env:{DIAGRAMIA_DOCUMENT:file}}}};
await writeFile('integrations/claude.mcp.generated.json',JSON.stringify(settings,null,2)+'\n');
const quote=s=>JSON.stringify(s);
await writeFile('integrations/codex.mcp.generated.toml',`[mcp_servers.diagramia]\ncommand = ${quote(process.execPath)}\nargs = [${quote(resolve('apps/mcp/dist/index.js'))}]\n\n[mcp_servers.diagramia.env]\nDIAGRAMIA_DOCUMENT = ${quote(file)}\n`);
console.log('Configuraciones creadas en integrations/. Copialas en la configuración de tu host, sin reemplazar otros servidores.');
console.log('Archivo de trabajo: '+file);
