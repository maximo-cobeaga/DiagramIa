import {selectionUnits} from '@diagramia/core';
import {alignSelection} from '../commands';
import {documentStore} from '../store/documentStore';
import {useStore} from '../store/createStore';
import {selectionStore} from '../store/selectionStore';
import {t} from '../i18n';

export function ArrangeSelection(){
  const {doc}=useStore(documentStore),{ids}=useStore(selectionStore),count=selectionUnits(doc,ids).length;
  return <div className="arrange-selection" aria-label={t('Acomodar selección')}>
    <span>{t('Alinear')} {count} {t('piezas')}</span>
    <div>{([['left',t('Izquierda')],['center',t('Centro')],['right',t('Derecha')],['top',t('Arriba')],['middle',t('Medio')],['bottom',t('Abajo')]] as const).map(([mode,label])=><button key={mode} disabled={count<2} onClick={()=>alignSelection(mode)}>{label}</button>)}</div>
    <span>{t('Separación uniforme')}</span>
    <div><button disabled={count<3} onClick={()=>alignSelection('horizontal')}>{t('Horizontal')}</button><button disabled={count<3} onClick={()=>alignSelection('vertical')}>{t('Vertical')}</button></div>
    {count<2&&<small>{t('Seleccioná otra pieza para alinearlas. Los grupos se acomodan completos.')}</small>}
  </div>;
}
