'use strict';
const $=s=>document.querySelector(s);const $$=s=>[...document.querySelectorAll(s)];
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let lang='es',phase=0,scenario='success',playing=false,time=0,lastFrame=0;
const phases={es:[['Empezá con<br>una idea.','Una frase alcanza para abrir el canvas. Vos elegís el rumbo.','IDEA','Interpretando tu idea…','Tu idea empieza acá'],['Dale una<br>estructura.','Elementos, zonas y conexiones. Cada pieza tiene un significado.','ESTRUCTURA','4 componentes conectados. Backend delimitado.','Elementos editables'],['Mostrá qué<br>sucede.','Los datos recorren el sistema. Los estados cuentan la historia.','MOVIMIENTO','Recorrido creado. Ahora podés seguir cada paso.','Animación vinculada al documento'],['Conservá<br>el control.','La misma idea existe como un documento estructurado que tu IA puede entender.','DOCUMENTO','Estructura lista para leer, editar y transformar.','Visual por fuera. Estructurado por dentro.']],en:[['Start with<br>an idea.','One sentence opens the canvas. You choose the direction.','IDEA','Interpreting your idea…','Your idea starts here'],['Give it<br>structure.','Elements, zones and connections. Every piece has meaning.','STRUCTURE','4 components connected. Backend defined.','Editable elements'],['Show what<br>happens.','Data travels through the system. States tell the story.','MOTION','Flow created. Follow every step.','Animation linked to the document'],['Stay<br>in control.','The same idea exists as a structured document your AI can understand.','DOCUMENT','Structure ready to read, edit and transform.','Visual outside. Structured underneath.']]};
let playerExplored=false;
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const currentFlow=()=>FLOW_SCENARIOS[scenario];
const escapeText=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function renderFlow(){
  const flow=currentFlow();
  const label=n=>escapeText(n[lang]);
  const nodeMarkup=flow.nodes.map((n,i)=>{
    const cx=n.x+n.w/2,cy=n.y+n.h/2;
    const shape=n.kind==='decision'?`<path class="p-shape" d="M${cx} ${n.y-7}L${n.x+n.w} ${cy}L${cx} ${n.y+n.h+7}L${n.x} ${cy}Z"/>`:`<rect class="p-shape" x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="11"/>`;
    const sub=n.sub?`<text class="p-subtitle" x="${cx}" y="${n.y+65}">${escapeText(n.sub)}</text>`:'';
    return `<g class="p-node ${n.kind}" data-flow-node="${n.id}" style="--node-order:${i}">${shape}<text class="p-number" x="${cx}" y="${n.y+20}">${String(i+1).padStart(2,'0')}</text><text class="p-title" x="${cx}" y="${n.y+46}">${label(n)}</text>${sub}</g>`;
  }).join('');
  const edgeMarkup=flow.edges.map(e=>`<g class="p-connection${e.alternative?' alternative':''}" data-flow-edge="${e.id}"><path id="p-edge-${e.id}" d="${e.d}" pathLength="1"/>${e[lang]?`<text class="edge-label" x="${e.x}" y="${e.y}">${label(e)}</text>`:''}</g>`).join('');
  $('#player-graph').setAttribute('viewBox',`0 0 1180 ${flow.height}`);
  $('#player-graph').setAttribute('aria-label',flow.description[lang]);
  $('#player-graph').innerHTML=`<defs><marker id="arrow-player" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 8 4 0 8" fill="context-stroke"/></marker><pattern id="flow-grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="#48505d"/></pattern></defs><rect class="flow-grid" width="1180" height="${flow.height}" fill="url(#flow-grid)"/><rect class="flow-zone" x="182" y="65" width="756" height="${flow.height-86}" rx="18"/><text class="flow-zone-title" x="202" y="86">SERVICES / ${scenario==='success'?'CHECKOUT':'RECOVERY'}</text>${edgeMarkup}${nodeMarkup}<g id="flow-particles">${Array.from({length:3},(_,i)=>`<circle class="player-particle" data-particle="${i}" r="6" opacity="0"/>`).join('')}</g>`;
  $('.player').dataset.scenario=scenario;
  $('#flow-description').textContent=flow.description[lang];
  $('#flow-metadata').textContent=`${flow.nodes.length} ${lang==='es'?'NODOS':'NODES'} / ${flow.edges.length} ${lang==='es'?'CONEXIONES':'CONNECTIONS'}`;
  $('#parallel-note').textContent=flow.note[lang];
  $('#scrubber').max=flow.duration;
  drawPlayer();
  onScroll();
}
function applyPhase(n){phase=Math.max(0,Math.min(3,n));const p=phases[lang][phase];$('#phase-index').textContent=`0${phase+1} / 04`;$('#phase-title').innerHTML=p[0];$('#phase-description').textContent=p[1];$('#bench-mode').textContent=p[2];$('#ai-note-text').textContent=p[3];$('#bench-status').textContent=p[4];$('#workbench').dataset.phase=phase;$('#bench-time').textContent=['00:00','00:00','00:04','JSON'][phase];$$('[data-phase]').filter(x=>x.tagName==='BUTTON').forEach(x=>{x.classList.toggle('active',+x.dataset.phase===phase);x.setAttribute('aria-current',+x.dataset.phase===phase?'step':'false')});}
function animateScroll(){
  const documentRange=Math.max(1,document.documentElement.scrollHeight-innerHeight);
  document.documentElement.style.setProperty('--page-progress',clamp(scrollY/documentRange));
  if(reduced.matches){
    $$('.scroll-lines>span,.terminal-log p,.p-node,.p-connection').forEach(el=>{el.style.opacity='1';el.style.transform='none'});
    return;
  }
  $('.hero-grid h1').style.transform=`translateY(${-clamp(scrollY/innerHeight)*22}px)`;
  $$('.scroll-lines').forEach(block=>{const rect=block.getBoundingClientRect();const progress=clamp((innerHeight*.86-rect.top)/(innerHeight*.62));[...block.children].forEach((line,i)=>{const t=clamp(progress*1.65-i*.23);line.style.opacity=.18+t*.82;line.style.transform=`translateY(${(1-t)*25}px)`;});});
  const terminal=$('.agent-terminal');const tr=terminal.getBoundingClientRect();const tp=clamp((innerHeight*.88-tr.top)/(Math.min(tr.height,innerHeight)*.95));
  $$('.terminal-log p').forEach((line,i)=>{const t=clamp(tp*1.8-i*.18);line.style.opacity=.18+t*.82;line.style.transform=`translateX(${(1-t)*22}px)`;line.classList.toggle('line-ready',t>.85);});
  const graph=$('.graph-viewport');const gr=graph.getBoundingClientRect();const gp=playerExplored?1:clamp((innerHeight*.92-gr.top)/(Math.min(gr.height,innerHeight)*.85));
  $$('.p-node').forEach((node,i)=>{const t=clamp(gp*2-i*.055);node.style.opacity=.15+t*.85;node.style.transform=`translateY(${(1-t)*18}px)`;});
  $$('.p-connection').forEach((edge,i)=>{const t=clamp(gp*2-i*.055);edge.style.opacity=.08+t*.92;const path=edge.querySelector('path');if(!edge.classList.contains('alternative'))path.style.strokeDashoffset=1-t;});
}
let scheduled=false;
function onScroll(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{
  scheduled=false;const rect=$('#story').getBoundingClientRect();const usable=$('#story').offsetHeight-$('.story-pin').offsetHeight;
  const progress=clamp(-rect.top/Math.max(1,usable),0,.9999);const next=Math.floor(progress*4);if(next!==phase)applyPhase(next);
  $('.timeline-head').style.left=`${progress*98}%`;
  const build=reduced.matches?1:phase>=2?1:clamp((progress-.25)*8);
  $$('#story-graph .node:not(.redis-node)').forEach((node,i)=>{const t=clamp(build*1.8-i*.15);node.style.opacity=t;node.style.transform=`translateY(${(1-t)*18}px)`;});
  $$('#story-graph .connections path:not(#s-edge-3)').forEach((edge,i)=>{const t=clamp(build*1.8-i*.18);const length=edge.getTotalLength();edge.style.strokeDasharray=length;edge.style.strokeDashoffset=length*(1-t);});
  animateScroll();
});}
addEventListener('scroll',onScroll,{passive:true});addEventListener('resize',onScroll);$$('button[data-phase]').forEach(b=>b.addEventListener('click',()=>{const story=$('#story');const absolute=scrollY+story.getBoundingClientRect().top;const usable=story.offsetHeight-$('.story-pin').offsetHeight;scrollTo({top:absolute+((+b.dataset.phase+.15)/4)*usable,behavior:reduced.matches?'instant':'smooth'});}));
function format(ms){return '00:'+String(Math.floor(ms/1000)).padStart(2,'0')}
function drawPlayer(){
  const flow=currentFlow(),stepDuration=flow.duration/flow.steps.length;
  const step=Math.min(flow.steps.length-1,Math.floor(time/stepDuration));const current=flow.steps[step];
  const history=flow.steps.slice(0,step);const visited=new Set(history.flatMap(s=>s.nodes));const traced=new Set(history.flatMap(s=>s.edges));
  $$('.p-node').forEach(n=>{const id=n.dataset.flowNode;n.classList.toggle('active',current.nodes.includes(id));n.classList.toggle('completed',visited.has(id));n.classList.toggle('failed',current.tone==='failure'&&current.nodes.includes(id));});
  $$('.p-connection').forEach(e=>{const id=e.dataset.flowEdge;e.classList.toggle('active',current.edges.includes(id));e.classList.toggle('completed',traced.has(id));e.classList.toggle('failed',current.tone==='failure'&&current.edges.includes(id));});
  $('#step-counter').textContent=`${String(step+1).padStart(2,'0')} / ${String(flow.steps.length).padStart(2,'0')}`;
  $('#step-caption').textContent=current[lang];$('#scrubber').value=time;$('#player-time').textContent=`${format(time)} / ${format(flow.duration)}`;
  const local=(time%stepDuration)/stepDuration;
  $$('.player-particle').forEach((dot,i)=>{const id=current.edges[i];if(id&&local>.12&&local<.94&&time<flow.duration){const path=$(`#p-edge-${id}`);const pos=path.getPointAtLength(path.getTotalLength()*clamp((local-.12)/.82));dot.setAttribute('cx',pos.x);dot.setAttribute('cy',pos.y);dot.setAttribute('opacity','1');dot.setAttribute('fill',current.tone==='failure'?'#f19b86':'#d4f246');}else dot.setAttribute('opacity','0');});
  $('#play-toggle').textContent=playing?(lang==='es'?'Pausar':'Pause'):(time>=flow.duration?(lang==='es'?'Repetir':'Replay'):(lang==='es'?'Reproducir':'Play'));
}
$('#play-toggle').addEventListener('click',()=>{playerExplored=true;if(!playing&&time>=currentFlow().duration)time=0;playing=!playing;lastFrame=0;drawPlayer();onScroll()});
$('#reset').addEventListener('click',()=>{playerExplored=true;time=0;playing=false;lastFrame=0;drawPlayer();onScroll()});
$('#scrubber').addEventListener('input',e=>{playerExplored=true;time=+e.target.value;playing=false;drawPlayer();onScroll()});
$$('[data-scenario]').filter(b=>b.tagName==='BUTTON').forEach(b=>b.addEventListener('click',()=>{playerExplored=true;scenario=b.dataset.scenario;time=0;playing=false;lastFrame=0;$$('button[data-scenario]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',x===b?'true':'false')});renderFlow()}));
function frame(stamp){
  if(playing){if(lastFrame)time=Math.min(currentFlow().duration,time+Math.min(80,stamp-lastFrame));lastFrame=stamp;if(time>=currentFlow().duration){playing=false;lastFrame=0}drawPlayer()}else lastFrame=0;
  if(phase===2&&!reduced.matches){$$('.story-particle').forEach((dot,i)=>{const t=((stamp+i*1300)%3900)/1300;const edge=Math.min(2,Math.floor(t));const path=$(`#s-edge-${edge}`);const pos=path.getPointAtLength(path.getTotalLength()*(t-edge));dot.setAttribute('cx',pos.x);dot.setAttribute('cy',pos.y)})}
  requestAnimationFrame(frame);
}
function setLanguage(next){lang=next;document.documentElement.lang=lang;document.title=lang==='es'?'Diagramia — Ideas en movimiento':'Diagramia — Ideas in motion';$$('[data-es]').forEach(el=>{const value=el.dataset[lang];if(value!==undefined){el.textContent=value.replaceAll('\\n','\n')}});$('#language').textContent=lang==='es'?'EN':'ES';$('#language').setAttribute('aria-label',lang==='es'?'Switch to English':'Cambiar a español');$$('#story-graph [data-node] text').forEach(el=>{if(el.textContent==='Usuario'||el.textContent==='User')el.textContent=lang==='es'?'Usuario':'User'});applyPhase(phase);renderFlow();$('#copy-feedback').textContent='';}
$('#language').addEventListener('click',()=>setLanguage(lang==='es'?'en':'es'));
const dialog=$('#mcp-dialog');$('#show-mcp').addEventListener('click',()=>dialog.showModal());$('#close-dialog').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});$('#copy-mcp').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(JSON.stringify({server:'diagramia',capabilities:['read','edit','validate','animate']},null,2));$('#copy-feedback').textContent=lang==='es'?'Ejemplo copiado.':'Example copied.'}catch{$('#copy-feedback').textContent=lang==='es'?'Podés seleccionar y copiar el ejemplo de arriba.':'Select and copy the example above.'}});
if(!reduced.matches&&'IntersectionObserver'in window){document.body.classList.add('js-motion');const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');observer.unobserve(e.target)}}),{threshold:.12});$$('.reveal,.motion-principles p').forEach(el=>observer.observe(el));}
applyPhase(0);renderFlow();onScroll();requestAnimationFrame(frame);
reduced.addEventListener('change',onScroll);
