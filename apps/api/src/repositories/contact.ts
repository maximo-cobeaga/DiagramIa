import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {z} from 'zod';

const clean=(max:number)=>z.string().trim().max(max);
/** Consulta del plan Empresas. `website` es una trampa para bots: una persona nunca lo ve ni lo completa. */
export const ContactSchema=z.strictObject({
  name:clean(100).min(2),
  email:clean(200).email(),
  company:clean(120).min(2),
  teamSize:z.enum(['1-10','11-50','51-200','201+']).optional(),
  message:clean(2000).min(10),
  website:clean(200).optional()
});
export type ContactInput=z.infer<typeof ContactSchema>;
export type ContactEntry={id:string;createdAt:string;name:string;email:string;company:string;teamSize:string|null;message:string;status:'new'|'answered'};

/** Bandeja privada de consultas de empresas en PostgreSQL. No guarda la IP ni un identificador de conexión. */
export class ContactRepository{
  constructor(private readonly pool:Pool){}

  async create(input:ContactInput):Promise<{id:string}>{
    const id=randomUUID();
    await this.pool.query(
      'INSERT INTO contact_requests (id,name,email,company,team_size,message) VALUES ($1,$2,$3,$4,$5,$6)',
      [id,input.name,input.email,input.company,input.teamSize??null,input.message]
    );
    return {id};
  }

  async list():Promise<ContactEntry[]>{
    const result=await this.pool.query('SELECT id,created_at,name,email,company,team_size,message,status FROM contact_requests ORDER BY created_at DESC,id DESC LIMIT 100');
    return result.rows.map(row=>({id:row.id,createdAt:row.created_at.toISOString(),name:row.name,email:row.email,company:row.company,teamSize:row.team_size,message:row.message,status:row.status}));
  }

  async markAnswered(id:string):Promise<boolean>{
    const result=await this.pool.query("UPDATE contact_requests SET status='answered' WHERE id=$1",[id]);
    return result.rowCount===1;
  }
}
