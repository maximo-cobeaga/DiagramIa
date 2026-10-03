import {useRef} from 'react';
import {viewStore} from '../store/viewStore';

/** La altura sólo pertenece a la interfaz. El borde se opera con mouse, táctil o teclado. */
export function ResizeHandle({height}:{height:number}){
  const drag=useRef<{y:number;height:number;limit:number}|null>(null);
  const resize=(next:number,limit:number)=>viewStore.set({timelineHeight:Math.max(180,Math.min(limit,next))});
  const collapse=()=>{viewStore.set({timelineOpen:false});requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('.edit-motion')?.focus());};
  return <div className="timeline-resize" role="separator" tabIndex={0} aria-label="Altura del panel de animación" aria-orientation="horizontal" aria-valuemin={180} aria-valuemax={520} aria-valuenow={height}
    title="Arrastrá hacia abajo para dar más espacio al lienzo. También podés usar las flechas del teclado."
    onPointerDown={e=>{if(e.button!==0)return;const surface=e.currentTarget.closest('.surface');drag.current={y:e.clientY,height,limit:Math.min(520,Math.max(180,(surface?.clientHeight??600)*.55))};e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();}}
    onPointerMove={e=>{const start=drag.current;if(start)resize(start.height+start.y-e.clientY,start.limit);}}
    onPointerUp={e=>{const start=drag.current;drag.current=null;if(start&&start.height+start.y-e.clientY<120)collapse();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
    onPointerCancel={()=>{drag.current=null;}}
    onKeyDown={e=>{if(!['ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();if(e.key==='End'){collapse();return;}const limit=Math.min(520,Math.max(180,(e.currentTarget.closest('.surface')?.clientHeight??600)*.55));resize(e.key==='Home'?300:height+(e.key==='ArrowUp'?32:-32),limit);}}><span aria-hidden="true"/></div>;
}
