/**
 * Oferta por tiempo limitado (ADR 092). El descuento real vive en Paddle (`discountId`): acá sólo se decide si está vigente
 * para una persona y qué se le muestra. Un vencimiento visible siempre es un vencimiento real: pasada la hora, el servidor
 * deja de enviar el descuento al crear el pago, aunque la página siga abierta.
 *
 * Dos ventanas, se usa la que vence más tarde:
 *  - campaña: una fecha fija para todos (`endsAt`);
 *  - bienvenida: `welcomeHours` desde que se creó la cuenta, para quien todavía no pasó a Pro.
 */
export type OfferConfig={discountId:string;percent:number;months:number;regularUsd:number;endsAt:Date|null;welcomeHours:number};
export type Offer={kind:'campaign'|'welcome';percent:number;months:number;regularUsd:number;priceUsd:number;endsAt:string};

export function parseOffer(env:Record<string,string|undefined>,regularUsd:number):OfferConfig|undefined{
  const discountId=env.DIAGRAMIA_OFFER_DISCOUNT_ID;
  if(!discountId)return undefined;
  if(!/^dsc_[a-z0-9]{20,40}$/.test(discountId))throw new Error('DIAGRAMIA_OFFER_DISCOUNT_ID no parece un ID de descuento de Paddle (dsc_…).');
  const percent=Number(env.DIAGRAMIA_OFFER_PERCENT);
  if(!Number.isInteger(percent)||percent<5||percent>90)throw new Error('DIAGRAMIA_OFFER_PERCENT debe ser un entero entre 5 y 90 (el mismo porcentaje del descuento en Paddle).');
  const months=env.DIAGRAMIA_OFFER_MONTHS?Number(env.DIAGRAMIA_OFFER_MONTHS):1;
  if(!Number.isInteger(months)||months<1||months>12)throw new Error('DIAGRAMIA_OFFER_MONTHS debe ser un entero entre 1 y 12 (los mismos períodos del descuento en Paddle).');
  const endsAt=env.DIAGRAMIA_OFFER_ENDS_AT?new Date(env.DIAGRAMIA_OFFER_ENDS_AT):null;
  if(endsAt&&Number.isNaN(endsAt.getTime()))throw new Error('DIAGRAMIA_OFFER_ENDS_AT debe ser una fecha ISO, por ejemplo 2026-11-30T23:59:00-03:00.');
  const welcomeHours=env.DIAGRAMIA_OFFER_WELCOME_HOURS?Number(env.DIAGRAMIA_OFFER_WELCOME_HOURS):0;
  if(!Number.isFinite(welcomeHours)||welcomeHours<0||welcomeHours>24*30)throw new Error('DIAGRAMIA_OFFER_WELCOME_HOURS debe estar entre 0 y 720.');
  if(!endsAt&&!welcomeHours)throw new Error('La oferta necesita DIAGRAMIA_OFFER_ENDS_AT o DIAGRAMIA_OFFER_WELCOME_HOURS: sin vencimiento no es una oferta por tiempo limitado.');
  return {discountId,percent,months,regularUsd,endsAt,welcomeHours};
}

/** Oferta vigente para una persona. `createdAt` es null para visitantes: sólo les alcanza la campaña. */
export function offerFor(config:OfferConfig|undefined,createdAt:Date|null,now=new Date()):Offer|null{
  if(!config)return null;
  const campaign=config.endsAt&&config.endsAt.getTime()>now.getTime()?config.endsAt:null;
  const welcomeEnd=config.welcomeHours&&createdAt?new Date(createdAt.getTime()+config.welcomeHours*3_600_000):null;
  const welcome=welcomeEnd&&welcomeEnd.getTime()>now.getTime()?welcomeEnd:null;
  const end=campaign&&welcome?(welcome>campaign?welcome:campaign):campaign??welcome;
  if(!end)return null;
  return {kind:end===welcome?'welcome':'campaign',percent:config.percent,months:config.months,regularUsd:config.regularUsd,
    priceUsd:Math.round(config.regularUsd*(100-config.percent))/100,endsAt:end.toISOString()};
}
