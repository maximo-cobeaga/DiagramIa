import {useEffect,useRef,useState} from 'react';
import {viewStore} from '../store/viewStore';

const SEEN='diagramia.tutorial.seen';
export const tutorialSeen=()=>{try{return localStorage.getItem(SEEN)==='1';}catch{return true;}};
const STEPS:{title:string;body:string;tips:string[]}[]=[
  {title:'Bienvenido a Diagramia',body:'Un canvas donde vos y la IA editan el mismo diagrama. Todo lo que ves es editable y nada se superpone.',tips:['Arriba están las pestañas: cada una es un diagrama independiente.','Tu trabajo se guarda solo en este navegador. Exportá el JSON para tener una copia.']},
  {title:'Dibujá con la paleta',body:'A la izquierda hay formas de arquitectura, básicas, de flujo y UML.',tips:['Hacé clic en una forma y después en el canvas, o arrastrala.','Doble clic sobre cualquier elemento para escribir su texto en el lugar.','En Propiedades cambiás forma, colores, borde, letra y tamaño.']},
  {title:'Conectá',body:'Con el Conector (tecla C) arrastrás de un elemento a otro.',tips:['Si soltás cerca del borde, la flecha queda enganchada en ese punto exacto.','Seleccioná una flecha para arrastrar sus extremos o correr sus tramos.','En Propiedades elegís recta, curva o en ángulos, y las puntas.']},
  {title:'Pedile a la IA',body:'En el panel de la derecha escribís lo que querés: «creá un diagrama de login», «agregá una caché debajo de la API».',tips:['La propuesta se dibuja resaltada en el canvas y no se aplica hasta que la aceptes.','Podés verla paso a paso, rechazarla o pedir otra.','Toda propuesta se ordena sola para que nada quede encimado.']},
  {title:'Organizá',body:'Zonas para agrupar por área, frames para encuadrar y pestañas para separar diagramas.',tips:['«Ordenar todo sin superposiciones» reacomoda el diagrama completo.','Con varios nodos seleccionados podés alinear, distribuir y agrupar.','El botón del borde derecho abre y cierra el panel lateral.']},
  {title:'Animá y presentá',body:'La timeline de abajo muestra recorridos paso a paso, con ramas y estados.',tips:['«Recorrido auto» genera los pasos siguiendo las flechas.','«Presentar» abre el modo presentación (Esc para salir).','La lista completa de atajos está en la pestaña Sesión. Este tutorial se reabre con el botón «?».']}
];

/** Recorrido rápido en un modal. Se muestra la primera vez y se reabre desde el encabezado. */
export function Tutorial(){
  const [step,setStep]=useState(0),nextRef=useRef<HTMLButtonElement>(null),lastStep=step===STEPS.length-1,current=STEPS[step];
  const close=()=>{try{localStorage.setItem(SEEN,'1');}catch{/* se vuelve a mostrar la próxima vez */}viewStore.set({tutorial:false});};
  useEffect(()=>{nextRef.current?.focus();},[step]);
  return <div className="modal-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget)close();}}>
    <div className="modal tutorial" role="dialog" aria-modal="true" aria-labelledby="tutorial-title" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();close();}if(e.key==='ArrowRight'&&!lastStep)setStep(step+1);if(e.key==='ArrowLeft'&&step>0)setStep(step-1);}}>
      <span className="eyebrow">TUTORIAL · {step+1} DE {STEPS.length}</span>
      <h2 id="tutorial-title">{current.title}</h2>
      <p>{current.body}</p>
      <ul>{current.tips.map(tip=><li key={tip}>{tip}</li>)}</ul>
      <div className="dots" aria-hidden="true">{STEPS.map((_,i)=><span key={i} className={i===step?'on':''}/>)}</div>
      <div className="modal-actions">
        <button className="quiet" onClick={close}>Saltar</button>
        <button disabled={step===0} onClick={()=>setStep(step-1)}>Atrás</button>
        <button ref={nextRef} className="primary" onClick={()=>lastStep?close():setStep(step+1)}>{lastStep?'Empezar':'Siguiente'}</button>
      </div>
    </div>
  </div>;
}
