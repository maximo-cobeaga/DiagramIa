import {useEffect} from 'react';
import {documentStore,notify,redo,undo} from './store/documentStore';
import {stepBy,togglePlay} from './store/playbackStore';
import {select,selectionStore} from './store/selectionStore';
import {setFocusMode,viewStore,zoomAt,zoomBy,GRID,type Tool} from './store/viewStore';
import {copy,cut,deleteSelection,duplicate,fitAll,fitSelection,group,nudge,openCanvasSearch,paste,selectAll,ungroup} from './commands';

/** Fuente única de los atajos: la ayuda en pantalla se genera desde esta lista. */
export const SHORTCUTS:[keys:string,action:string][]=[
  ['V · H','Seleccionar · Mano (pan)'],['N · C · Z · F','Última forma · Conector · Zona · Frame'],['Doble clic · F2','Escribir el texto del elemento en el lugar'],
  ['D · G · E','Lápiz libre · Lápiz guiado · Goma'],
  ['Espacio + arrastrar','Pan temporal (también botón central)'],['Rueda · Ctrl + rueda','Desplazar · Zoom hacia el cursor'],
  ['+ · − · 0 · 1','Acercar · Alejar · 100% · Encuadrar todo'],
  ['Ctrl + F · Shift + 1','Buscar en el lienzo · Ver selección'],
  ['Clic · Shift + clic · Alt + clic','Seleccionar · Sumar o quitar · Un nodo dentro de un grupo'],
  ['Arrastrar en el fondo','Selección rectangular (Shift suma)'],['Flechas','Mover 8 px (Shift: 40 px · Alt: 1 px)'],
  ['Ctrl + Z · Ctrl + Shift + Z','Deshacer · Rehacer'],['Ctrl + C · X · V · D','Copiar · Cortar · Pegar · Duplicar'],
  ['Ctrl + A','Seleccionar todo'],['Ctrl + G · Ctrl + Shift + G','Agrupar · Desagrupar'],
  ['Supr · Retroceso','Eliminar la selección'],['Enter · Espacio sobre un elemento','Seleccionarlo con teclado (Tab para recorrer)'],
  ['Shift + Espacio · [ · ]','Reproducir o pausar · Paso anterior · Paso siguiente'],['P','Modo presentación (Esc para salir)'],
  ['Shift + F','Entrar o salir del modo concentración'],
  ['Esc','Soltar la herramienta o la selección'],['?','Abrir esta ayuda']
];
const TOOLS:Record<string,Tool>={v:'select',h:'pan',n:'node',c:'connect',l:'line',a:'arrow',d:'freehand',g:'guided',e:'eraser',z:'zone',f:'frame'};
const typing=(target:EventTarget|null)=>target instanceof HTMLElement&&(target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target.tagName));

export function useShortcuts(){
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      // En presentación manda su propio manejador; al escribir en un campo, el campo. Con una propuesta en vista previa el canvas es de sólo lectura.
      if(viewStore.get().presenting||viewStore.get().staging||typing(e.target))return;
      if(viewStore.get().tutorial||viewStore.get().searchOpen)return;
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
        case 'Escape':return run(()=>{if(viewStore.get().focusMode){setFocusMode(false);return;}if(viewStore.get().tool!=='select'){if(viewStore.get().connectFromId)notify('Unión cancelada.');viewStore.set({tool:'select',connectFromId:null,startMode:'choose'});}else select([]);});
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
