import {useEffect,useRef,useState} from 'react';
import {viewStore} from '../store/viewStore';
import {t} from '../i18n';

const SEEN='diagramia.tutorial.seen';
export const tutorialSeen=()=>{try{return localStorage.getItem(SEEN)==='1';}catch{return true;}};
const STEPS:{title:string;body:string;tips:string[]}[]=[
  {title:t('Bienvenido a Diagramia'),body:t('Un lienzo para darle forma a tus ideas. Podés dibujar, escribir y pedirle ayuda a la IA.'),tips:[t('Arriba están las pestañas: cada una es un diagrama independiente.'),t('Tu trabajo se guarda solo en este navegador. Exportá el JSON para tener una copia.')]},
  {title:t('Dibujá con la paleta'),body:t('A la izquierda hay formas de arquitectura, básicas, de flujo y UML.'),tips:[t('Hacé clic en una forma y después en el canvas, o arrastrala.'),t('Doble clic sobre cualquier elemento para escribir su texto en el lugar.'),t('En Propiedades cambiás forma, colores, borde, letra y tamaño.')]},
  {title:t('Conectá'),body:t('Con el Conector (tecla C) arrastrás de un elemento a otro.'),tips:[t('Si soltás cerca del borde, la flecha queda enganchada en ese punto exacto.'),t('Seleccioná una flecha para arrastrar sus extremos o correr sus tramos.'),t('En Propiedades elegís recta, curva o en ángulos, y las puntas.')]},
  {title:t('Pedile a la IA'),body:t('En el panel de la derecha escribís lo que querés: «creá un diagrama de login», «agregá una caché debajo de la API».'),tips:[t('La propuesta se dibuja resaltada en el canvas y no se aplica hasta que la aceptes.'),t('Podés verla paso a paso, rechazarla o pedir otra.'),t('Toda propuesta se ordena sola para que nada quede encimado.')]},
  {title:t('Organizá'),body:t('Zonas para agrupar por área, encuadres y pestañas para separar diagramas.'),tips:[t('«Buscar» encuentra una idea por nombre o detalle y te lleva hasta ella. «Volver» recupera tu vista anterior.'),t('Seleccioná varias piezas y usá «Acomodar» o «Agrupar». «Ver selección» te acerca.'),t('El botón del borde derecho abre y cierra el panel lateral.')]},
  {title:t('Dale movimiento'),body:t('Abajo tenés un reproductor pequeño. Tocá Reproducir para contar tu idea paso a paso.'),tips:[t('«Editar pasos» abre los textos, la duración en segundos y la cámara.'),t('«Bajar panel» o arrastrar su borde hacia abajo te devuelve espacio para dibujar.'),t('«Presentar» abre tu recorrido a pantalla completa. Esc vuelve al editor.')]}
];

/** Recorrido opcional en un modal, abierto desde la ayuda del encabezado. */
export function Tutorial(){
  const [step,setStep]=useState(0),nextRef=useRef<HTMLButtonElement>(null),lastStep=step===STEPS.length-1,current=STEPS[step];
  const close=()=>{try{localStorage.setItem(SEEN,'1');}catch{/* se vuelve a mostrar la próxima vez */}viewStore.set({tutorial:false});};
  useEffect(()=>{nextRef.current?.focus();},[step]);
  return <div className="modal-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget)close();}}>
    <div className="modal tutorial" role="dialog" aria-modal="true" aria-labelledby="tutorial-title" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();close();}if(e.key==='ArrowRight'&&!lastStep)setStep(step+1);if(e.key==='ArrowLeft'&&step>0)setStep(step-1);}}>
      <span className="eyebrow">{t('TUTORIAL ·')} {step+1} {t('DE')} {STEPS.length}</span>
      <h2 id="tutorial-title">{current.title}</h2>
      <p>{current.body}</p>
      <ul>{current.tips.map(tip=><li key={tip}>{tip}</li>)}</ul>
      <div className="dots" aria-hidden="true">{STEPS.map((_,i)=><span key={i} className={i===step?'on':''}/>)}</div>
      <div className="modal-actions">
        <button className="quiet" onClick={close}>{t('Saltar')}</button>
        <button disabled={step===0} onClick={()=>setStep(step-1)}>{t('Atrás')}</button>
        <button ref={nextRef} className="primary" onClick={()=>lastStep?close():setStep(step+1)}>{lastStep?t('Empezar'):t('Siguiente')}</button>
      </div>
    </div>
  </div>;
}
