import {selectionUnits} from '@diagramia/core';
import {alignSelection} from '../commands';
import {documentStore} from '../store/documentStore';
import {useStore} from '../store/createStore';
import {selectionStore} from '../store/selectionStore';

export function ArrangeSelection(){
  const {doc}=useStore(documentStore),{ids}=useStore(selectionStore),count=selectionUnits(doc,ids).length;
  return <div className="arrange-selection" aria-label="Acomodar selección">
    <span>Alinear {count} piezas</span>
    <div>{([['left','Izquierda'],['center','Centro'],['right','Derecha'],['top','Arriba'],['middle','Medio'],['bottom','Abajo']] as const).map(([mode,label])=><button key={mode} disabled={count<2} onClick={()=>alignSelection(mode)}>{label}</button>)}</div>
    <span>Separación uniforme</span>
    <div><button disabled={count<3} onClick={()=>alignSelection('horizontal')}>Horizontal</button><button disabled={count<3} onClick={()=>alignSelection('vertical')}>Vertical</button></div>
    {count<2&&<small>Seleccioná otra pieza para alinearlas. Los grupos se acomodan completos.</small>}
  </div>;
}
