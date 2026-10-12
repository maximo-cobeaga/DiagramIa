import type {Pool,PoolClient} from 'pg';
import {PLANS,planOf,type PlanId,type PlanLimits} from '../billing/plans.js';
import type {SubscriptionChange} from '../billing/paddle.js';

type Db=Pool|PoolClient;
type Row={status:string|null;current_period_end:Date|null};

/** Plan y límites del dueño de un proyecto. Sin suscripción (o sin cuenta), Free. */
export async function planForProject(db:Db,projectId:string):Promise<{plan:PlanId;limits:PlanLimits}>{
  const found=await db.query<Row>('SELECT s.status,s.current_period_end FROM projects p LEFT JOIN subscriptions s ON s.user_id=p.owner_id WHERE p.id=$1',[projectId]);
  const plan=planOf(found.rows[0]?.status?{status:found.rows[0].status,currentPeriodEnd:found.rows[0].current_period_end}:null);
  return {plan,limits:PLANS[plan]};
}
export async function planForUser(db:Db,userId:string):Promise<{plan:PlanId;limits:PlanLimits}>{
  const found=await db.query<Row>('SELECT status,current_period_end FROM subscriptions WHERE user_id=$1',[userId]);
  const plan=planOf(found.rows[0]?.status?{status:found.rows[0].status,currentPeriodEnd:found.rows[0].current_period_end}:null);
  return {plan,limits:PLANS[plan]};
}

/**
 * Diagramas que exceden el plan: los más nuevos pasan a sólo lectura. Con Pro, ninguno.
 * Nunca se borra nada al bajar a Free; se puede leer, exportar y borrar, no editar ni restaurar.
 */
export async function isReadOnlyDocument(db:Db,projectId:string,storageId:string,limits:PlanLimits):Promise<boolean>{
  const found=await db.query<{document_id:string}>('SELECT document_id FROM cloud_documents WHERE project_id=$1 ORDER BY created_at,document_id LIMIT $2',[projectId,limits.maxDocuments]);
  return !found.rows.some(row=>row.document_id===storageId);
}

/** Mientras la suscripción exista en el proveedor (aunque esté vencida o en pausa) puede volver a cobrar: sólo deja de hacerlo al cancelarse. */
export const billable=(status:string|null|undefined)=>Boolean(status)&&status!=='canceled';

export type BillingView={plan:PlanId;status:string|null;priceId:string|null;renewsAt:Date|null;cancelsAt:Date|null;updatePaymentUrl:string|null;cancelUrl:string|null};

export class BillingRepository{
  /** `environment` es el entorno de Paddle configurado: el que firma los avisos que llegan y con el que se marcan las suscripciones. */
  constructor(private readonly pool:Pool,private readonly environment:'sandbox'|'live'='sandbox'){}

  /**
   * Al cobrar de verdad, las suscripciones creadas con pagos de prueba dejan de valer: nadie pagó por ellas y ningún aviso
   * real las va a cerrar. Sólo actúa en `live`; con el sandbox configurado no toca nada. Devuelve cuántas quitó.
   */
  async dropTestSubscriptions():Promise<number>{
    if(this.environment!=='live')return 0;
    return (await this.pool.query("DELETE FROM subscriptions WHERE environment<>'live'")).rowCount??0;
  }

  async accountCreatedAt(userId:string):Promise<Date|null>{
    const found=await this.pool.query<{created_at:Date}>('SELECT created_at FROM users WHERE id=$1',[userId]);
    return found.rows[0]?.created_at??null;
  }

  async view(userId:string):Promise<BillingView>{
    const found=await this.pool.query<Row&{price_id:string|null;scheduled_cancel_at:Date|null;update_payment_url:string|null;cancel_url:string|null}>(
      'SELECT status,price_id,current_period_end,scheduled_cancel_at,update_payment_url,cancel_url FROM subscriptions WHERE user_id=$1',[userId]);
    const row=found.rows[0];
    if(!row)return {plan:'free',status:null,priceId:null,renewsAt:null,cancelsAt:null,updatePaymentUrl:null,cancelUrl:null};
    const plan=planOf({status:row.status!,currentPeriodEnd:row.current_period_end});
    return {plan,status:row.status,priceId:row.price_id,renewsAt:row.current_period_end,cancelsAt:row.scheduled_cancel_at,updatePaymentUrl:row.update_payment_url,cancelUrl:row.cancel_url};
  }

  /**
   * Aplica un aviso una sola vez. Devuelve `duplicate` si el evento ya estaba, `stale` si llegó uno más nuevo antes
   * (los avisos pueden desordenarse), `unknown-user` si la cuenta ya no existe (por ejemplo, fue eliminada) y
   * `other-subscription` si el aviso es de una suscripción distinta de la que hoy le da Pro a la cuenta.
   */
  async apply(change:SubscriptionChange,eventType:string):Promise<'applied'|'duplicate'|'stale'|'unknown-user'|'other-subscription'>{
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN');
      const fresh=await client.query('INSERT INTO billing_events (event_id,event_type,occurred_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',[change.eventId,eventType,change.occurredAt]);
      if(fresh.rowCount===0){await client.query('ROLLBACK');return 'duplicate';}
      const user=await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[change.userId]);
      if(!user.rows.length){await client.query('COMMIT');return 'unknown-user';}
      const prior=await client.query<Row&{last_event_at:Date;provider_subscription_id:string}>('SELECT last_event_at,provider_subscription_id,status,current_period_end FROM subscriptions WHERE user_id=$1',[change.userId]);
      const stored=prior.rows[0];
      if(stored&&stored.last_event_at.getTime()>change.occurredAt.getTime()){await client.query('COMMIT');return 'stale';}
      // Una cuenta puede arrastrar una suscripción anterior (con un cobro vencido, pausada) además de la nueva que está pagando.
      // Lo que le pase a la otra —por ejemplo, su cancelación definitiva— no debe quitarle el Pro vigente.
      if(stored&&stored.provider_subscription_id!==change.providerSubscriptionId&&planOf({status:stored.status!,currentPeriodEnd:stored.current_period_end})==='pro'){await client.query('COMMIT');return 'other-subscription';}
      await client.query(
        `INSERT INTO subscriptions (user_id,provider_customer_id,provider_subscription_id,price_id,status,current_period_end,scheduled_cancel_at,update_payment_url,cancel_url,last_event_at,environment)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (user_id) DO UPDATE SET provider_customer_id=EXCLUDED.provider_customer_id,provider_subscription_id=EXCLUDED.provider_subscription_id,price_id=EXCLUDED.price_id,
           status=EXCLUDED.status,current_period_end=EXCLUDED.current_period_end,scheduled_cancel_at=EXCLUDED.scheduled_cancel_at,
           update_payment_url=EXCLUDED.update_payment_url,cancel_url=EXCLUDED.cancel_url,last_event_at=EXCLUDED.last_event_at,environment=EXCLUDED.environment,updated_at=now()`,
        [change.userId,change.providerCustomerId,change.providerSubscriptionId,change.priceId,change.status,change.currentPeriodEnd,change.scheduledCancelAt,change.updatePaymentUrl,change.cancelUrl,change.occurredAt,this.environment]);
      await client.query('COMMIT');return 'applied';
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
}
