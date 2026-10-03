import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {ServerEventSchema,type ServerEvent,type TelemetryBatch} from '@diagramia/core';

/** Un reloj de cliente desfasado más de un día no se cree: el evento queda con la hora de recepción. */
const MAX_CLOCK_SKEW_MS=86_400_000;

/**
 * Telemetría propia en PostgreSQL (ADR 046). Los lotes ya llegan validados contra el contrato del core.
 * Insertar es idempotente por ID de evento: un reintento del navegador no duplica nada.
 */
export class TelemetryRepository{
  constructor(private readonly pool:Pool,private readonly now:()=>Date=()=>new Date()){}

  async ingest(batch:TelemetryBatch,userId:string|null):Promise<{accepted:number}>{
    const received=this.now(),values:unknown[]=[],rows:string[]=[];
    for(const event of batch.events){
      const at=new Date(event.at),occurred=Math.abs(at.getTime()-received.getTime())>MAX_CLOCK_SKEW_MS?received:at;
      const base=values.length;
      values.push(event.id,event.name,batch.anonymousId,batch.sessionId,userId,occurred,received,JSON.stringify(event.props),JSON.stringify(batch.context));
      rows.push(`($${base+1},'client',$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8}::jsonb,$${base+9}::jsonb)`);
    }
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN');
      const inserted=await client.query(`INSERT INTO telemetry_events (id,origin,name,anonymous_id,session_id,user_id,occurred_at,received_at,props,context)
        VALUES ${rows.join(',')} ON CONFLICT (id) DO NOTHING`,values);
      if(userId)await client.query('INSERT INTO telemetry_identities (anonymous_id,user_id) VALUES ($1,$2) ON CONFLICT (anonymous_id) DO NOTHING',[batch.anonymousId,userId]);
      await client.query('COMMIT');
      return {accepted:inserted.rowCount??0};
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }

  /** Evento del servidor (pedido de IA, alta de cuenta). Se valida aquí también: es la última barrera antes de la base. */
  async record(event:ServerEvent,userId:string|null):Promise<void>{
    const parsed=ServerEventSchema.parse(event);
    await this.pool.query(`INSERT INTO telemetry_events (id,origin,name,user_id,occurred_at,props) VALUES ($1,'server',$2,$3,$4,$5::jsonb)`,
      [randomUUID(),parsed.name,userId,this.now(),JSON.stringify(parsed.props)]);
  }
}

/** Límite de pedidos por clave (IP) en una ventana deslizante, en memoria del proceso. */
export class RateLimiter{
  private hits=new Map<string,number[]>();
  constructor(private readonly limit:number,private readonly windowMs:number,private readonly now:()=>number=Date.now){}
  allow(key:string):boolean{
    const now=this.now(),recent=(this.hits.get(key)??[]).filter(at=>now-at<this.windowMs);
    if(recent.length>=this.limit){this.hits.set(key,recent);return false;}
    recent.push(now);this.hits.set(key,recent);
    // Poda ocasional para que claves viejas no crezcan sin límite.
    if(this.hits.size>10_000)for(const [k,list] of this.hits)if(!list.some(at=>now-at<this.windowMs))this.hits.delete(k);
    return true;
  }
}
