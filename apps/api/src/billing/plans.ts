/** Planes y sus límites (ADR 089). Es la única fuente: créditos, nube y elementos propios salen de acá. */
export type PlanId='free'|'pro';
export type PlanLimits={dailyCredits:number;monthlyCredits:number;maxDocuments:number;maxDocumentBytes:number;maxBytes:number;maxOwnElements:number};

export const PLANS:Record<PlanId,PlanLimits>={
  free:{dailyCredits:6,monthlyCredits:20,maxDocuments:3,maxDocumentBytes:10_000_000,maxBytes:30_000_000,maxOwnElements:5},
  pro:{dailyCredits:40,monthlyCredits:400,maxDocuments:100,maxDocumentBytes:10_000_000,maxBytes:1_000_000_000,maxOwnElements:200}
};

export type SubscriptionState={status:string;currentPeriodEnd:Date|null};

/**
 * Pro mientras la suscripción esté activa o en prueba. Pagos vencidos (`past_due`), pausada o cancelada vuelven a Free:
 * no se borra nada, lo que excede el límite queda en sólo lectura (ver `readOnlyDocumentIds`).
 */
export function planOf(subscription:SubscriptionState|null|undefined):PlanId{
  return subscription&&(subscription.status==='active'||subscription.status==='trialing')?'pro':'free';
}
