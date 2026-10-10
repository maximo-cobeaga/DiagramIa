'use strict';
// Rampa landing → canvas (ADR 046). Mide la visita y el clic en «Crear diagrama» y pasa el ID anónimo al editor
// para unir el embudo. Nunca envía texto de la página ni datos personales. Respeta Do Not Track y GPC.
// El contrato de eventos vive en packages/core/src/telemetry.ts: el gateway valida cada lote contra él.
(()=>{
  const meta=name=>document.querySelector(`meta[name="${name}"]`)?.content||'';
  const app=meta('diagramia-app'),endpoint=meta('diagramia-events');
  const optOut=navigator.globalPrivacyControl===true||navigator.doNotTrack==='1'||window.doNotTrack==='1';
  const uuid=()=>crypto.randomUUID?crypto.randomUUID():'10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const stored=(store,key)=>{try{const value=store.getItem(key);if(UUID.test(value||''))return value;const fresh=uuid();store.setItem(key,fresh);return fresh;}catch{return uuid();}};
  const enabled=!optOut&&Boolean(endpoint),anonymousId=enabled?stored(localStorage,'diagramia.aid'):null,sessionId=enabled?stored(sessionStorage,'diagramia.sid.landing'):null;
  const params=new URLSearchParams(location.search),utm=['utm_source','utm_medium','utm_campaign'];
  // Misma normalización que toSlug en el core: un valor que no queda como slug se descarta.
  const slug=value=>{const s=(value||'').trim().replace(/\s+/g,'-').replace(/[^a-zA-Z0-9._-]/g,'').replace(/^[._-]+/,'').slice(0,64);return s?s:null;};
  // Misma regla gruesa que describeAgent en el core: dispositivo, navegador y sistema; nada más del user agent.
  const ua=navigator.userAgent.toLowerCase(),touch=navigator.maxTouchPoints>0;
  const os=/iphone|ipad|ipod/.test(ua)||(/macintosh/.test(ua)&&touch)?'ios':/android/.test(ua)?'android':/windows/.test(ua)?'windows':/mac os|macintosh/.test(ua)?'macos':/linux|cros/.test(ua)?'linux':'other';
  const browser=/edg\//.test(ua)?'edge':/firefox|fxios/.test(ua)?'firefox':/chrome|crios|chromium/.test(ua)?'chrome':/safari/.test(ua)?'safari':'other';
  const device=/ipad|tablet/.test(ua)||(os==='android'&&!/mobile/.test(ua))||(os==='ios'&&!/iphone|ipod/.test(ua))?'tablet':/mobi|iphone|ipod/.test(ua)||innerWidth<600?'mobile':'desktop';
  let referrerHost=null;try{const host=new URL(document.referrer).hostname.toLowerCase();if(host!==location.hostname)referrerHost=host;}catch{}
  const context={app:'landing',appVersion:'landing-1',utmSource:slug(params.get('utm_source')),utmMedium:slug(params.get('utm_medium')),utmCampaign:slug(params.get('utm_campaign')),
    referrerHost,landingPath:/^\/[a-zA-Z0-9._~/-]{0,199}$/.test(location.pathname)?location.pathname:null,device,browser,os,
    language:/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})?$/.test(navigator.language)?navigator.language:null,viewport:{width:Math.round(innerWidth),height:Math.round(innerHeight)}};
  const send=(name,props)=>{
    if(!enabled)return Promise.resolve();
    return fetch(endpoint,{method:'POST',mode:'cors',credentials:'omit',keepalive:true,headers:{'content-type':'application/json','x-diagramia-client':'editor'},
      body:JSON.stringify({v:1,anonymousId,sessionId,context,events:[{id:uuid(),name,at:new Date().toISOString(),props}]})}).catch(()=>{});
  };
  // Los botones llevan al editor con el ID anónimo y la campaña; sin URL configurada quedan como estaban.
  for(const link of document.querySelectorAll('[data-cta]')){
    if(!app)continue;
    const target=new URL(app,location.href);
    if(enabled){target.searchParams.set('aid',anonymousId);target.searchParams.set('sid',sessionId);}
    for(const key of utm)if(params.get(key))target.searchParams.set(key,params.get(key));
    link.href=target.href;
    link.addEventListener('click',event=>{
      if(!enabled||event.metaKey||event.ctrlKey||event.shiftKey||event.button!==0)return void send('landing_cta_clicked',{placement:link.dataset.cta});
      event.preventDefault();
      // Se espera el envío un instante como máximo: el usuario nunca queda trabado por la medición.
      Promise.race([send('landing_cta_clicked',{placement:link.dataset.cta}),new Promise(resolve=>setTimeout(resolve,300))]).then(()=>location.assign(link.href));
    });
  }
  // Páginas que viven en el editor (privacidad, plan Pro): mismo origen que la app. Llevan el ID anónimo y la campaña para no cortar el embudo.
  if(app)for(const link of document.querySelectorAll('[data-app-path]')){
    const target=new URL(link.dataset.appPath,new URL(app,location.href));
    if(enabled&&link.dataset.track){target.searchParams.set('aid',anonymousId);target.searchParams.set('sid',sessionId);}
    if(link.dataset.track)for(const key of utm)if(params.get(key))target.searchParams.set(key,params.get(key));
    link.href=target.href;
  }
  // Botones de precios: se mide el clic con el mismo margen de 300 ms que los CTA principales.
  // Desde acá todo es opcional y cada parte se aísla: una falla en una no afecta a las otras ni a los enlaces.
  const safely=run=>{try{run();}catch{/* la landing sigue funcionando sin esta parte */}};
  safely(()=>{for(const link of document.querySelectorAll('[data-track]')){
    link.addEventListener('click',event=>{
      const placement=link.dataset.track;
      if(!enabled||event.metaKey||event.ctrlKey||event.shiftKey||event.button!==0||link.target==='_blank')return void send('landing_cta_clicked',{placement});
      event.preventDefault();
      Promise.race([send('landing_cta_clicked',{placement}),new Promise(resolve=>setTimeout(resolve,300))]).then(()=>location.assign(link.href));
    });
  }});
  // Recorrido: cada sección vista una vez por visita y la profundidad de lectura en cuartos. Ni texto ni posiciones exactas.
  if(enabled)safely(()=>{
    const SECTIONS=new Set(['hero','story','equipos','play','agents','precios','cierre']),seen=new Set();
    if('IntersectionObserver' in window){
      const observer=new IntersectionObserver(entries=>{
        for(const entry of entries){
          const id=entry.target.id;
          if(entry.isIntersecting&&SECTIONS.has(id)&&!seen.has(id)){seen.add(id);observer.unobserve(entry.target);void send('landing_section_viewed',{section:id});}
        }
      },{threshold:.35});
      for(const id of SECTIONS){const element=document.getElementById(id);if(element)observer.observe(element);}
    }
    const marks=[25,50,75,100],reached=new Set();
    const onScroll=()=>{
      const range=document.documentElement.scrollHeight-innerHeight;if(range<=0)return;
      const ratio=scrollY/range*100;
      for(const mark of marks)if(ratio>=mark-1&&!reached.has(mark)){reached.add(mark);void send('landing_scroll_depth',{percent:mark});}
      if(reached.size===marks.length)removeEventListener('scroll',onScroll);
    };
    addEventListener('scroll',onScroll,{passive:true});
  });
  void send('landing_view',{});

  // Oferta por tiempo limitado: la decide el servidor (vencimiento real); si no hay oferta o no responde, no se muestra nada.
  // No depende de la medición: quien pide no ser medido igual ve la oferta. Mismo gateway que los eventos, detrás del proxy de la app.
  const offerUrl=endpoint?endpoint.replace(/\/events$/,'/offer'):app?new URL('api/v1/offer',new URL(app,location.href)).href:'';
  const card=document.querySelector('.price-card.pro'),tag=document.getElementById('offer-tag');
  if(offerUrl&&card&&tag)safely(()=>fetch(offerUrl,{mode:'cors',credentials:'omit',headers:{'x-diagramia-client':'editor'}}).then(r=>r.ok?r.json():null).then(body=>{
    const offer=body&&body.available&&body.offer;if(!offer)return;
    const end=Date.parse(offer.endsAt);if(!(end>Date.now()))return;
    const en=document.documentElement.lang==='en',money=value=>'USD '+(Number.isInteger(value)?value:value.toFixed(2));
    document.getElementById('offer-headline').textContent=en?`${offer.percent}% off — ${money(offer.priceUsd)}/month`:`${offer.percent}% menos — ${money(offer.priceUsd)} por mes`;
    document.getElementById('offer-detail').textContent=en?(offer.months>1?`For your first ${offer.months} months. Regular price ${money(offer.regularUsd)}.`:`On your first month. Regular price ${money(offer.regularUsd)}.`)
      :(offer.months>1?`Durante tus primeros ${offer.months} meses. Después, ${money(offer.regularUsd)} por mes.`:`En tu primer mes. Después, ${money(offer.regularUsd)} por mes.`);
    const clock=document.getElementById('offer-clock'),pad=n=>String(n).padStart(2,'0');
    const tick=()=>{
      const left=end-Date.now();
      if(left<=0){tag.hidden=true;card.classList.remove('has-offer');clearInterval(timer);return;}
      const d=Math.floor(left/86400000),h=Math.floor(left%86400000/3600000),m=Math.floor(left%3600000/60000),s=Math.floor(left%60000/1000);
      clock.textContent=(en?'Ends in ':'Termina en ')+(d?d+(en?'d ':' d '):'')+pad(h)+':'+pad(m)+':'+pad(s);
    };
    const timer=setInterval(tick,1000);tick();
    tag.hidden=false;card.classList.add('has-offer');
    void send('offer_viewed',{kind:offer.kind,percent:offer.percent});
  }).catch(()=>{}));
})();
