import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrip, quickText, refineTrip, resolvePlace } from '../lib/trip-planner.js';
import { defaults, tripRequest } from '../lib/trip-contract.js';

const request = (from = '10:00', to = '13:00') => tripRequest({
  city: 'Marbella', date: '2026-12-10', timeWindow: { from, to }, start: { label: 'Plaza de los Naranjos' }, mustInclude: []
});
const end = route => {
  const last = route.stops.at(-1);
  const [h, m] = last.arrive.split(':').map(Number);
  return h * 60 + m + last.visitMinutes;
};

test('resolvePlace: id, nombre y alias del catálogo, con la pausa y sin inventar', () => {
  assert.equal(resolvePlace('muralla').id, 'muralla');
  assert.equal(resolvePlace('La Muralla').id, 'muralla');
  assert.equal(resolvePlace('Museo del Grabado Español Contemporáneo').id, 'grabado');
  assert.equal(resolvePlace('Puerto Banus').id, 'banus');
  assert.equal(resolvePlace('pausa').id, 'marbella-cafe');
  assert.equal(resolvePlace('Pausa para café').id, 'marbella-cafe');
  assert.equal(resolvePlace('Sagrada Familia'), null);
  assert.equal(resolvePlace(''), null);
  assert.equal(resolvePlace(42), null);
  assert.ok(quickText.menos_caminar.test('quiero caminar menos'));
});

test('add_stop: mejor hueco, posición explícita, duplicados y desbordes', () => {
  const route = createTrip(request('10:00', '15:00'), defaults, false);
  const best = refineTrip(structuredClone(route), { type: 'add_stop', placeId: 'muralla' }, defaults);
  assert.equal(best.stops.length, route.stops.length + 1);
  assert.ok(best.stops.some(s => s.placeId === 'muralla'));
  assert.equal(best.version, route.version + 1);
  // Best fit: no other index ends earlier.
  for (let position = 1; position <= route.stops.length + 1; position++) {
    try {
      const other = refineTrip(structuredClone(route), { type: 'add_stop', placeId: 'muralla', position }, defaults);
      assert.ok(end(best) <= end(other));
    } catch (error) {
      assert.match(error.message, /franja/);
    }
  }
  const first = refineTrip(structuredClone(route), { type: 'add_stop', placeId: 'muralla', position: 1 }, defaults);
  assert.equal(first.stops[0].placeId, 'muralla');
  assert.throws(() => refineTrip(structuredClone(route), { type: 'add_stop', placeId: route.stops[0].placeId }, defaults), /ya está/);
  assert.throws(() => refineTrip(structuredClone(route), { type: 'add_stop', placeId: 'muralla', position: 9 }, defaults), /posición/);
  assert.throws(() => refineTrip(structuredClone(route), { type: 'add_stop', placeId: 'sagrada' }, defaults), /catálogo/);

  const short = createTrip(request('10:00', '10:40'), defaults, false);
  assert.throws(() => refineTrip(structuredClone(short), { type: 'add_stop', placeId: 'playa-rio-verde' }, defaults),
    /El cambio no cabe en la franja horaria/);

  // A locked stop keeps its index: the new one goes after it.
  const locked = refineTrip(structuredClone(route), { type: 'lock_stop', order: 2 }, defaults);
  assert.throws(() => refineTrip(structuredClone(locked), { type: 'add_stop', placeId: 'muralla', position: 1 }, defaults), /fijada/);
  const after = refineTrip(structuredClone(locked), { type: 'add_stop', placeId: 'muralla' }, defaults);
  assert.equal(after.stops[1].placeId, locked.stops[1].placeId);
});

test('reschedule: cambia la franja, recorta desde el final y renombra', () => {
  const route = createTrip(request('10:00', '13:00'), defaults, false);
  assert.equal(route.name, 'Marbella en 3 horas');
  const later = refineTrip(structuredClone(route), { type: 'reschedule', timeWindow: { from: '16:00', to: '19:00' }, date: '2026-12-11' }, defaults);
  assert.equal(later.stops[0].arrive.slice(0, 2), '16');
  assert.equal(later.request.date, '2026-12-11');
  assert.equal(later.stops.length, route.stops.length);
  assert.equal(later.version, route.version + 1);

  const shorter = refineTrip(structuredClone(route), { type: 'reschedule', timeWindow: { from: '10:00', to: '10:45' } }, defaults);
  assert.equal(shorter.name, 'Marbella en 45 min');
  assert.ok(shorter.stops.length >= 1 && shorter.stops.length < route.stops.length);
  assert.deepEqual(shorter.stops.map(s => s.placeId), route.stops.slice(0, shorter.stops.length).map(s => s.placeId));
  assert.ok(end(shorter) <= 10 * 60 + 45);

  assert.throws(() => refineTrip(structuredClone(route), { type: 'reschedule', timeWindow: { from: '10:00', to: '10:05' } }, defaults),
    /no cabe/);
  assert.throws(() => refineTrip(structuredClone(route), { type: 'reschedule', timeWindow: { from: '12:00', to: '11:00' } }, defaults),
    /franja horaria válida/);
  assert.throws(() => refineTrip(structuredClone(route), { type: 'reschedule', date: '2026-02-30' }, defaults), /fecha/);

  // Locked stops are never dropped.
  const lastOrder = route.stops.at(-1).order;
  const locked = refineTrip(structuredClone(route), { type: 'lock_stop', order: lastOrder }, defaults);
  const kept = refineTrip(structuredClone(locked), { type: 'reschedule', timeWindow: { from: '10:00', to: '11:30' } }, defaults);
  assert.ok(kept.stops.some(s => s.placeId === route.stops.at(-1).placeId));
});
