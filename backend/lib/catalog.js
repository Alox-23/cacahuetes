import points from './marbella.json' with { type: 'json' };

export const interests = ['arte', 'historia', 'gastronomia', 'naturaleza', 'compras', 'familia'];

export const places = points;
export const starts = Object.fromEntries(
  ['naranjos', 'alameda', 'marina', 'banus'].map(id => {
    const { name, lat, lon } = places.find(place => place.id === id);
    return [id, { name, lat, lon }];
  })
);

const crowdedInDemo = new Set(['naranjos', 'alameda', 'avenida-mar', 'mercado-central', 'banus']);

export function listPlaces(scenario) {
  const partners = new Set((process.env.PARTNER_PLACE_IDS ?? '').split(',').map((value) => value.trim()));
  return places.map((place) => ({
    ...place,
    sponsored: partners.has(place.id),
    crowd: scenario === 'busy-centre' && crowdedInDemo.has(place.id) ? 'alta' : 'desconocida'
  }));
}
