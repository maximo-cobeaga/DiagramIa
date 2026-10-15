'use strict';
// Formulario del plan Empresas (empresas.html y business.html). Envía al gateway (/v1/contact) en el dominio de la app; no usa servicios de terceros.
(()=>{
  const form=document.getElementById('contact-form'),status=document.getElementById('contact-status'),button=document.getElementById('contact-submit');
  if(!form)return;
  // El gateway responde en español: en la página en inglés se muestra el texto propio según el código de error.
  const en=document.documentElement.lang==='en';
  const text=en?{
    invalid:'Check your details: name, work email, company and a message of at least 10 characters.',
    sending:'Sending…',
    thanks:email=>`Thank you! We received your message and will reply to ${email}.`,
    sent:'Message sent',
    RATE_LIMITED:'We already received several messages from your connection. Try again later or email us at mcobeaga@diagramia.app.',
    failed:'We could not send your message. Email us at mcobeaga@diagramia.app.',
    offline:'We could not send your message. Check your connection or email us at mcobeaga@diagramia.app.'
  }:{
    invalid:'Revisá los datos: nombre, email de trabajo, empresa y un mensaje de al menos 10 caracteres.',
    sending:'Enviando…',
    thanks:email=>`¡Gracias! Recibimos tu consulta y te respondemos a ${email}.`,
    sent:'Consulta enviada',
    failed:'No pudimos enviar la consulta. Escribinos a mcobeaga@diagramia.app.',
    offline:'No pudimos enviar la consulta. Revisá tu conexión o escribinos a mcobeaga@diagramia.app.'
  };
  // Mismo criterio que el resto del sitio: en producción la app vive en app.<dominio>; en desarrollo, en el puerto del editor.
  const local=['127.0.0.1','localhost'].includes(location.hostname);
  const app=document.querySelector('meta[name="diagramia-app"]')?.content||(local?'http://127.0.0.1:5173/':`${location.protocol}//app.${location.hostname.replace(/^www\./,'')}/`);
  const endpoint=new URL('api/v1/contact',app).href;
  document.getElementById('contact-privacy').href=new URL(en?'privacy.html':'privacidad.html',app).href;
  const say=(message,tone)=>{status.textContent=message;status.dataset.tone=tone||'';};
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const data=Object.fromEntries(new FormData(form).entries());
    for(const key of Object.keys(data))if(typeof data[key]==='string')data[key]=data[key].trim();
    if(!data.teamSize)delete data.teamSize;
    if(!form.reportValidity()||data.name.length<2||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)||data.company.length<2||data.message.length<10){
      say(text.invalid,'error');return;
    }
    button.disabled=true;say(text.sending);
    try{
      const response=await fetch(endpoint,{method:'POST',mode:'cors',credentials:'omit',signal:AbortSignal.timeout(15000),headers:{'content-type':'application/json','x-diagramia-client':'editor'},body:JSON.stringify(data)});
      const body=await response.json().catch(()=>null);
      if(response.ok&&body?.received===true){
        form.reset();say(text.thanks(data.email),'ok');
        button.textContent=text.sent;return;
      }
      say((en?text[body?.error?.code]:body?.error?.message)||text.failed,'error');
    }catch{
      say(text.offline,'error');
    }
    button.disabled=false;
  });
})();
