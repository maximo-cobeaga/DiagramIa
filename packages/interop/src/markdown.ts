import type {DiagramDocument,DiagramNode} from '@diagramia/core';

const KIND:Record<DiagramNode['kind'],string>={service:'servicio',database:'base de datos',cache:'caché',queue:'cola',external:'sistema externo',actor:'actor',decision:'decisión',note:'nota',text:'texto',image:'imagen',custom:'elemento'};
const escape=(text:string)=>text.replace(/([\\`*_|<>\[\]])/g,'\\$1').replace(/[\r\n]+/g,' ');

/**
 * Documentación determinista del documento o de una selección. No interpreta ni inventa: describe
 * los elementos, sus zonas, conexiones y pasos tal como están en el modelo.
 */
export function exportMarkdown(d:DiagramDocument,selectedIds:string[]=[]):string{
  const picked=new Set(selectedIds),partial=picked.size>0;
  const nodes=partial?d.nodes.filter(n=>picked.has(n.id)||(n.zoneId&&picked.has(n.zoneId))||(n.groupId&&picked.has(n.groupId))):d.nodes;
  const drawings=d.drawings.filter(drawing=>!partial||picked.has(drawing.id));
  const ids=new Set(nodes.map(n=>n.id)),label=new Map(d.nodes.map(n=>[n.id,n.label]));
  const edges=d.edges.filter(e=>partial?picked.has(e.id)||ids.has(e.from)||ids.has(e.to):true);
  const line=(n:DiagramNode)=>`- **${escape(n.label)}** (\`${n.id}\`, ${KIND[n.kind]})${n.subtitle?` — ${escape(n.subtitle)}`:''}`;
  const out=[`# ${escape(d.title)}`,'',`Revisión ${d.revision} · ${nodes.length} elementos · ${edges.length} conexiones · ${drawings.length} trazos${partial?' · documentación de la selección':''}`,''];
  const zones=d.zones.filter(z=>nodes.some(n=>n.zoneId===z.id));
  if(zones.length){
    out.push('## Zonas','');
    for(const z of zones)out.push(`### ${escape(z.label)} (\`${z.id}\`)`,'',...nodes.filter(n=>n.zoneId===z.id).map(line),'');
  }
  const free=nodes.filter(n=>!n.zoneId);
  if(free.length)out.push(zones.length?'## Elementos fuera de zonas':'## Elementos','',...free.map(line),'');
  if(edges.length)out.push('## Conexiones','',...edges.map(e=>`- ${escape(label.get(e.from)!)} → ${escape(label.get(e.to)!)}${e.label?`: ${escape(e.label)}`:''}${e.alternative?' _(camino alternativo)_':''}`),'');
  if(drawings.length){const labels={line:'Línea',arrow:'Flecha libre',freehand:'Dibujo a mano alzada'} as const;out.push('## Trazos libres','',...drawings.map(d=>`- ${labels[d.kind]} (\`${d.id}\`, ${d.points.length} puntos)`),'');}
  const notes=d.annotations.filter(note=>partial?Boolean(note.targetId&&(ids.has(note.targetId)||picked.has(note.targetId))):true);
  if(notes.length){
    const severity={info:'Info',warning:'Atención',risk:'Riesgo'} as const;
    out.push('## Observaciones','',...notes.map(note=>`- **${severity[note.severity]}**${note.targetId?` (\`${note.targetId}\`)`:''}${note.resolved?' _(resuelta)_':''}: ${escape(note.text)}${note.suggestion?` — Sugerencia: ${escape(note.suggestion)}`:''}`),'');
  }
  const animations=d.animations.map(a=>({a,steps:a.steps.filter(s=>!partial||s.nodeIds.some(id=>ids.has(id)))})).filter(x=>x.steps.length);
  if(animations.length){
    out.push('## Recorridos','');
    for(const {a,steps} of animations){
      out.push(`### ${escape(a.label)}`,'');
      if(a.scenarios.length)out.push(`Escenarios: ${a.scenarios.map(s=>escape(s.label)).join(' · ')}.`,'');
      const branch=(s:typeof steps[number])=>s.scenarioIds.length?` · sólo en: ${s.scenarioIds.map(id=>escape(a.scenarios.find(x=>x.id===id)?.label??id)).join(', ')}`:'';
      steps.forEach((s,i)=>out.push(`${i+1}. ${escape(s.caption)||'_(sin descripción)_'} — ${(s.durationMs/1000).toFixed(1)} s${s.tone==='failure'?' · **falla**':''}${s.nodeIds.length?` · ${s.nodeIds.map(id=>escape(label.get(id)!)).join(', ')}`:''}${branch(s)}`));
      out.push('');
      const visible=new Set(steps.map(s=>s.id));
      for(const track of a.tracks){
        const clips=track.clips.filter(c=>visible.has(c.stepId));if(!clips.length)continue;
        out.push(`**Pista: ${escape(track.label)}** (${track.kind})`,'');
        for(const clip of clips)out.push(`- Paso ${steps.findIndex(s=>s.id===clip.stepId)+1}: ${track.kind==='caption'?escape(clip.caption)||'_(sin texto)_':track.kind==='camera'?`encuadre ${clip.frameId?`\`${clip.frameId}\``:'general'}`:[...clip.nodeIds,...clip.edgeIds].map(id=>`\`${id}\``).join(', ')||'_(sin elementos)_'}`);
        out.push('');
      }
    }
  }
  return out.join('\n').replace(/\n+$/,'\n');
}
