import {openDocument} from '@diagramia/core';
import architecture from '../../../../examples/architecture.diagramia.json';
import success from '../../../../examples/checkout-success.diagramia.json';
import failure from '../../../../examples/checkout-failure.diagramia.json';
import login from '../../../../examples/login.diagramia.json';
import idea from '../../../../examples/explain-idea.diagramia.json';
import task from '../../../../examples/plan-task.diagramia.json';
import {addTab} from '../store/documentStore';
import {playbackStore} from '../store/playbackStore';
import {viewStore} from '../store/viewStore';
import {track} from '../telemetry';
import {localizeContent} from '../content.en';
import {t} from '../i18n';

const sources=[
  [t('Arquitectura SaaS'),t('Un sistema conectado, explicado por partes.'),architecture,'saas-architecture'],
  [t('Compra confirmada'),t('Un pedido, desde la compra hasta la entrega.'),success,'checkout-success'],
  [t('Rechazo y recuperación'),t('Distintas maneras de continuar un proceso.'),failure,'checkout-failure'],
  [t('Inicio de sesión'),t('Un ejemplo técnico con efectos sincronizados.'),login,'login'],
  [t('Explicar una idea'),t('Qué querés hacer, a quién ayuda y cómo empezar.'),idea,'explain-idea'],
  [t('Planificar una tarea'),t('Un objetivo, lo necesario y tus próximos pasos.'),task,'plan-task']
] as const;
export const TEMPLATES=sources.map(([label,description,source,slug])=>({label,description,doc:localizeContent(openDocument(source).document),slug}));
/** Los ejemplos se abren como documentos reales en otra pestaña, sin reemplazar el trabajo actual. */
export function openTemplate(index:number){
  const template=TEMPLATES[index];if(!template)return false;
  if(!addTab({...template.doc,appliedBatches:[]}))return false;
  playbackStore.set({animationId:'',scenarioId:'',time:0,playing:false});
  viewStore.set({startMode:'choose',tool:'select'});
  track('template_used',{template:template.slug});return true;
}
