import points from './marbella.json' with { type: 'json' };

const fold = text => String(text ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
const cleanLabel = text => fold(text).replace(/^(?:desde |salgo de )?(?:la |el |los |las )?/, '');
export const isMarbella = city => fold(city) === 'marbella';
export function localStart(label) {
  const key = cleanLabel(label);
  return points.find(p => [p.id, p.name, ...p.aliases.filter(a => a !== 'tapas')].some(a => cleanLabel(a) === key))?.name;
}

// The destination and all itinerary IDs are validated separately against the local catalog.
// This recognises requests for other destinations early enough to explain the scope in chat.
export function asksForAnotherCity(text) {
  const value = fold(text);
  const city = /\b(barcelona|valencia|sevilla|madrid|granada|bilbao|malaga|estepona|mijas|fuengirola|benalmadena|torremolinos|ronda|paris|londres|roma|lisboa|tokio)\b/g;
  for (const match of value.matchAll(city)) {
    const before = value.slice(0, match.index);
    if (/\b(?:vengo|venimos|soy|somos|viajo|viajamos) (?:de|desde)\s+$/.test(before)) continue;
    if (/\b(?:no quiero|en vez de|en lugar de)\s+$/.test(before)) continue;
    if (/marbella\s*[(,]\s*$/.test(before) && match[0] === 'malaga') continue;
    return true;
  }
  const destination = value.match(/\b(?:ruta|recorrido|itinerario|viaje)\s+(?:por|en|a)\s+([^,.;!?]+)/)?.[1];
  if (!destination || /\bmarbella\b/.test(destination)) return false;
  const label = cleanLabel(destination);
  if (/^(?:casco (?:antiguo|historico)|centro|barrio alto|paseo maritimo|costa|playas?|museos?|parques?|calles|sitios|lugares|familia|pareja|grupo|solitario|bici(?:cleta)?|coche|bus|autobus|transporte publico|silla de ruedas|carrito|manana|tarde|noche|mis vacaciones|unas? horas?|\d+ horas?)\b/.test(label)) return false;
  return !points.some(p => [p.name, ...p.aliases].some(alias => label === cleanLabel(alias) || label.startsWith(cleanLabel(alias) + ' ')));
}
