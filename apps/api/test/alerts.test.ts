import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {alertRequest,alertText,sendAlert} from '../src/alerts.js';

const alert={event:'alert' as const,kind:'ai_spend' as const,period:'month' as const,key:'2026-10',usd:16.5,budget:20,ratio:0.825};

test('a spend alert is plain text for ntfy, content for Discord and JSON for other webhooks, with amounts only',()=>{
  assert.match(alertText(alert),/USD 16\.50 de USD 20\.00 en el mes 2026-10 \(83 %\)/);
  const ntfy=alertRequest('https://ntfy.sh/diagramia-x7k2',alert)!,discord=alertRequest('https://discord.com/api/webhooks/1/abc',alert)!,other=alertRequest('https://hooks.slack.com/services/T/B/C',alert)!;
  assert.equal((ntfy.headers as Record<string,string>)['content-type'],'text/plain; charset=utf-8');assert.equal(ntfy.body,alertText(alert));
  assert.deepEqual(JSON.parse(discord.body as string),{content:alertText(alert)});
  assert.deepEqual(JSON.parse(other.body as string),{text:alertText(alert),...alert});
  assert.equal(alertRequest('no es una url',alert),null);
});
test('sending an alert posts once and a dead webhook returns false instead of throwing',async()=>{
  const bodies:string[]=[];
  const server=createServer(async(req,res)=>{const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(chunk as Buffer);bodies.push(Buffer.concat(chunks).toString());res.writeHead(200).end();});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=(server.address() as AddressInfo).port;
  try{assert.equal(await sendAlert(`http://127.0.0.1:${port}/hook`,alert),true);assert.equal(bodies.length,1);}
  finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  assert.equal(await sendAlert(`http://127.0.0.1:${port}/caido`,alert,500),false);
});
