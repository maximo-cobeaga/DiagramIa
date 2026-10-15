import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {useStore} from './store/createStore';
import {HISTORY_LIMIT,MAX_TABS,addTab,closeTab,dismissExternalChange,documentStore,loadExternalChange,redo,releaseRecovery,retrySave,switchTab,undo} from './store/documentStore';
import {playbackStore,useCameraFollow,usePlaybackClock} from './store/playbackStore';
import {select,selectionStore} from './store/selectionStore';
import {setFocusMode,setTheme,viewStore,zoomAt,zoomBy,type Panel,type Tool} from './store/viewStore';
import {clipboardStore,paste,deleteSelection,designAll,fitAll,fitSelection,goBackToView,openCanvasSearch} from './commands';
import {EXPORT_FORMATS,addImage,exportDocument,importFile,type ExportFormat} from './io';
import {SHORTCUTS,useShortcuts} from './shortcuts';
import {KIND_LABELS,SITE_URL,saveFile} from './ui';
import {Canvas} from './canvas/Canvas';
import {DIAGRAM_CSS} from './canvas/DiagramLayer';
import {Palette} from './palette/Palette';
import {Inspector} from './inspector/Inspector';
import {Chat} from './assistant/Chat';
import {LibraryPanel} from './library/LibraryPanel';
import {Timeline} from './timeline/Timeline';
import {Presentation} from './presentation/Presentation';
import {Tutorial} from './shell/Tutorial';
import {TEMPLATES,openTemplate} from './shell/templates';
import {AccountPage} from './shell/AccountPage';
import {UpgradeAction} from './shell/PlanBox';
import {ShareButton,ShareDialog} from './shell/ShareDialog';
import {capturePlanIntent,resolveCheckoutReturn,resolvePlanIntent} from './shell/checkout';
import {ErrorBoundary} from './shell/ErrorBoundary';
import {createSharedDocument,retryShared,sharedStore} from './store/sharedStore';
import {accountStore,refreshAccount,signIn} from './store/accountStore';
import {setSessionProbe,startTelemetry,track,trackReopened} from './telemetry';
import './styles.css';
import './workspace.css';
import {t} from './i18n';

// Iconos de 16 × 16 dibujados con trazo.
const TOOLS:[Tool,string,string,string][]=[
  ['select',t('Mover'),'V','M3 2l9 5-4 1.5L6.5 13z'],
  ['pan',t('Mano'),'H','M8 2v12M2 8h12M8 2 6 4M8 2l2 2M8 14l-2-2M8 14l2-2M2 8l2-2M2 8l2 2M14 8l-2-2M14 8l-2 2'],
  ['connect',t('Unir'),'C','M2 12h5V4h6M11 2l2 2-2 2'],
  ['line',t('Línea'),'L','M2 14 14 2'],['arrow',t('Flecha'),'A','M2 14 14 2M8 2h6v6'],['freehand',t('Lápiz'),'D','M11 2.5 13.5 5l-8 8H3v-2.5ZM9.5 4 12 6.5'],
  ['guided',t('Guiado'),'G','M2 12c2-7 4 3 6-3M11 2v5M8.5 4.5h5'],['eraser',t('Goma'),'E','M2 9l6-7 6 5-6 7H6zM5 6l6 5M7 14h7'],
  ['zone',t('Zona'),'Z','M2.5 3.5h11v9h-11zM5 6.5h3'],
  ['frame',t('Encuadre'),'F','M4 1v14M12 1v14M1 4h14M1 12h14']
];
const TOOL_HINTS:Record<Tool,string>={
  select:t('Arrastrá para mover. Doble clic escribe el texto. En el fondo, arrastrá para seleccionar varios.'),pan:t('Arrastrá para desplazar la vista.'),
  node:t('Hacé clic en el canvas para ubicar la forma elegida.'),connect:t('Arrastrá de un nodo a otro para crear una conexión.'),line:t('Arrastrá una línea. Shift la endereza.'),arrow:t('Arrastrá una flecha. Shift la endereza.'),freehand:t('Dibujá o escribí libremente. Esc vuelve a seleccionar.'),guided:t('Dibujá con trazos suaves. Las formas se emprolijan al soltar.'),eraser:t('Pasá por los trazos para borrarlos. Deshacer los recupera.'),
  zone:t('Arrastrá para dibujar la zona. Adopta los nodos sin zona que queden adentro.'),frame:t('Arrastrá para dibujar un encuadre de presentación.')
};
const PANELS:[Panel,string][]=[['assistant',t('IA')],['inspector',t('Propiedades')],['library',t('Biblioteca')],['history',t('Historial')]];
const SAVE_ICON={saved:'✓',pending:'…',error:'✕',blocked:'⏸'} as const;
const resetPlayback=()=>playbackStore.set({animationId:'',scenarioId:'',time:0,playing:false});

function Header(){
  const {past,future,save,activeId}=useStore(documentStore),shared=useStore(sharedStore),{theme,focusMode}=useStore(viewStore),inputRef=useRef<HTMLInputElement>(null);
  const remote=shared.tabId===activeId;
  const remoteSummary=shared.phase==='synced'?`✓ ${shared.mode==='cloud'?t('Nube'):t('MCP local')} · r${shared.serverRevision}`:shared.phase==='conflict'?t('✕ Conflicto · abrir Cuenta'):shared.phase==='offline'?t('✕ Sin conexión · abrir Cuenta'):t('… Guardando {0} cambio(s)',shared.pending);
  return <header>
    <a className="brand" href={SITE_URL} target="_blank" rel="noreferrer"><img src="/favicon.svg" alt=""/>diagramia</a>
    <span className={`save-state ${remote&&['conflict','offline'].includes(shared.phase)?'error':save.status}`} role="status" title={remote?shared.message:save.detail}>{remote?remoteSummary:`${SAVE_ICON[save.status]} ${save.detail}`}{save.status==='error'&&<button className="quiet" onClick={retrySave}>{t('Reintentar')}</button>}</span>
    <CloudButton/>
    <ShareButton/>
    <div className="header-actions">
      <button onClick={undo} disabled={!past.length} title={t('Deshacer (Ctrl + Z)')}>{t('↶ Deshacer')}</button>
      <button onClick={redo} disabled={!future.length} title={t('Rehacer (Ctrl + Shift + Z)')}>{t('↷ Rehacer')}</button>
      <button onClick={()=>inputRef.current?.click()}>{t('Importar')}</button>
      <select aria-label={t('Exportar')} value="" onChange={e=>void exportDocument(e.target.value as ExportFormat)}>
        <option value="" disabled>{t('Exportar…')}</option>{EXPORT_FORMATS.map(([key,label])=><option key={key} value={key}>{label}</option>)}
      </select>
      <UpgradeAction source="header">{t('⚡ Pasar a Pro')}</UpgradeAction>
      <AccountButton/>
      <button className="icon-button" aria-label={t('Configuración del editor')} title={t('Configuración del editor')} onClick={()=>viewStore.set({accountOpen:true,accountSection:'ajustes'})}>⚙</button>
      <button className="icon-button" onClick={()=>setTheme(theme==='dark'?'light':'dark')} aria-label={theme==='dark'?t('Cambiar a modo claro'):t('Cambiar a modo oscuro')} title={theme==='dark'?t('Modo claro'):t('Modo oscuro')}>{theme==='dark'?'☀':'☾'}</button>
      <button className="icon-button" onClick={()=>viewStore.set({tutorial:true})} aria-label={t('Abrir el tutorial')} title={t('Tutorial')}>?</button>
      <button className="focus-toggle" aria-pressed={focusMode} onClick={()=>setFocusMode(!focusMode)} title={t('Modo concentración (Shift + F)')}>{focusMode?t('← Volver al editor'):t('Concentrarme')}</button>
      <button className="primary" onClick={()=>viewStore.set({presenting:true})} title={t('Presentar (P)')}>{t('▶ Presentar')}</button>
    </div>
    <input ref={inputRef} type="file" hidden accept=".json,.mmd,.mermaid,.md,.txt,.drawio,.xml,.dot,.gv,.puml,.plantuml,.bpmn" onChange={e=>{const file=e.target.files?.[0];if(file)void importFile(file);e.target.value='';}}/>
  </header>;
}

/**
 * Guardar en la nube, a la vista: el diagrama deja de vivir sólo en este navegador y desde ahí cada cambio se guarda solo.
 * Con el diagrama ya vinculado, el estado está a la izquierda y acá sólo aparece lo que requiere una acción.
 */
function CloudButton(){
  const {auth,account}=useStore(accountStore),shared=useStore(sharedStore),{activeId}=useStore(documentStore),[working,setWorking]=useState(false);
  const diagrams=()=>viewStore.set({accountOpen:true,accountSection:'diagramas'});
  if(auth==='loading'||auth==='unavailable')return null;
  if(shared.tabId===activeId)return shared.phase==='offline'?<button className="cloud-save" onClick={retryShared}>{t('↻ Reintentar guardado')}</button>:shared.phase==='conflict'?<button className="cloud-save" onClick={diagrams}>{t('Resolver conflicto')}</button>:null;
  if(auth==='guest'||!account)return <button className="cloud-save" onClick={()=>signIn('cloud')} title={t('Iniciá sesión para guardar tus diagramas en la nube')}>{t('☁ Guardar en la nube')}</button>;
  // Con el plan lleno, el botón lleva a Mis diagramas, donde se ve el límite y cómo ampliarlo.
  const save=async()=>{
    if(account.storage.documents>=account.storage.maxDocuments){diagrams();return;}
    setWorking(true);
    try{if(await createSharedDocument('cloud'))await refreshAccount();}finally{setWorking(false);}
  };
  return <button className="cloud-save" disabled={working} onClick={()=>void save()} title={t('Guardar este diagrama en tu cuenta. Después, cada cambio se guarda solo.')}>{working?t('Guardando…'):t('☁ Guardar en la nube')}</button>;
}

/** Entrada a la cuenta siempre a la vista: invitar a iniciar sesión es parte del recorrido, no un ajuste escondido. */
function AccountButton(){
  const {auth,account}=useStore(accountStore),open=()=>viewStore.set({accountOpen:true,accountSection:'resumen'});
  if(auth==='guest')return <button className="signin" onClick={()=>signIn('menu')}>{t('Iniciar sesión')}</button>;
  if(auth!=='signed-in'||!account)return <button onClick={open}>{t('Cuenta')}</button>;
  const email=account.session.email,initial=(email??'?').slice(0,1).toUpperCase();
  return <button className="account-chip" onClick={open} title={email?t('Cuenta: {0}',email):t('Cuenta')} aria-label={email?t('Cuenta de {0}',email):t('Cuenta')}>
    <span className="avatar" aria-hidden="true">{initial}</span><span className="account-email">{email??t('Mi cuenta')}</span>{!account.session.emailVerified&&<span className="warn-dot" title={t('Email sin verificar')} aria-hidden="true">!</span>}
  </button>;
}

/** Pestañas: cada una es un diagrama independiente, con su propio historial y guardado. */
function Tabs(){
  const {tabs,activeId,doc}=useStore(documentStore);
  return <nav className="doc-tabs" aria-label={t('Diagramas abiertos')}>
    <div role="tablist">{tabs.map(tab=><div key={tab.id} className={'doc-tab'+(tab.id===activeId?' active':'')}>
      <button role="tab" aria-selected={tab.id===activeId} onClick={()=>{if(tab.id!==activeId){resetPlayback();switchTab(tab.id);}}} title={tab.title}>{tab.title}{tab.id===activeId&&<small>r{doc.revision}</small>}</button>
      <button className="doc-tab-close" aria-label={t('Cerrar {0}',tab.title)} title={t('Cerrar pestaña')} onClick={()=>{if(confirm(t('Se cierra «{0}» y se borra de este navegador. Exportalo antes si lo necesitás.',tab.title))){resetPlayback();closeTab(tab.id);}}}>×</button>
    </div>)}</div>
    <button className="doc-tab-add" disabled={tabs.length>=MAX_TABS} onClick={()=>{resetPlayback();addTab();viewStore.set({focusMode:false});}} aria-label={t('Nueva pestaña con un canvas vacío')} title={t('Nueva idea')}>{t('＋ Nueva idea')}</button>
  </nav>;
}

function Tools(){
  const {doc}=useStore(documentStore),{tool}=useStore(viewStore),{ids}=useStore(selectionStore),imageRef=useRef<HTMLInputElement>(null);
  const [expanded,setExpanded]=useState(()=>!window.matchMedia('(max-width:900px)').matches);
  useEffect(()=>{const query=window.matchMedia('(max-width:900px)'),sync=()=>setExpanded(!query.matches);query.addEventListener('change',sync);return()=>query.removeEventListener('change',sync);},[]);
  const elements:[string,string,string][]=[...doc.nodes.map(n=>[n.id,n.label,KIND_LABELS[n.kind]] as [string,string,string]),...doc.drawings.map(d=>[d.id,d.kind==='arrow'?t('Flecha libre'):d.kind==='line'?t('Línea'):t('Trazo a mano'),t('Dibujo')] as [string,string,string]),...doc.zones.map(z=>[z.id,z.label,t('Zona')] as [string,string,string]),...doc.frames.map(f=>[f.id,f.label,t('Frame')] as [string,string,string])];
  return <aside className="tools" aria-label={t('Herramientas y formas')}>
    <div className="tools-heading"><span className="eyebrow">{t('CREÁ A TU MANERA')}</span><strong>{t('Tu caja de ideas')}</strong></div>
    <div className="tool-grid" role="toolbar" aria-label={t('Herramienta activa')}>{TOOLS.map(([id,label,key,icon])=>
      <button key={id} className={tool===id?'chosen':''} aria-pressed={tool===id} title={`${label} (${key}) · ${TOOL_HINTS[id]}`} onClick={()=>viewStore.set({tool:id,connectFromId:null})}><svg viewBox="0 0 16 16" aria-hidden="true"><path d={icon}/></svg><span>{label}</span></button>)}
    </div>
    <button className="tool-extra-toggle" aria-expanded={expanded} aria-controls="tool-extra" onClick={()=>setExpanded(!expanded)}>{expanded?t('Ocultar formas y elementos'):t('Mostrar formas y elementos')}</button>
    {expanded&&<div className="tool-extra" id="tool-extra">
    <span className="eyebrow">{t('AGREGÁ UNA IDEA')}</span>
    <Palette/>
    <button onClick={()=>imageRef.current?.click()}>{t('Agregar imagen…')}</button>
    <input ref={imageRef} type="file" hidden accept="image/png,image/jpeg,image/webp,image/svg+xml" data-role="image-input" onChange={e=>{const file=e.target.files?.[0];if(file)void addImage(file);e.target.value='';}}/>
    <span className="eyebrow">{t('PARA EMPEZAR')}</span>
    <select aria-label={t('Cargar ejemplo')} value="" onChange={e=>openTemplate(+e.target.value)}><option value="" disabled>{t('Abrir un ejemplo…')}</option>{TEMPLATES.map(({label},i)=><option key={label} value={i}>{label}</option>)}</select>
    <button disabled={!ids.length} onClick={deleteSelection}>{t('Eliminar selección')}</button>
    <details className="elements"><summary>{t('Elementos ·')} {elements.length}</summary>
      <div className="element-list">{elements.map(([id,label,kind])=>
        <button key={id} className={ids.includes(id)?'chosen':''} onClick={e=>select(e.shiftKey?[...ids,id]:[id])}><span>{label}</span><small>{kind} · {id}</small></button>)}
      </div>
    </details>
    </div>}
  </aside>;
}

function CanvasToolbar(){
  const {camera,viewport,sideOpen,searchOpen,navigationBack,staging,editingId}=useStore(viewStore),{ids}=useStore(selectionStore);
  const {clip}=useStore(clipboardStore);
  return <div className="canvas-toolbar">
    <button className="canvas-search-toggle" disabled={Boolean(staging||editingId)} aria-expanded={searchOpen} title={t('Buscar en el lienzo (Ctrl + F)')} onClick={()=>searchOpen?viewStore.set({searchOpen:false}):openCanvasSearch()}><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg>{t('Buscar')}</button>
    <div>
      {navigationBack&&<button className="navigation-back" onClick={goBackToView} aria-label={t('Volver a la vista anterior')} title={t('Volver a la vista anterior')}>↶</button>}
      <button onClick={()=>zoomBy(1/1.2)} aria-label={t('Alejar')}>−</button>
      <button className="zoom-readout" onClick={()=>zoomAt(viewport.width/2,viewport.height/2,1)} title={t('Volver a 100%')}>{Math.round(camera.zoom*100)}%</button>
      <button onClick={()=>zoomBy(1.2)} aria-label={t('Acercar')}>+</button>
      {clip&&<button onClick={paste} title={t('Pegar (Ctrl + V)')}>{t('Pegar')}</button>}
      <button className="wide design-button" onClick={designAll} title={t('Colores, formas, iconos y recorrido automáticos')}>{t('✦ Darle diseño')}</button>
      <button className="wide" onClick={()=>fitAll()} title={t('Encuadrar todo (1)')}>{t('Encuadrar')}</button>
      {ids.length>0&&!staging&&<button className="wide selection-fit" onClick={fitSelection} title={t('Ver selección (Shift + 1)')}>{t('Ver selección')}</button>}
      <button className={'panel-toggle'+(sideOpen?' chosen':'')} aria-pressed={sideOpen} aria-controls="side-panel" onClick={()=>viewStore.set({sideOpen:!sideOpen})} aria-label={sideOpen?t('Ocultar el panel lateral'):t('Mostrar el panel lateral')} title={sideOpen?t('Ocultar panel'):t('Mostrar panel')}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="2"/><path d="M10 2.5v11"/>{sideOpen&&<path className="fill" d="M10 3h4v10h-4z"/>}</svg>
      </button>
    </div>
  </div>;
}

function StatusBar(){
  const {notice,recovery,externalChange}=useStore(documentStore);
  return <div className={`status ${notice.tone}`} role="status">
    <span>{notice.tone==='error'?t('Error: '):notice.tone==='warn'?t('Atención: '):''}{notice.text}</span>
    {recovery!==null&&<button onClick={()=>{saveFile('diagramia-recovery.json',recovery,'application/json');releaseRecovery();}}>{t('Exportar copia dañada y habilitar guardado')}</button>}
    {externalChange&&<span className="status-actions">{t('Otra ventana guardó una versión distinta de este diagrama.')}<button onClick={loadExternalChange}>{t('Cargar esa versión')}</button><button onClick={dismissExternalChange}>{t('Seguir con la mía')}</button></span>}
  </div>;
}

function SessionPanel(){
  const {log,past,future,dropped,doc}=useStore(documentStore);
  return <div className="panel-body">
    <span className="eyebrow">{t('SESIÓN DE TRABAJO')}</span>
    <p className="inline-note">{t('Revisión actual r')}{doc.revision}. {past.length} {t('paso(s) para deshacer,')} {future.length} {t('para rehacer. El historial vive sólo en esta sesión y guarda hasta')} {HISTORY_LIMIT} {t('pasos por pestaña.')}</p>
    {dropped>0&&<p className="inline-note warn">{t('⚠ Se descartaron los')} {dropped} {t('pasos más antiguos por el límite del historial. Exportá el JSON si necesitás conservar un estado.')}</p>}
    <h3>{t('Cambios')}</h3>
    {log.length?<ol className="log">{[...log].reverse().map((line,i)=><li key={log.length-i}>{line}</li>)}</ol>:<p className="inline-note">{t('No hay cambios registrados.')}</p>}
    <h3>{t('Atajos de teclado')}</h3>
    <dl className="shortcuts">{SHORTCUTS.map(([keys,action])=><React.Fragment key={keys}><dt>{keys}</dt><dd>{action}</dd></React.Fragment>)}</dl>
  </div>;
}

function SidePanel(){
  const {panel}=useStore(viewStore);
  const {activeId}=useStore(documentStore);
  return <aside className="side" id="side-panel" aria-label={t('Panel lateral')}>
    <div className="tabs" role="tablist">{PANELS.map(([id,label])=><button key={id} role="tab" aria-selected={panel===id} className={panel===id?'chosen':''} onClick={()=>viewStore.set({panel:id})}>{label}</button>)}</div>
    <div role="tabpanel" className={'side-body panel-'+panel}>{panel==='inspector'?<Inspector/>:panel==='assistant'?<Chat key={activeId}/>:panel==='library'?<LibraryPanel/>:<SessionPanel/>}</div>
  </aside>;
}

function App(){
  const {presenting,tutorial,sideOpen,focusMode,accountOpen,shareOpen}=useStore(viewStore);
  useShortcuts();usePlaybackClock();useCameraFollow();
  // El inicio vive dentro del lienzo vacío; el tutorial queda disponible en «?».
  useEffect(()=>{capturePlanIntent();void refreshAccount().then(async()=>{await resolveCheckoutReturn();await resolvePlanIntent();});},[]);
  return <>
    <style>{DIAGRAM_CSS}</style>
    {/* Mientras se presenta o hay un modal, el editor queda inerte: ni el foco ni los atajos llegan a los controles tapados. */}
    <div className={'app'+(focusMode?' focus-mode':'')} inert={presenting||tutorial||accountOpen||shareOpen}>
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
    {shareOpen&&<ShareDialog/>}
    <AccountPage/>
  </>;
}
// #fundador abre el panel de métricas (sólo administradores). No se mide: no es uso del producto.
const founder=location.hash==='#fundador';
const FounderDashboard=React.lazy(()=>import('./founder/FounderDashboard').then(m=>({default:m.FounderDashboard})));
window.addEventListener('hashchange',()=>{if((location.hash==='#fundador')!==founder)location.reload();});
// /s/<token> abre un diagrama compartido en sólo lectura (ADR 106): no monta el editor ni toca los diagramas de este navegador.
const sharedPath=location.pathname.startsWith('/s/'),sharedToken=location.pathname.match(/^\/s\/([A-Za-z0-9_-]{20,64})\/?$/)?.[1]??'';
const SharedView=React.lazy(()=>import('./shared/SharedView').then(m=>({default:m.SharedView})));
if(!founder&&!sharedPath){
  setSessionProbe(()=>{const {doc}=documentStore.get();return {nodes:doc.nodes.length,edges:doc.edges.length,animations:doc.animations.length};});
  startTelemetry();trackReopened(documentStore.get().doc);
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary>{sharedPath?<React.Suspense fallback={null}><SharedView token={sharedToken}/></React.Suspense>:founder?<React.Suspense fallback={null}><FounderDashboard/></React.Suspense>:<App/>}</ErrorBoundary></React.StrictMode>);
