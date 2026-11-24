import { places } from '../lib/catalog.js';
import { stopFeatures, walkingMinutes } from '../lib/route-features.js';

// Origin, time left, requested interests, interests already visited, preferred and alternate stop.
// In each comparison both visits fit. These are editorial examples for the demo.
const training = [
  ['alameda', 45, ['naturaleza'], [], 'alameda', 'fontanilla'],
  ['naranjos', 75, ['arte', 'historia'], [], 'encarnacion', 'avenida-mar'],
  ['alameda', 60, ['gastronomia', 'compras'], [], 'mercado-central', 'naranjos'],
  ['marina', 90, ['naturaleza', 'familia'], [], 'marina', 'bajadilla'],
  ['naranjos', 60, ['historia', 'arte'], ['historia'], 'trinidad', 'muralla'],
  ['avenida-mar', 90, ['arte', 'familia'], [], 'avenida-mar', 'constitucion'],
  ['banus', 60, ['naturaleza'], [], 'playa-duque', 'playa-rio-verde'],
  ['mercado-central', 65, ['compras', 'historia'], ['compras'], 'naranjos', 'mercado-central'],
  ['alameda', 80, ['arte', 'naturaleza'], ['naturaleza'], 'avenida-mar', 'alameda'],
  ['constitucion', 60, ['familia'], [], 'constitucion', 'alameda'],
  ['naranjos', 60, ['gastronomia'], [], 'naranjos', 'marina'],
  ['muralla', 70, ['historia', 'arte'], ['historia'], 'encarnacion', 'naranjos']
];
const evaluation = [
  ['grabado', 60, ['arte', 'historia'], [], 'encarnacion', 'muralla'],
  ['fontanilla', 55, ['naturaleza'], [], 'fontanilla', 'alameda'],
  ['alameda', 70, ['compras', 'naturaleza'], ['naturaleza'], 'mercado-central', 'constitucion'],
  ['marina', 65, ['familia', 'arte'], [], 'avenida-mar', 'fontanilla']
];

export function trainRanking() {
  const byId = new Map(places.map(place => [place.id, place]));
  function difference([origin, minutes, interests, covered, winner, other]) {
    const features = [winner, other].map(id => {
      const place = byId.get(id);
      const walk = walkingMinutes(byId.get(origin), place, 'normal');
      if (walk + place.visitMinutes > minutes) throw new Error(`La visita de entrenamiento no cabe: ${id}`);
      return stopFeatures(place, interests, new Set(covered), walk, minutes);
    });
    return features[0].map((value, i) => value - features[1][i]);
  }
  const weights = [0, 0, 0];
  const score = row => row.reduce((sum, value, i) => sum + value * weights[i], 0);
  const rows = training.map(difference);
  for (let epoch = 0; epoch < 300; epoch++) {
    for (const row of rows) {
      const error = 1 / (1 + Math.exp(score(row)));
      row.forEach((value, i) => { weights[i] += 0.1 * (value * error - 0.001 * weights[i]); });
    }
  }
  return { weights, examples: rows.length, heldOut: evaluation.length, correct: evaluation.map(difference).filter(row => score(row) > 0).length };
}
