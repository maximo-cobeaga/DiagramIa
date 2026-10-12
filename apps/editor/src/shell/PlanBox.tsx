import {PLANS} from '@diagramia/core';
import {useEffect,useState} from 'react';
import type {ReactNode} from 'react';
import type {Account,Offer} from '../store/accountStore';
import {accountStore,refreshAccount} from '../store/accountStore';
import {useStore} from '../store/createStore';
import {track,trackOnce,trackSession} from '../telemetry';
import {goPro,startCheckout,type Interval} from './checkout';

const day=(iso:string)=>new Date(iso).toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric'});
const money=(value:number)=>'USD '+(Number.isInteger(value)?value:value.toFixed(2).replace('.',','));
const pad=(n:number)=>String(n).padStart(2,'0');
export function ProBenefits(){
  return <ul className="benefits"><li>400 créditos de IA por mes (hasta 40 por día)</li><li>Hasta 100 diagramas en la nube, 1 GB</li><li>Hasta 200 elementos propios</li></ul>;
}

/** Tiempo que falta para el vencimiento. Al llegar a cero avisa para que el plan se vuelva a pedir al servidor y la oferta desaparezca. */
function useCountdown(endsAt:string|undefined,onExpire:()=>void){
  const [left,setLeft]=useState(()=>endsAt?Date.parse(endsAt)-Date.now():0);
  useEffect(()=>{
    if(!endsAt)return;
    const end=Date.parse(endsAt);let expired=false;
    const tick=()=>{const remaining=end-Date.now();setLeft(remaining);if(remaining<=0&&!expired){expired=true;onExpire();}};
    tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer);
  },[endsAt]);
  return left;
}
export function formatLeft(ms:number){
  const total=Math.max(0,Math.floor(ms/1000)),d=Math.floor(total/86400),h=Math.floor(total%86400/3600),m=Math.floor(total%3600/60),s=total%60;
  return (d?`${d} d `:'')+`${pad(h)}:${pad(m)}:${pad(s)}`;
}
const offerTerms=(offer:Offer)=>offer.months>1?`durante tus primeros ${offer.months} meses`:'en tu primer mes';

/** Oferta por tiempo limitado: muestra el precio, hasta cuándo vale y lleva directo al pago. */
export function OfferBanner({offer}:{offer:Offer}){
  const [state,setState]=useState<'idle'|'working'>('idle'),[error,setError]=useState('');
  const left=useCountdown(offer.endsAt,()=>void refreshAccount());
  useEffect(()=>{
    trackOnce(`offer:${offer.kind}:${offer.endsAt}`,'offer_viewed',{kind:offer.kind,percent:offer.percent});
    trackSession('upgrade:offer','upgrade_prompt_shown',{placement:'offer',offer:true});
  },[offer.endsAt]);
  if(left<=0)return null;
  const terms=offerTerms(offer);
  return <section className="offer-banner" aria-label="Oferta por tiempo limitado">
    <div className="offer-copy"><span className="eyebrow">{offer.kind==='welcome'?'OFERTA DE BIENVENIDA':'OFERTA POR TIEMPO LIMITADO'}</span>
      <strong>{offer.percent}% menos: {money(offer.priceUsd)} por mes</strong>
      <span>{terms[0]!.toUpperCase()+terms.slice(1)}. Después, {money(offer.regularUsd)} por mes. Cancelás cuando quieras.</span></div>
    <div className="offer-side"><span className="offer-clock mono" role="timer" aria-label={`Termina en ${formatLeft(left)}`}>Termina en {formatLeft(left)}</span>
      <button className="primary" disabled={state==='working'} onClick={async()=>{setState('working');setError('');const failure=await startCheckout('offer');if(failure){setState('idle');setError(failure);}}}>{state==='working'?'Abriendo el pago…':'Aprovechar la oferta'}</button></div>
    {error&&<p className="inline-note warn" role="alert">{error}</p>}
  </section>;
}

/** Invitación a Pro en el lugar donde la persona choca con un límite. Sólo existe para cuentas Free con el cobro encendido. Va directo al pago. */
export function UpgradeAction({children,source='limit'}:{children?:ReactNode;source?:'limit'|'header'}){
  const {auth,account}=useStore(accountStore);
  const shown=auth==='signed-in'&&Boolean(account?.billing.available)&&account?.billing.plan==='free';
  useEffect(()=>{if(shown)trackSession('upgrade:'+source,'upgrade_prompt_shown',{placement:source,offer:Boolean(account?.billing.offer)});},[shown]);
  if(!shown)return null;
  const offer=account!.billing.offer;
  const list=account!.billing.prices?.monthlyUsd;
  return <button className="primary" onClick={()=>void goPro(source)}>{offer?(source==='header'?`⚡ Pro con ${offer.percent}% menos`:`Pasar a Pro · ${money(offer.priceUsd)}/mes (${offer.percent}% menos)`):children??(list?`Ver Pro · ${money(list)}/mes`:'Ver Pro')}</button>;
}

/** Plan de la cuenta: qué incluye, pasar a Pro y administrar el cobro. Los pagos los hace y los cobra Paddle; acá no se ve ninguna tarjeta. */
export function PlanBox({account}:{account:Account}){
  const {billing,credits,storage}=account,[state,setState]=useState<'idle'|'working'>('idle'),[error,setError]=useState('');
  const prices=billing.prices??null,yearly=prices?.yearlyUsd??null,[interval,setInterval_]=useState<Interval>('month');
  // La oferta es del plan mensual; con el anual elegido no se muestra ni se aplica.
  const offer=interval==='month'?billing.offer??null:null,monthly=prices?.monthlyUsd??0;
  const subscribe=async()=>{
    setState('working');setError('');
    const failure=await startCheckout('plan_box',interval);
    if(failure){setState('idle');setError(failure);}
  };
  const atLimit=credits.monthly>=credits.monthlyLimit||credits.daily>=credits.dailyLimit||storage.documents>=storage.maxDocuments;
  useEffect(()=>{
    if(billing.plan!=='free'||!billing.available)return;
    trackSession('upgrade:plan_box','upgrade_prompt_shown',{placement:'plan_box',offer:Boolean(offer)});
    if(credits.monthly>=credits.monthlyLimit)trackSession('limit:credits_monthly','limit_reached',{kind:'credits_monthly'});
    else if(credits.daily>=credits.dailyLimit)trackSession('limit:credits_daily','limit_reached',{kind:'credits_daily'});
    if(storage.documents>=storage.maxDocuments)trackSession('limit:documents','limit_reached',{kind:'documents'});
  },[billing.plan,billing.available]);
  const pro=billing.plan==='pro';
  // La suscripción sigue viva en Paddle aunque no dé Pro (cobro vencido, en pausa): hay que poder ponerla al día o cancelarla.
  const pending=!pro&&Boolean(billing.status)&&billing.status!=='canceled';
  const manage=<>
    {billing.updatePaymentUrl&&<a className="button quiet" href={billing.updatePaymentUrl} target="_blank" rel="noopener noreferrer">Cambiar medio de pago</a>}
    {billing.cancelUrl&&!billing.cancelsAt&&<a className="button quiet" href={billing.cancelUrl} target="_blank" rel="noopener noreferrer">Cancelar suscripción</a>}
  </>;
  const comparison=[
    ['Créditos de IA / mes',PLANS.free.monthlyCredits,PLANS.pro.monthlyCredits],
    ['Créditos de IA / día',PLANS.free.dailyCredits,PLANS.pro.dailyCredits],
    ['Diagramas en la nube',PLANS.free.maxDocuments,PLANS.pro.maxDocuments],
    ['Almacenamiento','30 MB','1 GB'],
    ['Elementos propios',PLANS.free.maxOwnElements,PLANS.pro.maxOwnElements],
    ['Editor, animaciones y exportaciones','Incluidos','Incluidos']
  ];
  return <div className="plan-box" aria-label={pro?'Plan Pro':'Plan Free'}>
    {pro&&<section className="subscription-status"><span className="plan-badge pro">PRO ACTIVO</span><p>{billing.cancelsAt?`Tu plan sigue activo hasta el ${day(billing.cancelsAt)}.`:billing.renewsAt?`Próxima renovación: ${day(billing.renewsAt)}.`:'Tenés todo listo para seguir creando.'}</p><div className="step-actions">{manage}</div></section>}
    {!pro&&atLimit&&<p className="inline-note warn" role="status">Llegaste a un límite de Free. Compará las opciones para seguir.</p>}
    {!pro&&offer&&<OfferBanner offer={offer}/>}
    {!pro&&yearly&&<div className="plan-frequency"><span>Elegí cómo pagar</span><div className="interval-toggle" role="group" aria-label="Frecuencia de pago">
      <button aria-pressed={interval==='month'} className={interval==='month'?'chosen':''} onClick={()=>setInterval_('month')}>Mensual</button>
      <button aria-pressed={interval==='year'} className={interval==='year'?'chosen':''} onClick={()=>setInterval_('year')}>Anual <small>−{Math.round((1-yearly/(monthly*12))*100)}%</small></button></div></div>}
    <div className="plan-cards">
      <section className="plan-card free"><div className="plan-card-top"><span className="eyebrow">PARA EMPEZAR</span>{!pro&&<span className="current-plan">Tu plan</span>}</div><h3>Free<span>↗</span></h3><p className="plan-description">De la primera idea a tu primer diagrama.</p><p className="plan-price"><strong>USD 0</strong><span>para siempre</span></p><ul className="benefits"><li>Canvas completo y editable</li><li>{PLANS.free.monthlyCredits} créditos de IA al mes</li><li>{PLANS.free.maxDocuments} diagramas en la nube</li></ul><div className="plan-card-foot">{!pro?'Tu espacio para empezar a crear.':'Al cancelar, volvés a Free sin borrar tus diagramas.'}</div></section>
      <section className="plan-card pro" aria-label="Beneficios de Pro"><div className="plan-card-top"><span className="eyebrow">PARA IR MÁS LEJOS</span><span className="current-plan">{pro?'Tu plan':'20× más IA'}</span></div><h3>Pro<span>✳</span></h3><p className="plan-description">Más ideas, más espacio, más posibilidades.</p>
        <p className="plan-price"><strong>{interval==='year'&&yearly?money(yearly):offer?money(offer.priceUsd):monthly?money(monthly):'USD 10'}</strong><span>{interval==='year'&&yearly?'por año':'por mes'}</span></p>
        {offer&&<p className="plan-price-note">{offerTerms(offer)}; después {money(offer.regularUsd)}/mes.</p>}
        {interval==='year'&&yearly&&<p className="plan-price-note">Equivale a {money(Math.round(yearly/12*100)/100)}/mes. Cobro anual.</p>}
        <ProBenefits/>
        {!pro&&<button className="primary big" disabled={!billing.available||state==='working'} onClick={()=>void subscribe()}>{state==='working'?'Abriendo el pago…':billing.available?'Pasar a Pro ↗':'Suscripción aún no disponible'}</button>}
        <div className="plan-card-foot">{pro?'Gracias por darle espacio a tus ideas.':'Cancelás cuando quieras. Tus diagramas siguen siendo tuyos.'}</div>
      </section>
    </div>
    {error&&<div className="checkout-error" role="alert"><strong>No pudimos abrir el pago</strong><p>{error}</p><a href="mailto:mcobeaga@diagramia.app?subject=Ayuda%20con%20el%20pago%20de%20Pro">Contactar a soporte ↗</a></div>}
    {!billing.available&&<p className="inline-note" role="status">Las suscripciones Pro todavía no están habilitadas. Podés seguir trabajando con Free.</p>}
    {pending&&<section className="subscription-status"><p className="inline-note warn" role="status">{billing.status==='past_due'?'No pudimos cobrar tu suscripción.':billing.status==='paused'?'Tu suscripción está en pausa.':`Tu suscripción figura como «${billing.status}».`} La cuenta usa Free hasta que el pago esté al día.</p><div className="step-actions">{manage}</div></section>}
    <section className="plan-comparison"><h3>Cada detalle, a la vista.</h3><div className="comparison-scroll"><table><caption>Comparación de los planes Free y Pro</caption><thead><tr><th scope="col">Qué incluye</th><th scope="col">Free</th><th scope="col">Pro</th></tr></thead><tbody>{comparison.map(([label,free,paid])=><tr key={label}><th scope="row">{label}</th><td>{free}</td><td>{paid}</td></tr>)}</tbody></table></div></section>
    <p className="plan-legal">Pago seguro con Paddle. Los impuestos dependen de tu país. <a href="https://diagramia.app/reembolsos.html" target="_blank" rel="noopener noreferrer">Condiciones de reembolso</a>.</p>
  </div>;
}
