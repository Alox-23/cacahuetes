// Spanish templates of the agent (feature 5 §4.7): the degraded-mode reply and the narration fallback.
// Pure functions over the turn's events and the resulting route.
import { clock, minutes } from './trip-contract.js';

export const noRoute = 'No hay ninguna ruta en marcha; crea una primero.';
export const notUnderstood = 'No he entendido qué ruta quieres. Cuéntame cuánto tiempo tienes, desde dónde sales y qué te apetece.';
export const notUnderstoodChange = 'No he entendido qué quieres cambiar.';
export const outOfScope = 'Cacahuete prepara rutas exclusivamente por Marbella. ¿Quieres planear una aquí?';
const answeredFallback = 'Ahora mismo no puedo responder a eso. Puedo prepararte una ruta o cambiar la que tienes.';

const changes = {
  add_stop: 'He añadido una parada a la ruta.',
  remove_stop: 'He quitado una parada de la ruta.',
  replace_stop: 'He cambiado una parada por otra.',
  lock_stop: 'He cambiado qué paradas quedan fijadas.',
  reschedule: 'He cambiado el horario de la ruta.',
  menos_caminar: 'He cambiado los trayectos largos a pie por transporte público.',
  mas_comida: 'He añadido una parada para comer.',
  mas_barato: 'He buscado una alternativa más barata.',
  anadir_pausa: 'He añadido una pausa para café.'
};

/** "HH:MM" when the last stop ends. */
export function routeEnd(route) {
  const last = route.stops.at(-1);
  return last ? clock(minutes(last.arrive) + last.visitMinutes) : route.request.timeWindow.to;
}

const stopsLabel = n => (n === 1 ? '1 parada' : `${n} paradas`);
const routeLine = route => `${stopsLabel(route.stops.length)} de ${route.stops[0]?.arrive ?? route.request.timeWindow.from} a ${routeEnd(route)}`;

/** One sentence per event, then the state of the route when it changed. */
export function describe(events, route) {
  const sentences = [];
  let changed = false;
  for (const event of events) {
    if (event.type === 'route_created' && route) {
      sentences.push(`Ruta creada: ${route.name}, ${routeLine(route)}.`);
      if (event.assumptions.length) sentences.push(`He supuesto: ${event.assumptions.join(', ')}.`);
    } else if (event.type === 'route_changed') {
      sentences.push(changes[event.change] ?? 'He cambiado la ruta.');
      changed = true;
    } else if (event.type === 'undone') {
      sentences.push('He deshecho el último cambio.');
      changed = true;
    } else if (event.type === 'preferences_updated') {
      sentences.push('He guardado tus preferencias.');
    } else if (event.type === 'rejected') {
      sentences.push(event.reason);
    } else if (event.type === 'answered') {
      sentences.push(answeredFallback);
    }
  }
  if (changed && route && !events.some(e => e.type === 'route_created')) sentences.push(`Ahora son ${routeLine(route)}.`);
  return sentences.join(' ') || notUnderstood;
}

/** Default chips by state when the narrator gave none. */
export function suggestionsFor(events, route) {
  if (route) return ['Menos caminar', 'Añade una pausa para café', 'Guardar la ruta'];
  return ['Tengo 3 horas y me gusta la historia', 'Una ruta de tapas por el casco antiguo', 'Un paseo por la playa esta tarde'];
}
