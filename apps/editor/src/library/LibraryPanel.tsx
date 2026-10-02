import {useRef,useState} from 'react';
import {BUILTIN_LIBRARY,describeError,nodeRect,unionRects,validateLibrary,type DiagramComponent,type DiagramLibrary} from '@diagramia/core';
import {useStore} from '../store/createStore';
import {documentStore,newId,notify} from '../store/documentStore';
import {selectionStore} from '../store/selectionStore';
import {insertComponent} from '../commands';
import {saveFile} from '../ui';

const STORAGE='diagramia.library';
const CATEGORY={saas:'Arquitectura SaaS',cloud:'Cloud',process:'Procesos'} as const;
const emptyLibrary=():DiagramLibrary=>({libraryVersion:'1.0.0',id:'mi-biblioteca',label:'Mi biblioteca',components:[]});
function loadLibrary():DiagramLibrary{
  try{const raw=localStorage.getItem(STORAGE);return raw?validateLibrary(JSON.parse(raw)):emptyLibrary();}catch{return emptyLibrary();}
}

/** Biblioteca de componentes: fragmentos reutilizables que se instancian con IDs nuevos en cada inserción. */
export function LibraryPanel(){
  const {doc}=useStore(documentStore),{ids}=useStore(selectionStore);
  const [own,setOwn]=useState(loadLibrary),inputRef=useRef<HTMLInputElement>(null);
  const store=(next:DiagramLibrary)=>{
    setOwn(next);
    try{localStorage.setItem(STORAGE,JSON.stringify(next));}catch{notify('La biblioteca no se pudo guardar en este navegador. Exportala para conservarla.','error');}
  };
  function saveSelection(){
    const nodes=doc.nodes.filter(n=>ids.includes(n.id)),inside=new Set(nodes.map(n=>n.id));
    if(!nodes.length){notify('Seleccioná los nodos que forman el componente.','warn');return;}
    // El componente guarda sólo la estructura: sin zonas, grupos ni imágenes del documento de origen, con coordenadas desde su esquina.
    const box=unionRects(nodes.map(nodeRect))!;
    const component:DiagramComponent={id:newId('component'),label:nodes.length===1?nodes[0].label:`${nodes[0].label} + ${nodes.length-1}`,category:'saas',description:`Guardado desde «${doc.title}».`,zones:[],
      nodes:nodes.map(n=>({...n,zoneId:null,groupId:null,assetId:null,position:{x:n.position.x-box.x,y:n.position.y-box.y}})),
      edges:doc.edges.filter(e=>inside.has(e.from)&&inside.has(e.to)).map(({points:_route,...e})=>e)};
    try{store(validateLibrary({...own,components:[...own.components,component]}));notify(`Componente «${component.label}» guardado en tu biblioteca.`);}
    catch(e){notify(describeError(e),'error');}
  }
  async function importLibrary(file:File){
    try{
      if(file.size>1_000_000)throw new Error('El archivo supera 1 MB.');
      const incoming=validateLibrary(JSON.parse(await file.text())),known=new Set(own.components.map(c=>c.id));
      const added=incoming.components.filter(c=>!known.has(c.id));
      store(validateLibrary({...own,components:[...own.components,...added]}));
      notify(`${added.length} componente(s) importados${added.length<incoming.components.length?`; ${incoming.components.length-added.length} ya existían y se conservó tu versión`:''}.`);
    }catch(e){notify(`No se importó la biblioteca: ${describeError(e)}`,'error');}
  }
  const card=(c:DiagramComponent,removable:boolean)=><li key={c.id} className="component-card">
    <div><strong>{c.label}</strong><small>{c.nodes.length} nodos · {c.edges.length} conexiones{c.zones.length?` · ${c.zones.length} zona`:''}</small>{c.description&&<p>{c.description}</p>}</div>
    <div className="component-actions"><button onClick={()=>insertComponent(c)}>Insertar</button>{removable&&<button className="quiet" onClick={()=>store({...own,components:own.components.filter(x=>x.id!==c.id)})} aria-label={`Quitar ${c.label} de mi biblioteca`}>Quitar</button>}</div>
  </li>;
  return <div className="panel-body">
    <span className="eyebrow">BIBLIOTECA</span>
    <p className="inline-note">Cada inserción crea elementos con IDs nuevos: editar una instancia no cambia las demás ni el componente original.</p>
    {(Object.keys(CATEGORY) as (keyof typeof CATEGORY)[]).map(category=><section key={category}>
      <h3>{CATEGORY[category]}</h3>
      <ul className="component-list">{BUILTIN_LIBRARY.components.filter(c=>c.category===category).map(c=>card(c,false))}</ul>
    </section>)}
    <section>
      <h3>{own.label} · {own.components.length}</h3>
      {own.components.length?<ul className="component-list">{own.components.map(c=>card(c,true))}</ul>:<p className="inline-note">Todavía no guardaste componentes propios.</p>}
      <div className="button-grid two">
        <button disabled={!doc.nodes.some(n=>ids.includes(n.id))} onClick={saveSelection}>Guardar selección</button>
        <button disabled={!own.components.length} onClick={()=>saveFile('diagramia-biblioteca.json',JSON.stringify(own,null,2)+'\n','application/json')}>Exportar</button>
        <button onClick={()=>inputRef.current?.click()}>Importar</button>
      </div>
      <input ref={inputRef} type="file" hidden accept=".json,application/json" onChange={e=>{const file=e.target.files?.[0];if(file)void importLibrary(file);e.target.value='';}}/>
    </section>
  </div>;
}
