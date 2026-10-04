import {useEffect,useMemo,useRef,useState} from 'react';
import {documentStore,notify} from '../store/documentStore';
import {playbackStore} from '../store/playbackStore';
import {useStore} from '../store/createStore';
import {focusOn,viewStore} from '../store/viewStore';
import {canvasIndex,findCanvas,type CanvasResult} from './search';

const PAGE_SIZE=12;

/** Búsqueda no modal: acerca la vista, conserva la selección y nunca edita el documento. */
export function CanvasSearch(){
  const {doc,activeId}=useStore(documentStore),{searchOpen,staging,presenting,tutorial}=useStore(viewStore);
  return searchOpen&&!staging&&!presenting&&!tutorial?<Search key={activeId} doc={doc}/>:null;
}

function Search({doc}:{doc:ReturnType<typeof documentStore.get>['doc']}){
  const [query,setQuery]=useState(''),[active,setActive]=useState(0),input=useRef<HTMLInputElement>(null),panel=useRef<HTMLDivElement>(null);
  const index=useMemo(()=>canvasIndex(doc),[doc]),results=useMemo(()=>findCanvas(index,query),[index,query]);
  const current=Math.min(active,Math.max(0,results.length-1)),page=Math.floor(current/PAGE_SIZE),start=page*PAGE_SIZE,rows=results.slice(start,start+PAGE_SIZE);
  useEffect(()=>{const row=document.getElementById(`canvas-result-${current}`),list=row?.parentElement;if(row&&list){const r=row.getBoundingClientRect(),box=list.getBoundingClientRect();if(r.bottom>box.bottom)list.scrollTop+=r.bottom-box.bottom;if(r.top<box.top)list.scrollTop-=box.top-r.top;}},[current,query,results.length]);
  const close=(restore=true)=>{viewStore.set({searchOpen:false});if(restore)document.querySelector<HTMLButtonElement>('.canvas-search-toggle')?.focus();};
  useEffect(()=>{
    input.current?.focus();
    const outside=(event:PointerEvent)=>{if(!panel.current?.contains(event.target as Node)&&!(event.target as Element).closest?.('.canvas-search-toggle'))viewStore.set({searchOpen:false});};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();viewStore.set({searchOpen:false});document.querySelector<HTMLButtonElement>('.canvas-search-toggle')?.focus();}};
    document.addEventListener('pointerdown',outside);window.addEventListener('keydown',escape,true);
    return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('keydown',escape,true);};
  },[]);
  const visit=(result:CanvasResult)=>{
    const currentDoc=documentStore.get().doc,before=viewStore.get().camera;
    playbackStore.set({playing:false});
    if(!focusOn(currentDoc,result.id)){notify('Ese elemento ya no está en el lienzo.','warn');return;}
    viewStore.set({searchOpen:false,navigationBack:before});
    document.querySelector<SVGSVGElement>('.canvas')?.focus();
    notify(`Viendo «${result.label}». La selección se conserva.`);
  };
  return <div ref={panel} className="canvas-search" role="dialog" aria-label="Buscar en el lienzo" onPointerDown={e=>e.stopPropagation()}>
    <div className="canvas-search-heading"><strong>Encontrá tu idea</strong><button aria-label="Cerrar búsqueda" onClick={()=>close()}>×</button></div>
    <div className="canvas-search-field">
      <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg>
      <input ref={input} role="combobox" aria-label="Buscar elementos por nombre o detalle" aria-autocomplete="list" aria-expanded={true} aria-controls="canvas-search-results" aria-activedescendant={results.length?`canvas-result-${current}`:undefined} autoComplete="off" maxLength={200} placeholder="Nombre, palabra o detalle…" value={query}
        onChange={e=>{setQuery(e.target.value);setActive(0);}}
        onKeyDown={e=>{if(['ArrowDown','ArrowUp','Enter'].includes(e.key)){e.preventDefault();e.stopPropagation();if(e.key==='Enter'){if(results[current])visit(results[current]);}else if(results.length)setActive(Math.max(0,Math.min(results.length-1,current+(e.key==='ArrowDown'?1:-1))));}}}/>
      {query&&<button aria-label="Limpiar búsqueda" onClick={()=>{setQuery('');setActive(0);input.current?.focus();}}>×</button>}
    </div>
    <p className="canvas-search-summary" role="status">{results.length?`${results.length} ${results.length===1?'elemento':'elementos'}${query?results.length===1?' encontrado':' encontrados':' en tu lienzo'}`:query?'No encontré esa palabra. Probá con otra.':'Tu lienzo está vacío. Agregá tu primera idea.'}</p>
    <div id="canvas-search-results" role="listbox" aria-label="Elementos encontrados">
      {rows.map((item,i)=><button id={`canvas-result-${start+i}`} key={item.id} role="option" aria-selected={current===start+i} tabIndex={-1} className="canvas-search-result" onClick={()=>visit(item)}>
        <span className="search-kind" aria-hidden="true">{item.kind==='Conexión'?'↗':item.kind==='Grupo'?'▦':item.kind==='Dibujo'?'✎':'◇'}</span>
        <span><strong>{item.label}</strong><small>{item.kind}{item.context&&` · ${item.context}`}</small></span><span className="search-go" aria-hidden="true">↗</span>
      </button>)}
    </div>
    {results.length>PAGE_SIZE&&<div className="canvas-search-pages"><button disabled={page===0} aria-label="Resultados anteriores" onClick={()=>{setActive(start-PAGE_SIZE);input.current?.focus();}}>←</button><span>{start+1}–{Math.min(start+PAGE_SIZE,results.length)} de {results.length}</span><button disabled={start+PAGE_SIZE>=results.length} aria-label="Más resultados" onClick={()=>{setActive(start+PAGE_SIZE);input.current?.focus();}}>→</button></div>}
    <p className="canvas-search-tip">↑ ↓ para recorrer · Enter para ir · Esc para cerrar</p>
  </div>;
}
