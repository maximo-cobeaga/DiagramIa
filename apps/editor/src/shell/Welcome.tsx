import {documentBounds} from '@diagramia/core';
import {DiagramLayer} from '../canvas/DiagramLayer';
import {useStore} from '../store/createStore';
import {notify} from '../store/documentStore';
import {viewStore} from '../store/viewStore';
import {track} from '../telemetry';
import {openTemplate,TEMPLATES} from './templates';
import {t} from '../i18n';

export function askAssistant(){
  track('welcome_choice',{choice:'ai'});
  viewStore.set({panel:'assistant',sideOpen:true,focusMode:false});
  requestAnimationFrame(()=>{
    const prompt=document.querySelector<HTMLTextAreaElement>('#chat-prompt');
    if(prompt&&!prompt.disabled){prompt.focus();prompt.scrollIntoView({block:'nearest'});}
    else document.querySelector<HTMLButtonElement>('.chat-cta .signin')?.focus();
  });
}
export function startDrawing(){
  track('welcome_choice',{choice:'draw'});
  viewStore.set({startMode:'draw',tool:'node',template:{kind:'note',shape:'sticky',label:t('Mi idea'),size:{width:180,height:120},icon:'idea',style:{fill:'#fff3b0',stroke:'#e0cd6a',fontSize:17}}});
  notify(t('Hacé clic en el lienzo para poner tu primera idea. Después escribí su nombre.'));
}
function ExampleCard({index}:{index:number}){
  const template=TEMPLATES[index],bounds=documentBounds(template.doc),pad=24;
  return <button className="start-example" aria-label={t('Abrir ejemplo: {0}',template.label)} onClick={()=>openTemplate(index)}>
    <svg viewBox={bounds?`${bounds.x-pad} ${bounds.y-pad} ${bounds.width+pad*2} ${bounds.height+pad*2}`:'0 0 640 360'} aria-hidden="true" focusable="false"><DiagramLayer doc={template.doc}/></svg>
    <strong>{template.label}</strong><span>{template.description}</span>
  </button>;
}
/** Inicio dentro del lienzo vacío. No bloquea la app ni modifica documentos existentes. */
export function Welcome(){
  const {startMode,focusMode}=useStore(viewStore);
  if(focusMode)return null;
  if(startMode==='draw')return <div className="drawing-invitation" role="status"><span>{t('Elegí un lugar para tu primera idea.')}</span><button onClick={()=>viewStore.set({startMode:'choose',tool:'select'})}>{t('Volver al inicio')}</button></div>;
  return <div className="start-host"><section className="start-guide" aria-label={t('Empezar una idea')}>
    <span className="start-spark" aria-hidden="true">✦</span>
    <span className="eyebrow">{t('IDEAS QUE TOMAN FORMA')}</span>
    <h2>{startMode==='examples'?t('Una idea para empezar'):t('¿Qué querés crear hoy?')}</h2>
    <p>{startMode==='examples'?t('Elegí un ejemplo y hacelo tuyo. Todo se puede editar.'):t('No necesitás saber de diagramas. Empezá como te resulte más cómodo.')}</p>
    {startMode==='examples'?<>
      <div className="start-examples">{[4,5,1].map(index=><ExampleCard index={index} key={index}/>)}</div>
      <details className="more-examples"><summary>{t('También hay ejemplos de tecnología y procesos')}</summary><div className="start-examples">{[0,2,3].map(index=><ExampleCard index={index} key={index}/>)}</div></details>
      <button className="quiet" onClick={()=>viewStore.set({startMode:'choose'})}>{t('← Volver')}</button>
    </>:<>
      <div className="start-choices">
        <button className="start-choice ai-choice" aria-label={t('Contame tu idea')} onClick={askAssistant}><span aria-hidden="true">✦</span><strong>{t('Contame tu idea')}</strong><small>{t('Escribí lo que imaginás y pedí ayuda a la IA.')}</small></button>
        <button className="start-choice" aria-label={t('Dibujar')} onClick={startDrawing}><span aria-hidden="true">✎</span><strong>{t('Dibujar')}</strong><small>{t('Una idea, una flecha y lo que venga después.')}</small></button>
        <button className="start-choice" aria-label={t('Elegir un ejemplo')} onClick={()=>{track('welcome_choice',{choice:'examples'});viewStore.set({startMode:'examples'});}}><span aria-hidden="true">▦</span><strong>{t('Elegir un ejemplo')}</strong><small>{t('Viajes, explicaciones y tareas para hacer tuyas.')}</small></button>
      </div>
      <p className="start-reassurance">{t('Podés cambiar de idea. Tu trabajo se guarda en este navegador.')}</p>
    </>}
  </section></div>;
}
