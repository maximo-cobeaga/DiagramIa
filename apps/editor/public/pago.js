'use strict';
// Página de pago (ADR 094). El servidor crea la transacción con el precio, la cuenta y el descuento; acá sólo se abre.
// Nada de lo que decide el cobro viene de esta página: del navegador sólo sale el ID de la transacción que Paddle puso en la URL.
(async()=>{
  // Mismo idioma que el editor (ADR 105): el que la persona eligió ahí o, si no eligió, el de su navegador.
  const lang=(()=>{try{const saved=localStorage.getItem('diagramia.language');if(saved==='es'||saved==='en')return saved;}catch{/* sin almacenamiento */}return (navigator.language||'').toLowerCase().startsWith('es')?'es':'en';})();
  const TEXT={
    es:{title:'Pago seguro · Diagramia',kicker:'TU PRÓXIMA GRAN IDEA EMPIEZA ACÁ',heading:['Más espacio.','Más posibilidades.'],steps:['01 · Elegís Pro','02 · Pago seguro','03 · A crear'],stepsLabel:'Pasos del pago',
      preparing:'Preparando el pago…',back:'Volver a Diagramia sin pagar',backPlain:'Volver a Diagramia',note:'El cobro lo procesa Paddle. Diagramia nunca ve los datos de tu tarjeta.',help:'¿Necesitás ayuda con el pago?',helpSubject:'Ayuda con el pago',
      invalid:'Este enlace de pago no es válido o ya venció. Volvé a Diagramia y tocá «Pasar a Pro» otra vez.',unprepared:'No pudimos preparar el pago. No se hizo ningún cobro. Probá de nuevo en unos minutos.',
      blocked:'No se pudo cargar el pago seguro de Paddle. Revisá tu conexión o desactivá el bloqueador para esta página. No se hizo ningún cobro.',test:'Modo de prueba: no se cobra dinero real.',
      paid:'¡Pago recibido! Volviendo a Diagramia…',failed:'El pago no se pudo completar. No se hizo ningún cobro. Podés volver a intentarlo desde Diagramia.',unopened:'No se pudo abrir el pago. No se hizo ningún cobro. Volvé a Diagramia e intentá de nuevo.'},
    en:{title:'Secure payment · Diagramia',kicker:'YOUR NEXT BIG IDEA STARTS HERE',heading:['More space.','More possibilities.'],steps:['01 · You choose Pro','02 · Secure payment','03 · Start creating'],stepsLabel:'Payment steps',
      preparing:'Preparing the payment…',back:'Back to Diagramia without paying',backPlain:'Back to Diagramia',note:'Paddle processes the payment. Diagramia never sees your card details.',help:'Need help with the payment?',helpSubject:'Help with the payment',
      invalid:'This payment link is not valid or has expired. Go back to Diagramia and press «Go Pro» again.',unprepared:'We could not prepare the payment. No charge was made. Try again in a few minutes.',
      blocked:'Paddle\'s secure checkout could not be loaded. Check your connection or turn off your blocker for this page. No charge was made.',test:'Test mode: no real money is charged.',
      paid:'Payment received! Going back to Diagramia…',failed:'The payment could not be completed. No charge was made. You can try again from Diagramia.',unopened:'The payment could not be opened. No charge was made. Go back to Diagramia and try again.'}
  }[lang];
  const status=document.getElementById('status'),back=document.getElementById('back');
  const say=(text,tone)=>{status.textContent=text;status.dataset.tone=tone||'';};
  // Los textos fijos de la página, en el idioma elegido. Sin este script queda el español del HTML.
  try{
    document.documentElement.lang=lang;document.title=TEXT.title;
    const set=(selector,text)=>{const element=document.querySelector(selector);if(element)element.textContent=text;};
    set('.payment-kicker',TEXT.kicker);set('main small',TEXT.note);set('.payment-help',TEXT.help);status.textContent=TEXT.preparing;back.textContent=TEXT.back;
    const heading=document.querySelector('main h1');if(heading)heading.replaceChildren(TEXT.heading[0],document.createElement('br'),TEXT.heading[1]);
    const steps=document.querySelector('.payment-steps');if(steps){steps.setAttribute('aria-label',TEXT.stepsLabel);[...steps.children].forEach((step,i)=>{if(TEXT.steps[i])step.textContent=TEXT.steps[i];});}
    const help=document.querySelector('.payment-help');if(help)help.href='mailto:mcobeaga@diagramia.app?subject='+encodeURIComponent(TEXT.helpSubject);
  }catch{/* la página sigue siendo usable con el texto original */}
  const home=result=>location.replace('/?pro='+result);
  const transactionId=new URLSearchParams(location.search).get('_ptxn');
  if(!transactionId||!/^txn_[a-z0-9]{20,40}$/.test(transactionId)){
    say(TEXT.invalid,'warn');back.textContent=TEXT.backPlain;return;
  }
  let config;
  try{
    const response=await fetch('/api/v1/billing/config',{headers:{'x-diagramia-client':'editor'}});
    if(!response.ok)throw new Error(String(response.status));
    config=await response.json();
    if(typeof config.clientToken!=='string'||!['sandbox','live'].includes(config.env))throw new Error('config');
  }catch{say(TEXT.unprepared,'warn');return;}

  const script=document.createElement('script');
  script.src='https://cdn.paddle.com/paddle/v2/paddle.js';
  script.onerror=()=>say(TEXT.blocked,'warn');
  script.onload=()=>{
    const Paddle=window.Paddle;
    if(!Paddle){script.onerror();return;}
    let paid=false;
    try{
      if(config.env==='sandbox')Paddle.Environment.set('sandbox');
      Paddle.Initialize({
        token:config.clientToken,
        checkout:{settings:{displayMode:'overlay',locale:lang,successUrl:location.origin+'/?pro=ok'}},
        eventCallback(event){
          if(!event||typeof event.name!=='string')return;
          if(event.name==='checkout.loaded')say(config.env==='sandbox'?TEXT.test:'');
          else if(event.name==='checkout.completed'){paid=true;say(TEXT.paid);back.hidden=true;setTimeout(()=>home('ok'),2500);}
          else if(event.name==='checkout.closed')home(paid?'ok':'cancel');
          else if(event.name==='checkout.error')say(TEXT.failed,'warn');
        }
      });
      // Explícito, para no depender de la apertura automática por el parámetro de la URL.
      Paddle.Checkout.open({transactionId});
    }catch{say(TEXT.unopened,'warn');}
  };
  document.head.appendChild(script);
})();
