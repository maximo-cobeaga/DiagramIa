import {useMemo,useRef} from 'react';
import {BUILTIN_LIBRARY,describeError,emptyDocument,nodeRect,unionRects,validateLibrary,type DiagramComponent} from '@diagramia/core';
import {useStore} from '../store/createStore';
import {documentStore,notify} from '../store/documentStore';
import {selectionStore} from '../store/selectionStore';
import {insertComponent} from '../commands';
import {saveFile} from '../ui';
import {DiagramLayer} from '../canvas/DiagramLayer';
import {ownLibrary,saveSelection,storeLibrary} from './ownLibrary';

const CATEGORY={saas:'Arquitectura SaaS',cloud:'Cloud',process:'Procesos'} as const;

/** Miniatura del componente, dibujada con el mismo código que el canvas. */
function Preview({component}:{component:DiagramComponent}){
  const doc=useMemo(()=>({...emptyDocument('preview','Vista previa'),nodes:component.nodes,edges:component.edges,zones:component.zones}),[component]);
  const box=unionRects([...component.nodes.map(nodeRect),...component.zones.map(z=>z.bounds)])!;
  return <svg className="component-preview" viewBox={`${box.x-12} ${box.y-12} ${box.width+24} ${box.height+24}`} aria-hidden="true"><DiagramLayer doc={doc} showFrames={false}/></svg>;
}

/** Biblioteca de componentes: fragmentos reutilizables que se instancian con IDs nuevos en cada inserción. */
export function LibraryPanel(){
  const {doc}=useStore(documentStore),{ids}=useStore(selectionStore),{library:own}=useStore(ownLibrary),inputRef=useRef<HTMLInputElement>(null);
  async function importLibrary(file:File){
    try{
      if(file.size>1_000_000)throw new Error('El archivo supera 1 MB.');
      const incoming=validateLibrary(JSON.parse(await file.text())),known=new Set(own.components.map(c=>c.id));
      const added=incoming.components.filter(c=>!known.has(c.id));
      storeLibrary(validateLibrary({...own,components:[...own.components,...added]}));
      notify(`${added.length} componente(s) importados${added.length<incoming.components.length?`; ${incoming.components.length-added.length} ya existían y se conservó tu versión`:''}.`);
    }catch(e){notify(`No se importó la biblioteca: ${describeError(e)}`,'error');}
  }
  const card=(c:DiagramComponent,removable:boolean)=><li key={c.id} className="component-card">
    <Preview component={c}/>
    <div><strong>{c.label}</strong><small>{c.nodes.length===1?'1 elemento':`${c.nodes.length} elementos`}{c.edges.length?` · ${c.edges.length} conexiones`:''}{c.zones.length?` · ${c.zones.length} zona`:''}</small>{c.description&&<p>{c.description}</p>}</div>
    <div className="component-actions"><button onClick={()=>insertComponent(c)}>Insertar</button>{removable&&<button className="quiet" onClick={()=>storeLibrary({...own,components:own.components.filter(x=>x.id!==c.id)})} aria-label={`Quitar ${c.label} de mis elementos`}>Quitar</button>}</div>
  </li>;
  return <div className="panel-body">
    <span className="eyebrow">BIBLIOTECA</span>
    <section>
      <h3>Mis elementos · {own.components.length}</h3>
      {own.components.length?<ul className="component-list">{own.components.map(c=>card(c,true))}</ul>
        :<p className="inline-note">Armá tu propio elemento: combiná formas (podés superponerlas), dales color e icono, seleccionalas y guardalas. Se insertan como una sola pieza que después podés desagrupar.</p>}
      <div className="button-grid two">
        <button className="primary" disabled={!doc.nodes.some(n=>ids.includes(n.id))} onClick={()=>saveSelection()}>Guardar selección</button>
        <button disabled={!own.components.length} onClick={()=>saveFile('diagramia-biblioteca.json',JSON.stringify(own,null,2)+'\n','application/json')}>Exportar</button>
        <button onClick={()=>inputRef.current?.click()}>Importar</button>
      </div>
      <input ref={inputRef} type="file" hidden accept=".json,application/json" onChange={e=>{const file=e.target.files?.[0];if(file)void importLibrary(file);e.target.value='';}}/>
    </section>
    <p className="inline-note">Cada inserción crea elementos con IDs nuevos: editar una instancia no cambia las demás ni el original.</p>
    {(Object.keys(CATEGORY) as (keyof typeof CATEGORY)[]).map(category=><section key={category}>
      <h3>{CATEGORY[category]}</h3>
      <ul className="component-list">{BUILTIN_LIBRARY.components.filter(c=>c.category===category).map(c=>card(c,false))}</ul>
    </section>)}
  </div>;
}
