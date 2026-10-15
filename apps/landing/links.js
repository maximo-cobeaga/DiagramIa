'use strict';
// Lo imprescindible de la landing (ADR 094): que los botones lleven al editor. Vive en su propio archivo y se carga primero,
// para que una falla en la medición, la oferta o las animaciones nunca deje un «Crear diagrama» que no hace nada.
// telemetry.js vuelve a escribir estas direcciones con el ID anónimo y la campaña cuando puede.
(()=>{
  try{
    const app=document.querySelector('meta[name="diagramia-app"]')?.content;
    if(!app)return;
    const base=new URL(app,location.href);
    // El editor vive en otro origen y no ve el idioma guardado acá: se lo pasa la dirección.
    const lang=document.documentElement.lang==='es'?'es':'en';
    for(const link of document.querySelectorAll('[data-cta],[data-app-path]')){const target=new URL(link.dataset.appPath||'',base);if(!/\.html$/.test(target.pathname))target.searchParams.set('lang',lang);link.href=target.href;}
  }catch{/* sin URL válida, los enlaces quedan como están en el HTML */}
})();
