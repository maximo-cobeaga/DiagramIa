import {useState} from 'react';
import type {ReactNode} from 'react';
import type {Account} from '../store/accountStore';
import {accountStore} from '../store/accountStore';
import {useStore} from '../store/createStore';
import {openPlan,startCheckout} from './checkout';

const day=(iso:string)=>new Date(iso).toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric'});
export function ProBenefits(){
  return <ul className="benefits"><li>400 créditos de IA por mes (hasta 40 por día)</li><li>Hasta 100 diagramas en la nube, 1 GB</li><li>Hasta 200 elementos propios</li></ul>;
}

/** Invitación a Pro en el lugar donde la persona choca con un límite. Sólo existe para cuentas Free con el cobro encendido. */
export function UpgradeAction({children='Ver Pro · USD 5/mes'}:{children?:ReactNode}){
  const {auth,account}=useStore(accountStore);
  if(auth!=='signed-in'||!account?.billing.available||account.billing.plan!=='free')return null;
  return <button className="primary" onClick={openPlan}>{children}</button>;
}

/** Plan de la cuenta: qué incluye, pasar a Pro y administrar el cobro. Los pagos los hace y los cobra Paddle; acá no se ve ninguna tarjeta. */
export function PlanBox({account}:{account:Account}){
  const {billing,credits,storage}=account,[state,setState]=useState<'idle'|'working'>('idle'),[error,setError]=useState('');
  const subscribe=async()=>{
    setState('working');setError('');
    const failure=await startCheckout();
    if(failure){setState('idle');setError(failure);}
  };
  if(billing.plan==='pro')return <div className="plan-box" aria-label="Plan Pro">
    <p className="inline-note"><strong>Plan Pro ✓</strong> · {credits.monthlyLimit} créditos de IA por mes ({credits.dailyLimit} por día), hasta {storage.maxDocuments} diagramas en la nube y {storage.maxOwnElements} elementos propios.
      {billing.cancelsAt?` Se cancela el ${day(billing.cancelsAt)}: hasta entonces seguís con Pro.`:billing.renewsAt?` Próximo cobro: ${day(billing.renewsAt)}.`:''}</p>
    <div className="step-actions">
      {billing.updatePaymentUrl&&<a className="button quiet" href={billing.updatePaymentUrl} target="_blank" rel="noopener noreferrer">Cambiar medio de pago</a>}
      {billing.cancelUrl&&!billing.cancelsAt&&<a className="button quiet" href={billing.cancelUrl} target="_blank" rel="noopener noreferrer">Cancelar suscripción</a>}
    </div>
  </div>;
  const atLimit=credits.monthly>=credits.monthlyLimit||credits.daily>=credits.dailyLimit||storage.documents>=storage.maxDocuments;
  return <div className="plan-box" aria-label="Plan Free">
    <p className="inline-note"><strong>Plan Free</strong> · {credits.monthlyLimit} créditos de IA por mes ({credits.dailyLimit} por día), {storage.maxDocuments} diagramas en la nube y {storage.maxOwnElements} elementos propios.</p>
    {!billing.available&&<p className="inline-note" role="status">Las suscripciones Pro todavía no están habilitadas. Podés seguir con Free y <a href="https://diagramia.app/precios.html" target="_blank" rel="noopener noreferrer">consultar los planes</a>.</p>}
    {billing.available&&<>
      {atLimit&&<p className="inline-note warn" role="status">Llegaste a un límite del plan Free. Con Pro seguís trabajando sin frenarte.</p>}
      <section className="upgrade-card" aria-label="Beneficios de Pro"><span className="eyebrow">DIAGRAMIA PRO</span><h3>Más espacio para tus ideas.</h3><p className="price"><strong>USD 5</strong> por mes · cancelás cuando quieras</p><ProBenefits/>
      {billing.status&&billing.status!=='canceled'&&<p className="inline-note warn" role="status">Tu suscripción figura como «{billing.status}»: mientras no esté activa, la cuenta usa el plan Free. Revisá el medio de pago.</p>}
      <div className="step-actions"><button className="primary" disabled={state==='working'} onClick={()=>void subscribe()}>{state==='working'?'Abriendo el pago…':'Pasar a Pro · USD 5/mes'}</button></div>
      {error&&<p className="inline-note warn" role="alert">{error}</p>}
      <small>Si pasan menos de 48 horas desde el pago, te lo devolvemos. <a href="https://diagramia.app/reembolsos.html" target="_blank" rel="noopener noreferrer">Condiciones</a></small></section>
    </>}
  </div>;
}
