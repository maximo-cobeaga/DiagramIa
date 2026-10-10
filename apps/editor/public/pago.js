'use strict';
// Página de pago (ADR 094). El servidor crea la transacción con el precio, la cuenta y el descuento; acá sólo se abre.
// Nada de lo que decide el cobro viene de esta página: del navegador sólo sale el ID de la transacción que Paddle puso en la URL.
(async()=>{
  const status=document.getElementById('status'),back=document.getElementById('back');
  const say=(text,tone)=>{status.textContent=text;status.dataset.tone=tone||'';};
  const home=result=>location.replace('/?pro='+result);
  const transactionId=new URLSearchParams(location.search).get('_ptxn');
  if(!transactionId||!/^txn_[a-z0-9]{20,40}$/.test(transactionId)){
    say('Este enlace de pago no es válido o ya venció. Volvé a Diagramia y tocá «Pasar a Pro» otra vez.','warn');back.textContent='Volver a Diagramia';return;
  }
  let config;
  try{
    const response=await fetch('/api/v1/billing/config',{headers:{'x-diagramia-client':'editor'}});
    if(!response.ok)throw new Error(String(response.status));
    config=await response.json();
    if(typeof config.clientToken!=='string'||!['sandbox','live'].includes(config.env))throw new Error('config');
  }catch{say('No pudimos preparar el pago. No se hizo ningún cobro. Probá de nuevo en unos minutos.','warn');return;}

  const script=document.createElement('script');
  script.src='https://cdn.paddle.com/paddle/v2/paddle.js';
  script.onerror=()=>say('No se pudo cargar el pago seguro de Paddle. Revisá tu conexión o desactivá el bloqueador para esta página. No se hizo ningún cobro.','warn');
  script.onload=()=>{
    const Paddle=window.Paddle;
    if(!Paddle){script.onerror();return;}
    let paid=false;
    try{
      if(config.env==='sandbox')Paddle.Environment.set('sandbox');
      Paddle.Initialize({
        token:config.clientToken,
        checkout:{settings:{displayMode:'overlay',locale:'es',successUrl:location.origin+'/?pro=ok'}},
        eventCallback(event){
          if(!event||typeof event.name!=='string')return;
          if(event.name==='checkout.loaded')say(config.env==='sandbox'?'Modo de prueba: no se cobra dinero real.':'');
          else if(event.name==='checkout.completed'){paid=true;say('¡Pago recibido! Volviendo a Diagramia…');back.hidden=true;setTimeout(()=>home('ok'),2500);}
          else if(event.name==='checkout.closed')home(paid?'ok':'cancel');
          else if(event.name==='checkout.error')say('El pago no se pudo completar. No se hizo ningún cobro. Podés volver a intentarlo desde Diagramia.','warn');
        }
      });
      // Explícito, para no depender de la apertura automática por el parámetro de la URL.
      Paddle.Checkout.open({transactionId});
    }catch{say('No se pudo abrir el pago. No se hizo ningún cobro. Volvé a Diagramia e intentá de nuevo.','warn');}
  };
  document.head.appendChild(script);
})();
