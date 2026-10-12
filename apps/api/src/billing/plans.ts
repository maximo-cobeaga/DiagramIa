/** Planes y sus límites (ADR 089). Es la única fuente: créditos, nube y elementos propios salen de acá. */
import type {PlanId} from '@diagramia/core';
export {PLANS,type PlanId,type PlanLimits} from '@diagramia/core';

export type SubscriptionState={status:string;currentPeriodEnd:Date|null};

/**
 * Pro mientras la suscripción esté activa o en prueba. Pagos vencidos (`past_due`), pausada o cancelada vuelven a Free:
 * no se borra nada, lo que excede el límite queda en sólo lectura (ver `readOnlyDocumentIds`).
 */
export function planOf(subscription:SubscriptionState|null|undefined):PlanId{
  return subscription&&(subscription.status==='active'||subscription.status==='trialing')?'pro':'free';
}
