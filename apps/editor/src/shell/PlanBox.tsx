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
  if(billing.plan==='pro')return <div className="plan-box" aria-label="Plan Pro">
    <p className="inline-note"><strong>Plan Pro ✓</strong> · {credits.monthlyLimit} créditos de IA por mes ({credits.dailyLimit} por día), hasta {storage.maxDocuments} diagramas en la nube y {storage.maxOwnElements} elementos propios.
      {billing.cancelsAt?` Se cancela el ${day(billing.cancelsAt)}: hasta entonces seguís con Pro.`:billing.renewsAt?` Próximo cobro: ${day(billing.renewsAt)}.`:''}</p>
    <div className="step-actions">
      {billing.updatePaymentUrl&&<a className="button quiet" href={billing.updatePaymentUrl} target="_blank" rel="noopener noreferrer">Cambiar medio de pago</a>}
      {billing.cancelUrl&&!billing.cancelsAt&&<a className="button quiet" href={billing.cancelUrl} target="_blank" rel="noopener noreferrer">Cancelar suscripción</a>}
    </div>
  </div>;
  return <div className="plan-box" aria-label="Plan Free">
    <p className="inline-note"><strong>Plan Free</strong> · {credits.monthlyLimit} créditos de IA por mes ({credits.dailyLimit} por día), {storage.maxDocuments} diagramas en la nube y {storage.maxOwnElements} elementos propios.</p>
    {!billing.available&&<p className="inline-note" role="status">Las suscripciones Pro todavía no están habilitadas. Podés seguir con Free y <a href="https://diagramia.app/precios.html" target="_blank" rel="noopener noreferrer">consultar los planes</a>.</p>}
    {billing.available&&<>
      {atLimit&&<p className="inline-note warn" role="status">Llegaste a un límite del plan Free. Con Pro seguís trabajando sin frenarte.</p>}
      {offer&&<OfferBanner offer={offer}/>}
      <section className="upgrade-card" aria-label="Beneficios de Pro"><span className="eyebrow">DIAGRAMIA PRO</span><h3>Más espacio para tus ideas.</h3>
        {yearly&&<div className="interval-toggle" role="radiogroup" aria-label="Frecuencia de pago">
          <button role="radio" aria-checked={interval==='month'} className={interval==='month'?'chosen':''} onClick={()=>setInterval_('month')}>Mensual</button>
          <button role="radio" aria-checked={interval==='year'} className={interval==='year'?'chosen':''} onClick={()=>setInterval_('year')}>Anual <small>ahorrás {Math.round((1-yearly/(monthly*12))*100)}%</small></button></div>}
        <p className="price">{interval==='year'&&yearly?<><strong>{money(yearly)}</strong> por año ({money(Math.round(yearly/12*100)/100)} por mes)</>:offer?<><s>{money(offer.regularUsd)}</s> <strong>{money(offer.priceUsd)}</strong> por mes {offerTerms(offer)}</>:<><strong>{money(monthly)}</strong> por mes</>} · cancelás cuando quieras</p><ProBenefits/>
      {billing.status&&billing.status!=='canceled'&&<p className="inline-note warn" role="status">Tu suscripción figura como «{billing.status}»: mientras no esté activa, la cuenta usa el plan Free. Revisá el medio de pago.</p>}
      <div className="step-actions"><button className="primary" disabled={state==='working'} onClick={()=>void subscribe()}>{state==='working'?'Abriendo el pago…':interval==='year'&&yearly?`Pasar a Pro · ${money(yearly)}/año`:offer?`Pasar a Pro · ${money(offer.priceUsd)}/mes`:`Pasar a Pro · ${money(monthly)}/mes`}</button></div>
      {error&&<p className="inline-note warn" role="alert">{error}</p>}
      <small>Si pasan menos de 48 horas desde el pago, te lo devolvemos. <a href="https://diagramia.app/reembolsos.html" target="_blank" rel="noopener noreferrer">Condiciones</a></small></section>
    </>}
  </div>;
}
