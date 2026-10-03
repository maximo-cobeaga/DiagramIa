import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {useStore} from './store/createStore';
import {HISTORY_LIMIT,MAX_TABS,addTab,closeTab,dismissExternalChange,documentStore,loadExternalChange,redo,releaseRecovery,retrySave,switchTab,undo} from './store/documentStore';
import {playbackStore,useCameraFollow,usePlaybackClock} from './store/playbackStore';
import {select,selectionStore} from './store/selectionStore';
import {setFocusMode,setTheme,viewStore,zoomAt,zoomBy,type Panel,type Tool} from './store/viewStore';
import {deleteSelection,designAll,fitAll} from './commands';
import {EXPORT_FORMATS,addImage,exportDocument,importFile,type ExportFormat} from './io';
import {SHORTCUTS,useShortcuts} from './shortcuts';
import {KIND_LABELS,saveFile} from './ui';
import {Canvas} from './canvas/Canvas';
import {DIAGRAM_CSS} from './canvas/DiagramLayer';
import {Palette} from './palette/Palette';
import {Inspector} from './inspector/Inspector';
import {Chat} from './assistant/Chat';
import {ManualChannel} from './assistant/AssistantPanel';
import {LibraryPanel} from './library/LibraryPanel';
import {Timeline} from './timeline/Timeline';
import {Presentation} from './presentation/Presentation';
import {Tutorial} from './shell/Tutorial';
import {TEMPLATES,openTemplate} from './shell/templates';
import {SharedPanel} from './shell/SharedPanel';
import {sharedStore} from './store/sharedStore';
import {accountStore,refreshAccount,signIn} from './store/accountStore';
import {browserOptOut,setTelemetryEnabled,startTelemetry,telemetryEnabled,track,trackReopened} from './telemetry';
import './styles.css';

// Iconos de 16 × 16 dibujados con trazo.
const TOOLS:[Tool,string,string,string][]=[
  ['select','Mover','V','M3 2l9 5-4 1.5L6.5 13z'],
  ['pan','Mano','H','M8 2v12M2 8h12M8 2 6 4M8 2l2 2M8 14l-2-2M8 14l2-2M2 8l2-2M2 8l2 2M14 8l-2-2M14 8l-2 2'],
  ['connect','Unir','C','M2 12h5V4h6M11 2l2 2-2 2'],
  ['line','Línea','L','M2 14 14 2'],['arrow','Flecha','A','M2 14 14 2M8 2h6v6'],['freehand','Dibujar','D','M2 12c2-9 4 3 6-3s4 7 6-5'],
  ['zone','Zona','Z','M2.5 3.5h11v9h-11zM5 6.5h3'],
  ['frame','Encuadre','F','M4 1v14M12 1v14M1 4h14M1 12h14']
];
const TOOL_HINTS:Record<Tool,string>={
  select:'Arrastrá para mover. Doble clic escribe el texto. En el fondo, arrastrá para seleccionar varios.',pan:'Arrastrá para desplazar la vista.',
  node:'Hacé clic en el canvas para ubicar la forma elegida.',connect:'Arrastrá de un nodo a otro para crear una conexión.',line:'Arrastrá sobre el canvas para dibujar una línea libre.',arrow:'Arrastrá sobre el canvas para dibujar una flecha libre.',freehand:'Arrastrá para dibujar a mano alzada.',
  zone:'Arrastrá para dibujar la zona. Adopta los nodos sin zona que queden adentro.',frame:'Arrastrá para dibujar un encuadre de presentación.'
};
const PANELS:[Panel,string][]=[['assistant','IA'],['inspector','Propiedades'],['library','Biblioteca'],['history','Cuenta']];
// La landing vive en el dominio principal y el editor en app.<dominio>; en desarrollo la sirve npm run dev:landing.
const SITE_URL=location.hostname.startsWith('app.')?`${location.protocol}//${location.hostname.slice(4)}/`:'http://127.0.0.1:4173/';
const SAVE_ICON={saved:'✓',pending:'…',error:'✕',blocked:'⏸'} as const;
const resetPlayback=()=>playbackStore.set({animationId:'',scenarioId:'',time:0,playing:false});

function Header(){
  const {past,future,save,activeId}=useStore(documentStore),shared=useStore(sharedStore),{theme,focusMode}=useStore(viewStore),inputRef=useRef<HTMLInputElement>(null);
  const remote=shared.tabId===activeId;
  const remoteSummary=shared.phase==='synced'?`✓ ${shared.mode==='cloud'?'Nube':'MCP local'} · r${shared.serverRevision}`:shared.phase==='conflict'?'✕ Conflicto · abrir Cuenta':shared.phase==='offline'?'✕ Sin conexión · abrir Cuenta':`… Guardando ${shared.pending} cambio(s)`;
  return <header>
    <a className="brand" href={SITE_URL} target="_blank" rel="noreferrer"><img src="/favicon.svg" alt=""/>diagramia</a>
    <span className={`save-state ${remote&&['conflict','offline'].includes(shared.phase)?'error':save.status}`} role="status" title={remote?shared.message:save.detail}>{remote?remoteSummary:`${SAVE_ICON[save.status]} ${save.detail}`}{save.status==='error'&&<button className="quiet" onClick={retrySave}>Reintentar</button>}</span>
    <div className="header-actions">
      <button onClick={undo} disabled={!past.length} title="Deshacer (Ctrl + Z)">↶ Deshacer</button>
      <button onClick={redo} disabled={!future.length} title="Rehacer (Ctrl + Shift + Z)">↷ Rehacer</button>
      <button onClick={()=>inputRef.current?.click()}>Importar</button>
      <select aria-label="Exportar" value="" onChange={e=>void exportDocument(e.target.value as ExportFormat)}>
        <option value="" disabled>Exportar…</option>{EXPORT_FORMATS.map(([key,label])=><option key={key} value={key}>{label}</option>)}
      </select>
      <AccountButton/>
      <button className="icon-button" onClick={()=>setTheme(theme==='dark'?'light':'dark')} aria-label={theme==='dark'?'Cambiar a modo claro':'Cambiar a modo oscuro'} title={theme==='dark'?'Modo claro':'Modo oscuro'}>{theme==='dark'?'☀':'☾'}</button>
      <button className="icon-button" onClick={()=>viewStore.set({tutorial:true})} aria-label="Abrir el tutorial" title="Tutorial">?</button>
      <button className="focus-toggle" aria-pressed={focusMode} onClick={()=>setFocusMode(!focusMode)} title="Modo concentración (Shift + F)">{focusMode?'← Volver al editor':'Concentrarme'}</button>
      <button className="primary" onClick={()=>viewStore.set({presenting:true})} title="Presentar (P)">▶ Presentar</button>
    </div>
    <input ref={inputRef} type="file" hidden accept=".json,.mmd,.mermaid,.md,.txt,.drawio,.xml,.dot,.gv,.puml,.plantuml,.bpmn" onChange={e=>{const file=e.target.files?.[0];if(file)void importFile(file);e.target.value='';}}/>
  </header>;
}

/** Entrada a la cuenta siempre a la vista: invitar a iniciar sesión es parte del recorrido, no un ajuste escondido. */
function AccountButton(){
  const {auth,account}=useStore(accountStore),open=()=>viewStore.set({panel:'history',sideOpen:true});
  if(auth==='guest')return <button className="signin" onClick={()=>signIn('menu')}>Iniciar sesión</button>;
  if(auth!=='signed-in'||!account)return <button onClick={open}>Cuenta</button>;
  const email=account.session.email,initial=(email??'?').slice(0,1).toUpperCase();
  return <button className="account-chip" onClick={open} title={email?`Cuenta: ${email}`:'Cuenta'} aria-label={email?`Cuenta de ${email}`:'Cuenta'}>
    <span className="avatar" aria-hidden="true">{initial}</span><span className="account-email">{email??'Mi cuenta'}</span>{!account.session.emailVerified&&<span className="warn-dot" title="Email sin verificar" aria-hidden="true">!</span>}
  </button>;
}

/** Pestañas: cada una es un diagrama independiente, con su propio historial y guardado. */
function Tabs(){
  const {tabs,activeId,doc}=useStore(documentStore);
  return <nav className="doc-tabs" aria-label="Diagramas abiertos">
    <div role="tablist">{tabs.map(tab=><div key={tab.id} className={'doc-tab'+(tab.id===activeId?' active':'')}>
      <button role="tab" aria-selected={tab.id===activeId} onClick={()=>{if(tab.id!==activeId){resetPlayback();switchTab(tab.id);}}} title={tab.title}>{tab.title}{tab.id===activeId&&<small>r{doc.revision}</small>}</button>
      <button className="doc-tab-close" aria-label={`Cerrar ${tab.title}`} title="Cerrar pestaña" onClick={()=>{if(confirm(`Se cierra «${tab.title}» y se borra de este navegador. Exportalo antes si lo necesitás.`)){resetPlayback();closeTab(tab.id);}}}>×</button>
    </div>)}</div>
    <button className="doc-tab-add" disabled={tabs.length>=MAX_TABS} onClick={()=>{resetPlayback();addTab();viewStore.set({focusMode:false});}} aria-label="Nueva pestaña con un canvas vacío" title="Nueva idea">＋ Nueva idea</button>
  </nav>;
}

function Tools(){
  const {doc}=useStore(documentStore),{tool}=useStore(viewStore),{ids}=useStore(selectionStore),imageRef=useRef<HTMLInputElement>(null);
  const [expanded,setExpanded]=useState(()=>!window.matchMedia('(max-width:900px)').matches);
  useEffect(()=>{const query=window.matchMedia('(max-width:900px)'),sync=()=>setExpanded(!query.matches);query.addEventListener('change',sync);return()=>query.removeEventListener('change',sync);},[]);
  const elements:[string,string,string][]=[...doc.nodes.map(n=>[n.id,n.label,KIND_LABELS[n.kind]] as [string,string,string]),...doc.drawings.map(d=>[d.id,d.kind==='arrow'?'Flecha libre':d.kind==='line'?'Línea':'Trazo a mano','Dibujo'] as [string,string,string]),...doc.zones.map(z=>[z.id,z.label,'Zona'] as [string,string,string]),...doc.frames.map(f=>[f.id,f.label,'Frame'] as [string,string,string])];
  return <aside className="tools" aria-label="Herramientas y formas">
    <div className="tools-heading"><span className="eyebrow">CREÁ A TU MANERA</span><strong>Tu caja de ideas</strong></div>
    <div className="tool-grid" role="toolbar" aria-label="Herramienta activa">{TOOLS.map(([id,label,key,icon])=>
      <button key={id} className={tool===id?'chosen':''} aria-pressed={tool===id} title={`${label} (${key})`} onClick={()=>viewStore.set({tool:id,connectFromId:null})}><svg viewBox="0 0 16 16" aria-hidden="true"><path d={icon}/></svg><span>{label}</span></button>)}
    </div>
    <p className="tool-note">{TOOL_HINTS[tool]}</p>
    <button className="tool-extra-toggle" aria-expanded={expanded} aria-controls="tool-extra" onClick={()=>setExpanded(!expanded)}>{expanded?'Ocultar formas y elementos':'Mostrar formas y elementos'}</button>
    {expanded&&<div className="tool-extra" id="tool-extra">
    <span className="eyebrow">AGREGÁ UNA IDEA</span>
    <Palette/>
    <button onClick={()=>imageRef.current?.click()}>Agregar imagen…</button>
    <input ref={imageRef} type="file" hidden accept="image/png,image/jpeg,image/webp,image/svg+xml" data-role="image-input" onChange={e=>{const file=e.target.files?.[0];if(file)void addImage(file);e.target.value='';}}/>
    <span className="eyebrow">PARA EMPEZAR</span>
    <select aria-label="Cargar ejemplo" value="" onChange={e=>openTemplate(+e.target.value)}><option value="" disabled>Abrir un ejemplo…</option>{TEMPLATES.map(({label},i)=><option key={label} value={i}>{label}</option>)}</select>
    <button disabled={!ids.length} onClick={deleteSelection}>Eliminar selección</button>
    <details className="elements"><summary>Elementos · {elements.length}</summary>
      <div className="element-list">{elements.map(([id,label,kind])=>
        <button key={id} className={ids.includes(id)?'chosen':''} onClick={e=>select(e.shiftKey?[...ids,id]:[id])}><span>{label}</span><small>{kind} · {id}</small></button>)}
      </div>
    </details>
    </div>}
  </aside>;
}

function CanvasToolbar(){
  const {camera,viewport,sideOpen}=useStore(viewStore);
  return <div className="canvas-toolbar">
    <span className="canvas-label"><span aria-hidden="true"/>Tu lienzo</span>
    <div>
      <button onClick={()=>zoomBy(1/1.2)} aria-label="Alejar">−</button>
      <button className="zoom-readout" onClick={()=>zoomAt(viewport.width/2,viewport.height/2,1)} title="Volver a 100%">{Math.round(camera.zoom*100)}%</button>
      <button onClick={()=>zoomBy(1.2)} aria-label="Acercar">+</button>
      <button className="wide design-button" onClick={designAll} title="Colores, formas, iconos y recorrido automáticos">✦ Darle diseño</button>
      <button className="wide" onClick={()=>fitAll()} title="Encuadrar todo (1)">Encuadrar</button>
      <button className={'panel-toggle'+(sideOpen?' chosen':'')} aria-pressed={sideOpen} aria-controls="side-panel" onClick={()=>viewStore.set({sideOpen:!sideOpen})} aria-label={sideOpen?'Ocultar el panel lateral':'Mostrar el panel lateral'} title={sideOpen?'Ocultar panel':'Mostrar panel'}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="2"/><path d="M10 2.5v11"/>{sideOpen&&<path className="fill" d="M10 3h4v10h-4z"/>}</svg>
      </button>
    </div>
  </div>;
}

function StatusBar(){
  const {notice,recovery,externalChange}=useStore(documentStore);
  return <div className={`status ${notice.tone}`} role="status">
    <span>{notice.tone==='error'?'Error: ':notice.tone==='warn'?'Atención: ':''}{notice.text}</span>
    {recovery!==null&&<button onClick={()=>{saveFile('diagramia-recovery.json',recovery,'application/json');releaseRecovery();}}>Exportar copia dañada y habilitar guardado</button>}
    {externalChange&&<span className="status-actions">Otra ventana guardó una versión distinta de este diagrama.<button onClick={loadExternalChange}>Cargar esa versión</button><button onClick={dismissExternalChange}>Seguir con la mía</button></span>}
  </div>;
}

function SessionPanel(){
  const {log,past,future,dropped,doc}=useStore(documentStore);
  return <div className="panel-body">
    <SharedPanel/>
    <PrivacySettings/>
    <span className="eyebrow">SESIÓN DE TRABAJO</span>
    <p className="inline-note">Revisión actual r{doc.revision}. {past.length} paso(s) para deshacer, {future.length} para rehacer. El historial vive sólo en esta sesión y guarda hasta {HISTORY_LIMIT} pasos por pestaña.</p>
    {dropped>0&&<p className="inline-note warn">⚠ Se descartaron los {dropped} pasos más antiguos por el límite del historial. Exportá el JSON si necesitás conservar un estado.</p>}
    <h3>Cambios</h3>
    {log.length?<ol className="log">{[...log].reverse().map((line,i)=><li key={log.length-i}>{line}</li>)}</ol>:<p className="inline-note">No hay cambios registrados.</p>}
    <h3>Atajos de teclado</h3>
    <dl className="shortcuts">{SHORTCUTS.map(([keys,action])=><React.Fragment key={keys}><dt>{keys}</dt><dd>{action}</dd></React.Fragment>)}</dl>
    <h3>Otra IA o MCP</h3>
    <ManualChannel/>
  </div>;
}

/** Medición anónima de uso: qué se usa y dónde se traba la gente, nunca el contenido de los diagramas. */
function PrivacySettings(){
  const [enabled,setEnabled]=useState(telemetryEnabled()),blocked=browserOptOut();
  return <section aria-label="Privacidad">
    <h3>Privacidad</h3>
    <label className="check"><input type="checkbox" checked={enabled&&!blocked} disabled={blocked} onChange={e=>{setTelemetryEnabled(e.target.checked);setEnabled(e.target.checked);}}/>Enviar datos anónimos de uso</label>
    <p className="inline-note">{blocked?'Tu navegador pide no ser rastreado (Do Not Track o Global Privacy Control): no se envía nada.':'Sirven para mejorar Diagramia: qué herramientas se usan, errores y tiempos. Nunca se envía el texto de tus diagramas ni tus pedidos a la IA.'} <a href="/privacidad.html" target="_blank" rel="noopener">Cómo tratamos tus datos</a></p>
  </section>;
}

function SidePanel(){
  const {panel}=useStore(viewStore);
  return <aside className="side" id="side-panel" aria-label="Panel lateral">
    <div className="tabs" role="tablist">{PANELS.map(([id,label])=><button key={id} role="tab" aria-selected={panel===id} className={panel===id?'chosen':''} onClick={()=>viewStore.set({panel:id})}>{label}</button>)}</div>
    <div role="tabpanel" className={'side-body panel-'+panel}>{panel==='inspector'?<Inspector/>:panel==='assistant'?<Chat/>:panel==='library'?<LibraryPanel/>:<SessionPanel/>}</div>
  </aside>;
}

function App(){
  const {presenting,tutorial,sideOpen,focusMode}=useStore(viewStore);
  useShortcuts();usePlaybackClock();useCameraFollow();
  // El inicio vive dentro del lienzo vacío; el tutorial queda disponible en «?».
  useEffect(()=>{void refreshAccount();},[]);
  return <>
    <style>{DIAGRAM_CSS}</style>
    {/* Mientras se presenta o hay un modal, el editor queda inerte: ni el foco ni los atajos llegan a los controles tapados. */}
    <div className={'app'+(focusMode?' focus-mode':'')} inert={presenting||tutorial}>
      <Header/>
      <Tabs/>
      <div className={'workspace'+(sideOpen?'':' side-closed')}>
        <Tools/>
        <main className="surface"><CanvasToolbar/><Canvas/><StatusBar/><Timeline/></main>
        {sideOpen&&<SidePanel/>}
      </div>
    </div>
    {presenting&&<Presentation/>}
    {tutorial&&<Tutorial/>}
  </>;
}
// #fundador abre el panel de métricas (sólo administradores). No se mide: no es uso del producto.
const founder=location.hash==='#fundador';
const FounderDashboard=React.lazy(()=>import('./founder/FounderDashboard').then(m=>({default:m.FounderDashboard})));
window.addEventListener('hashchange',()=>{if((location.hash==='#fundador')!==founder)location.reload();});
if(!founder){startTelemetry();trackReopened(documentStore.get().doc);}
createRoot(document.getElementById('root')!).render(<React.StrictMode>{founder?<React.Suspense fallback={null}><FounderDashboard/></React.Suspense>:<App/>}</React.StrictMode>);
