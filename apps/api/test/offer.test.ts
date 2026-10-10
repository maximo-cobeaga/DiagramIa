import assert from 'node:assert/strict';
import test from 'node:test';
import {offerFor,parseOffer} from '../src/billing/offer.js';

const base={DIAGRAMIA_OFFER_DISCOUNT_ID:'dsc_01abcdefghijklmnopqrstuvwx',DIAGRAMIA_OFFER_PERCENT:'40'};

test('sin descuento configurado no hay oferta; con uno, exige vencimiento y un porcentaje válido',()=>{
  assert.equal(parseOffer({},5),undefined);
  assert.throws(()=>parseOffer({...base},5),/vencimiento/);
  assert.throws(()=>parseOffer({...base,DIAGRAMIA_OFFER_ENDS_AT:'mañana'},5),/fecha ISO/);
  assert.throws(()=>parseOffer({...base,DIAGRAMIA_OFFER_PERCENT:'95',DIAGRAMIA_OFFER_WELCOME_HOURS:'48'},5),/entre 5 y 90/);
  assert.throws(()=>parseOffer({...base,DIAGRAMIA_OFFER_DISCOUNT_ID:'abc',DIAGRAMIA_OFFER_WELCOME_HOURS:'48'},5),/dsc_/);
  assert.ok(parseOffer({...base,DIAGRAMIA_OFFER_WELCOME_HOURS:'48'},5));
});

test('la campaña vale para todos hasta su fecha; después no hay oferta ni descuento',()=>{
  const config=parseOffer({...base,DIAGRAMIA_OFFER_ENDS_AT:'2026-11-30T23:59:00Z',DIAGRAMIA_OFFER_MONTHS:'3'},5)!;
  const before=offerFor(config,null,new Date('2026-11-01T00:00:00Z'));
  assert.deepEqual(before,{kind:'campaign',percent:40,months:3,regularUsd:5,priceUsd:3,endsAt:'2026-11-30T23:59:00.000Z'});
  assert.equal(offerFor(config,null,new Date('2026-11-30T23:59:00Z')),null,'en el instante del vencimiento ya no vale');
  assert.equal(offerFor(config,new Date('2026-01-01'),new Date('2026-12-01T00:00:00Z')),null);
});

test('la bienvenida corre desde el alta de cada cuenta y no alcanza a visitantes',()=>{
  const config=parseOffer({...base,DIAGRAMIA_OFFER_WELCOME_HOURS:'48'},5)!;
  const createdAt=new Date('2026-10-10T12:00:00Z');
  const inside=offerFor(config,createdAt,new Date('2026-10-12T11:59:59Z'));
  assert.equal(inside?.kind,'welcome');assert.equal(inside?.endsAt,'2026-10-12T12:00:00.000Z');
  assert.equal(offerFor(config,createdAt,new Date('2026-10-12T12:00:00Z')),null);
  assert.equal(offerFor(config,null,new Date('2026-10-10T13:00:00Z')),null,'un visitante sin cuenta no tiene ventana de bienvenida');
});

test('con campaña y bienvenida vigentes se muestra la que vence más tarde',()=>{
  const config=parseOffer({...base,DIAGRAMIA_OFFER_ENDS_AT:'2026-10-20T00:00:00Z',DIAGRAMIA_OFFER_WELCOME_HOURS:'72'},5)!;
  const now=new Date('2026-10-11T00:00:00Z');
  assert.equal(offerFor(config,new Date('2026-10-10T00:00:00Z'),now)?.kind,'campaign');
  assert.equal(offerFor(config,new Date('2026-10-19T00:00:00Z'),new Date('2026-10-19T12:00:00Z'))?.kind,'welcome');
});
