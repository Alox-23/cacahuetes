import { isMarbella, localStart } from './marbella-scope.js';
import { badRequest, object } from './http.js';

export const defaults = {
  interests: ['arquitectura', 'gastronomia'], pace: 'equilibrado',
  transport: ['a_pie', 'transporte_publico'], company: 'solo', budget: 'medio', needs: []
};

const choices = {
  pace: ['relajado', 'equilibrado', 'intenso'],
  transport: ['a_pie', 'transporte_publico', 'coche', 'bici'],
  company: ['solo', 'pareja', 'con_ninos', 'grupo'], budget: ['bajo', 'medio', 'alto']
};

export function shortText(value, field, max = 120) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw badRequest(`Revisa ${field}.`);
  return value.trim();
}

function strings(value, field, max = 16) {
  if (!Array.isArray(value) || value.length > max) throw badRequest(`Revisa ${field}.`);
  return [...new Set(value.map(item => shortText(item, field)))];
}

export function preferences(value, partial = false) {
  object(value, 'preferences');
  const result = {};
  for (const field of Object.keys(defaults)) {
    if (partial && !Object.hasOwn(value, field)) continue;
    if (Array.isArray(defaults[field])) {
      const items = strings(value[field], field);
      if (field === 'transport' && items.some(item => !choices.transport.includes(item))) throw badRequest('Transporte desconocido.');
      result[field] = items;
    } else {
      if (!choices[field].includes(value[field])) throw badRequest(`Revisa ${field}.`);
      result[field] = value[field];
    }
  }
  return result;
}

export const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
export const clock = value => [Math.floor(value / 60), value % 60].map(n => String(n).padStart(2, '0')).join(':');

export function tripRequest(raw) {
  object(raw, 'request');
  const city = 'Marbella';
  if (!isMarbella(shortText(raw.city, 'city'))) throw badRequest('Cacahuete prepara rutas exclusivamente por Marbella.');
  const label = localStart(shortText(raw.start?.label, 'start.label', 240));
  if (!label) throw badRequest('Elige un punto de salida del catálogo de Marbella.');
  const date = shortText(raw.date, 'date', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date + 'T12:00:00Z').toJSON()?.slice(0, 10) !== date) {
    throw badRequest('La fecha debe ser un día válido en formato AAAA-MM-DD.');
  }
  const { from, to } = object(raw.timeWindow, 'timeWindow');
  if (![from, to].every(t => typeof t === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t)) || from >= to) {
    throw badRequest('Indica una franja horaria válida dentro del mismo día.');
  }
  return { city, date, timeWindow: { from, to }, start: { label }, mustInclude: strings(raw.mustInclude, 'mustInclude'),
    ...(raw.overrides === undefined ? {} : { overrides: preferences(raw.overrides, true) }) };
}

export function validateRating(raw, stops) {
  object(raw, 'rating');
  if (!Number.isInteger(raw.stars) || raw.stars < 1 || raw.stars > 5) throw badRequest('Elige entre una y cinco estrellas.');
  const votes = object(raw.stops, 'rating.stops');
  const orders = new Set(stops.map(stop => String(stop.order)));
  if (!Object.entries(votes).every(([order, vote]) => orders.has(order) && typeof vote === 'boolean')) {
    throw badRequest('La valoración contiene una parada desconocida.');
  }
  if (raw.comment !== undefined && (typeof raw.comment !== 'string' || raw.comment.length > 2000)) {
    throw badRequest('El comentario puede tener hasta 2000 caracteres.');
  }
  return { stars: raw.stars, stops: votes, ...(raw.comment !== undefined ? { comment: raw.comment } : {}) };
}
