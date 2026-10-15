import {useEffect} from 'react';
import {documentStore,notify,redo,undo} from './store/documentStore';
import {stepBy,togglePlay} from './store/playbackStore';
import {select,selectionStore} from './store/selectionStore';
import {setFocusMode,viewStore,zoomAt,zoomBy,GRID,type Tool} from './store/viewStore';
import {copy,cut,deleteSelection,duplicate,fitAll,fitSelection,group,nudge,openCanvasSearch,paste,selectAll,ungroup} from './commands';
import {t} from './i18n';

/** Fuente única de los atajos: la ayuda en pantalla se genera desde esta lista. */
export const SHORTCUTS:[keys:string,action:string][]=[
  ['V · H',t('Seleccionar · Mano (pan)')],['N · C · Z · F',t('Última forma · Conector · Zona · Frame')],[t('Doble clic · F2'),t('Escribir el texto del elemento en el lugar')],
  ['D · G · E',t('Lápiz libre · Lápiz guiado · Goma')],
  [t('Espacio + arrastrar'),t('Pan temporal (también botón central)')],[t('Rueda · Ctrl + rueda'),t('Desplazar · Zoom hacia el cursor')],
  ['+ · − · 0 · 1',t('Acercar · Alejar · 100% · Encuadrar todo')],
  [t('Ctrl + F · Shift + 1'),t('Buscar en el lienzo · Ver selección')],
  [t('Clic · Shift + clic · Alt + clic'),t('Seleccionar · Sumar o quitar · Un nodo dentro de un grupo')],
  [t('Arrastrar en el fondo'),t('Selección rectangular (Shift suma)')],[t('Flechas'),t('Mover 8 px (Shift: 40 px · Alt: 1 px)')],
  [t('Ctrl + Z · Ctrl + Shift + Z'),t('Deshacer · Rehacer')],[t('Ctrl + C · X · V · D'),t('Copiar · Cortar · Pegar · Duplicar')],
  [t('Ctrl + A'),t('Seleccionar todo')],[t('Ctrl + G · Ctrl + Shift + G'),t('Agrupar · Desagrupar')],
  [t('Supr · Retroceso'),t('Eliminar la selección')],[t('Enter · Espacio sobre un elemento'),t('Seleccionarlo con teclado (Tab para recorrer)')],
  [t('Shift + Espacio · [ · ]'),t('Reproducir o pausar · Paso anterior · Paso siguiente')],['P',t('Modo presentación (Esc para salir)')],
  [t('Shift + F'),t('Entrar o salir del modo concentración')],
  [t('Esc'),t('Soltar la herramienta o la selección')],['?',t('Abrir esta ayuda')]
];
const TOOLS:Record<string,Tool>={v:'select',h:'pan',n:'node',c:'connect',l:'line',a:'arrow',d:'freehand',g:'guided',e:'eraser',z:'zone',f:'frame'};
const typing=(target:EventTarget|null)=>target instanceof HTMLElement&&(target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target.tagName));

export function useShortcuts(){
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      // En presentación manda su propio manejador; al escribir en un campo, el campo. Con una propuesta en vista previa el canvas es de sólo lectura.
      if(viewStore.get().presenting||viewStore.get().staging||typing(e.target))return;
      if(viewStore.get().tutorial||viewStore.get().searchOpen||viewStore.get().accountOpen||viewStore.get().shareOpen)return;
      const key=e.key.length===1?e.key.toLowerCase():e.key,mod=e.ctrlKey||e.metaKey,doc=documentStore.get().doc;
      const run=(action:()=>void)=>{e.preventDefault();action();};
      if(mod){
        if(e.altKey)return;
        switch(key){
          case 'z':return run(e.shiftKey?redo:undo);
          case 'y':return run(redo);
          case 'a':return run(selectAll);
          // Con texto seleccionado en la página, Ctrl+C sigue copiando ese texto.
          case 'c':return window.getSelection()?.toString()?undefined:run(copy);
          case 'x':return run(cut);
          case 'v':return run(paste);
          case 'd':return run(duplicate);
          case 'g':return run(e.shiftKey?ungroup:group);
          case 'f':return run(openCanvasSearch);
        }
        return;
      }
      if(e.altKey&&!key.startsWith('Arrow'))return;
      const step=e.shiftKey?GRID*5:e.altKey?1:GRID;
      switch(key){
        case 'ArrowLeft':return selectionStore.get().ids.length?run(()=>nudge(-step,0)):undefined;
        case 'ArrowRight':return selectionStore.get().ids.length?run(()=>nudge(step,0)):undefined;
        case 'ArrowUp':return selectionStore.get().ids.length?run(()=>nudge(0,-step)):undefined;
        case 'ArrowDown':return selectionStore.get().ids.length?run(()=>nudge(0,step)):undefined;
        case 'Delete':case 'Backspace':return selectionStore.get().ids.length?run(deleteSelection):undefined;
        case 'F2':return selectionStore.get().ids.length===1?run(()=>viewStore.set({editingId:selectionStore.get().ids[0]})):undefined;
        case 'Escape':return run(()=>{if(viewStore.get().focusMode){setFocusMode(false);return;}if(viewStore.get().tool!=='select'){if(viewStore.get().connectFromId)notify(t('Unión cancelada.'));viewStore.set({tool:'select',connectFromId:null,startMode:'choose'});}else select([]);});
        case '+':case '=':return run(()=>zoomBy(1.2));
        case '-':return run(()=>zoomBy(1/1.2));
        case '0':return run(()=>{const {viewport}=viewStore.get();zoomAt(viewport.width/2,viewport.height/2,1);});
        case '1':case '!':return run(e.shiftKey?fitSelection:()=>fitAll());
        case '[':return run(()=>stepBy(doc,-1));
        case ']':return run(()=>stepBy(doc,1));
        case ' ':return e.shiftKey?run(()=>togglePlay(doc)):undefined;
        case 'p':return run(()=>viewStore.set({presenting:true}));
        case '?':return run(()=>viewStore.set({panel:'history'}));
      }
      if(e.shiftKey&&key==='f')return run(()=>setFocusMode(!viewStore.get().focusMode));
      if(!e.shiftKey&&TOOLS[key])run(()=>viewStore.set({tool:TOOLS[key],connectFromId:null}));
    };
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
  },[]);
}
