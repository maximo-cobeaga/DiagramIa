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
  void send('landing_view',{});
})();
