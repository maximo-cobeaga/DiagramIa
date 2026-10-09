'use strict';
// Formulario del plan Empresas. Envía al gateway (/v1/contact) en el dominio de la app; no usa servicios de terceros.
(()=>{
  const form=document.getElementById('contact-form'),status=document.getElementById('contact-status'),button=document.getElementById('contact-submit');
  if(!form)return;
  // Mismo criterio que el resto del sitio: en producción la app vive en app.<dominio>; en desarrollo, en el puerto del editor.
  const local=['127.0.0.1','localhost'].includes(location.hostname);
  const app=document.querySelector('meta[name="diagramia-app"]')?.content||(local?'http://127.0.0.1:5173/':`${location.protocol}//app.${location.hostname.replace(/^www\./,'')}/`);
  const endpoint=new URL('api/v1/contact',app).href;
  document.getElementById('contact-privacy').href=new URL('privacidad.html',app).href;
  const say=(text,tone)=>{status.textContent=text;status.dataset.tone=tone||'';};
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const data=Object.fromEntries(new FormData(form).entries());
    for(const key of Object.keys(data))if(typeof data[key]==='string')data[key]=data[key].trim();
    if(!data.teamSize)delete data.teamSize;
    if(!form.reportValidity()||data.name.length<2||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)||data.company.length<2||data.message.length<10){
      say('Revisá los datos: nombre, email de trabajo, empresa y un mensaje de al menos 10 caracteres.','error');return;
    }
    button.disabled=true;say('Enviando…');
    try{
      const response=await fetch(endpoint,{method:'POST',mode:'cors',credentials:'omit',signal:AbortSignal.timeout(15000),headers:{'content-type':'application/json','x-diagramia-client':'editor'},body:JSON.stringify(data)});
      const body=await response.json().catch(()=>null);
      if(response.ok&&body?.received===true){
        form.reset();say(`¡Gracias! Recibimos tu consulta y te respondemos a ${data.email}.`,'ok');
        button.textContent='Consulta enviada';return;
      }
      say(body?.error?.message||'No pudimos enviar la consulta. Escribinos a mcobeaga@diagramia.app.','error');
    }catch{
      say('No pudimos enviar la consulta. Revisá tu conexión o escribinos a mcobeaga@diagramia.app.','error');
    }
    button.disabled=false;
  });
})();
