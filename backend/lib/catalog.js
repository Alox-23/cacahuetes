export const interests = ['arte', 'historia', 'gastronomia', 'naturaleza', 'compras', 'familia'];

export const starts = {
  naranjos: { name: 'Plaza de los Naranjos', lat: 36.51075, lon: -4.88625 },
  alameda: { name: 'Parque de la Alameda', lat: 36.50855, lon: -4.88718 },
  marina: { name: 'Puerto Deportivo de Marbella', lat: 36.50694, lon: -4.88923 },
  banus: { name: 'Puerto Banús', lat: 36.48759, lon: -4.95199 }
};

// Puntos para mapa y duraciones orientativas. La afluencia base se desconoce.
export const places = [
  { id: 'naranjos', ...starts.naranjos, area: 'Casco antiguo',
    tags: ['historia', 'gastronomia'], visitMinutes: 20, budget: 'gratis', stairs: false,
    description: 'Plaza porticada del casco antiguo con naranjos y edificios históricos. El paseo por la plaza es gratuito.' },
  { id: 'encarnacion', name: 'Plaza de la Iglesia de la Encarnación', area: 'Casco antiguo', lat: 36.51058, lon: -4.88511,
    tags: ['historia', 'arte'], visitMinutes: 15, budget: 'gratis', stairs: false,
    description: 'Parada exterior para ver la portada de piedra de la iglesia desde la plaza.' },
  { id: 'grabado', name: 'Museo del Grabado Español Contemporáneo', area: 'Casco antiguo', lat: 36.51060, lon: -4.88457,
    tags: ['arte', 'historia'], visitMinutes: 40, budget: 'bajo', stairs: true,
    description: 'Colección de estampas y grabados en el antiguo Hospital Bazán.' },
  { id: 'muralla', name: 'Muralla del castillo de Marbella', area: 'Casco antiguo', lat: 36.51090, lon: -4.88470,
    tags: ['historia', 'familia'], visitMinutes: 15, budget: 'gratis', stairs: false,
    description: 'Tramo exterior de las antiguas defensas de la ciudad, visible desde el casco histórico.' },
  { id: 'trinidad', name: 'Plaza del Santo Cristo', area: 'Barrio Alto', lat: 36.51250, lon: -4.88623,
    tags: ['historia', 'arte'], visitMinutes: 12, budget: 'gratis', stairs: false,
    description: 'Plaza del Barrio Alto con la ermita del Santo Cristo de la Vera Cruz. El acceso al barrio tiene cuestas.' },
  { id: 'mercado-central', name: 'Mercado Municipal de Marbella', area: 'Casco antiguo', lat: 36.51209, lon: -4.88823,
    tags: ['gastronomia', 'compras'], visitMinutes: 25, budget: 'bajo', stairs: false,
    description: 'Mercado de abastos con puestos de pescado, fruta y productos de proximidad.' },
  { id: 'alameda', ...starts.alameda, area: 'Centro',
    tags: ['naturaleza', 'familia'], visitMinutes: 15, budget: 'gratis', stairs: false,
    description: 'Jardín céntrico con árboles de sombra, bancos de cerámica y una fuente.' },
  { id: 'avenida-mar', name: 'Avenida del Mar', area: 'Centro', lat: 36.50775, lon: -4.88670,
    tags: ['arte', 'familia'], visitMinutes: 15, budget: 'gratis', stairs: false,
    description: 'Paseo peatonal con esculturas al aire libre entre la Alameda y la costa.' },
  { id: 'constitucion', name: 'Parque de la Constitución', area: 'Centro oeste', lat: 36.50758, lon: -4.89450,
    tags: ['naturaleza', 'familia'], visitMinutes: 25, budget: 'gratis', stairs: false,
    description: 'Parque con senderos y un auditorio al aire libre cerca del paseo marítimo.' },
  { id: 'marina', ...starts.marina, area: 'Puerto Deportivo',
    tags: ['naturaleza', 'gastronomia', 'familia'], visitMinutes: 25, budget: 'gratis', stairs: false,
    description: 'Paseo exterior por el puerto deportivo, con terrazas junto al agua. Las consumiciones se pagan aparte.' },
  { id: 'fontanilla', name: 'Playa de la Fontanilla', area: 'Paseo marítimo oeste', lat: 36.50662, lon: -4.89552,
    tags: ['naturaleza', 'familia'], visitMinutes: 25, budget: 'gratis', stairs: false,
    description: 'Tramo del paseo marítimo frente a la playa, con vistas a la costa.' },
  { id: 'bajadilla', name: 'Playa de la Bajadilla', area: 'Paseo marítimo este', lat: 36.50615, lon: -4.87934,
    tags: ['naturaleza', 'familia'], visitMinutes: 25, budget: 'gratis', stairs: false,
    description: 'Paseo costero junto a la playa y cerca del puerto pesquero.' },
  { id: 'banus', ...starts.banus, area: 'Puerto Banús',
    tags: ['compras', 'gastronomia', 'familia'], visitMinutes: 35, budget: 'gratis', stairs: false,
    description: 'Paseo junto a los amarres, escaparates y terrazas. La ruta contempla la visita exterior.' },
  { id: 'playa-rio-verde', name: 'Playa Río Verde', area: 'Puerto Banús este', lat: 36.49218, lon: -4.94275,
    tags: ['naturaleza', 'familia'], visitMinutes: 25, budget: 'gratis', stairs: false,
    description: 'Tramo costero al este de Puerto Banús para pasear junto a la playa.' },
  { id: 'playa-duque', name: 'Playa del Duque', area: 'Puerto Banús oeste', lat: 36.48542, lon: -4.95764,
    tags: ['naturaleza', 'familia'], visitMinutes: 25, budget: 'gratis', stairs: false,
    description: 'Parada en la costa al oeste de la marina de Puerto Banús.' }
];

const crowdedInDemo = new Set(['naranjos', 'alameda', 'avenida-mar', 'mercado-central', 'banus']);

export function listPlaces(scenario) {
  const partners = new Set((process.env.PARTNER_PLACE_IDS ?? '').split(',').map((value) => value.trim()));
  return places.map((place) => ({
    ...place,
    sponsored: partners.has(place.id),
    crowd: scenario === 'busy-centre' && crowdedInDemo.has(place.id) ? 'alta' : 'desconocida'
  }));
}
