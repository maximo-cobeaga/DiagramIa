'use strict';
// Lo imprescindible de la landing (ADR 094): que los botones lleven al editor. Vive en su propio archivo y se carga primero,
// para que una falla en la medición, la oferta o las animaciones nunca deje un «Crear diagrama» que no hace nada.
// telemetry.js vuelve a escribir estas direcciones con el ID anónimo y la campaña cuando puede.
(()=>{
  try{
    const app=document.querySelector('meta[name="diagramia-app"]')?.content;
    if(!app)return;
    const base=new URL(app,location.href);
    for(const link of document.querySelectorAll('[data-cta],[data-app-path]'))link.href=new URL(link.dataset.appPath||'',base).href;
  }catch{/* sin URL válida, los enlaces quedan como están en el HTML */}
})();
