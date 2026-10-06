import {documentBounds} from '@diagramia/core';
import {DiagramLayer} from '../canvas/DiagramLayer';
import {useStore} from '../store/createStore';
import {notify} from '../store/documentStore';
import {viewStore} from '../store/viewStore';
import {openTemplate,TEMPLATES} from './templates';

export function askAssistant(){
  viewStore.set({panel:'assistant',sideOpen:true,focusMode:false});
  requestAnimationFrame(()=>{
    const prompt=document.querySelector<HTMLTextAreaElement>('#chat-prompt');
    if(prompt&&!prompt.disabled){prompt.focus();prompt.scrollIntoView({block:'nearest'});}
    else document.querySelector<HTMLButtonElement>('.chat-cta .signin')?.focus();
  });
}
export function startDrawing(){
  viewStore.set({startMode:'draw',tool:'node',template:{kind:'note',shape:'sticky',label:'Mi idea',size:{width:180,height:120},icon:'idea',style:{fill:'#fff3b0',stroke:'#e0cd6a',fontSize:17}}});
  notify('Hacé clic en el lienzo para poner tu primera idea. Después escribí su nombre.');
}
function ExampleCard({index}:{index:number}){
  const template=TEMPLATES[index],bounds=documentBounds(template.doc),pad=24;
  return <button className="start-example" aria-label={`Abrir ejemplo: ${template.label}`} onClick={()=>openTemplate(index)}>
    <svg viewBox={bounds?`${bounds.x-pad} ${bounds.y-pad} ${bounds.width+pad*2} ${bounds.height+pad*2}`:'0 0 640 360'} aria-hidden="true" focusable="false"><DiagramLayer doc={template.doc}/></svg>
    <strong>{template.label}</strong><span>{template.description}</span>
  </button>;
}
/** Inicio dentro del lienzo vacío. No bloquea la app ni modifica documentos existentes. */
export function Welcome(){
  const {startMode,focusMode}=useStore(viewStore);
  if(focusMode)return null;
  if(startMode==='draw')return <div className="drawing-invitation" role="status"><span>Elegí un lugar para tu primera idea.</span><button onClick={()=>viewStore.set({startMode:'choose',tool:'select'})}>Volver al inicio</button></div>;
  return <div className="start-host"><section className="start-guide" aria-label="Empezar una idea">
    <span className="start-spark" aria-hidden="true">✦</span>
    <span className="eyebrow">IDEAS QUE TOMAN FORMA</span>
    <h2>{startMode==='examples'?'Una idea para empezar':'¿Qué querés crear hoy?'}</h2>
    <p>{startMode==='examples'?'Elegí un ejemplo y hacelo tuyo. Todo se puede editar.':'No necesitás saber de diagramas. Empezá como te resulte más cómodo.'}</p>
    {startMode==='examples'?<>
      <div className="start-examples">{[5,6,4].map(index=><ExampleCard index={index} key={index}/>)}</div>
      <details className="more-examples"><summary>También hay ejemplos de tecnología y procesos</summary><div className="start-examples">{[7,0,1,2,3].map(index=><ExampleCard index={index} key={index}/>)}</div></details>
      <button className="quiet" onClick={()=>viewStore.set({startMode:'choose'})}>← Volver</button>
    </>:<>
      <div className="start-choices">
        <button className="start-choice ai-choice" aria-label="Contame tu idea" onClick={askAssistant}><span aria-hidden="true">✦</span><strong>Contame tu idea</strong><small>Escribí lo que imaginás y pedí ayuda a la IA.</small></button>
        <button className="start-choice" aria-label="Dibujar" onClick={startDrawing}><span aria-hidden="true">✎</span><strong>Dibujar</strong><small>Una idea, una flecha y lo que venga después.</small></button>
        <button className="start-choice" aria-label="Elegir un ejemplo" onClick={()=>viewStore.set({startMode:'examples'})}><span aria-hidden="true">▦</span><strong>Elegir un ejemplo</strong><small>Viajes, explicaciones y tareas para hacer tuyas.</small></button>
      </div>
      <p className="start-reassurance">Podés cambiar de idea. Tu trabajo se guarda en este navegador.</p>
    </>}
  </section></div>;
}
