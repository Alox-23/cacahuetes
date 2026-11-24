// Sample destinations and estimated legs from alex-frontend, frontend/src/data/catalog.ts.
const city = (name, places, legs) => ({ name, places, legs });

const barcelona = city(
  'Barcelona',
  [
    { id: 'bcn-sagrada-familia', name: 'Sagrada Família', categories: ['arquitectura', 'historia'], why: 'La obra maestra de Gaudí, imprescindible por dentro y por fuera.', kind: 'sight', visitMinutes: 90, paid: true, aliases: ['sagrada familia', 'sagrada'], order: 1 },
    { id: 'bcn-casa-batllo', name: 'Casa Batlló', categories: ['arquitectura', 'museos'], why: 'Fachada modernista única en el paseo de Gràcia.', kind: 'sight', visitMinutes: 60, paid: true, aliases: ['casa batllo', 'batllo'], order: 2 },
    { id: 'bcn-boqueria', name: 'Mercat de la Boqueria', categories: ['gastronomia', 'compras'], why: 'El mercado más famoso de la ciudad, junto a la Rambla.', kind: 'sight', visitMinutes: 60, paid: false, aliases: ['boqueria', 'mercat de la boqueria'], order: 3 },
    { id: 'bcn-bar-del-pla', name: 'Bar del Pla', categories: ['gastronomia'], why: 'Tapas de temporada en el Born.', kind: 'food', visitMinutes: 45, paid: true, aliases: ['bar del pla', 'tapas'], order: 4 },
    { id: 'bcn-barri-gotic', name: 'Barri Gòtic', categories: ['historia', 'arquitectura'], why: 'Callejuelas medievales, la catedral y plazas escondidas.', kind: 'sight', visitMinutes: 45, paid: false, aliases: ['barri gotic', 'barrio gotico', 'gotico'], order: 5, kids: true },
    { id: 'bcn-museu-picasso', name: 'Museu Picasso', categories: ['museos', 'arte_urbano'], why: 'La colección más completa de los años de formación de Picasso.', kind: 'sight', visitMinutes: 60, paid: true, aliases: ['museu picasso', 'museo picasso', 'picasso'], order: 6 },
    { id: 'bcn-cal-pep', name: 'Cal Pep', categories: ['gastronomia'], why: 'Barra clásica de pescado y marisco.', kind: 'food', visitMinutes: 45, paid: true, aliases: ['cal pep'], order: 6.5 },
    { id: 'bcn-ciutadella', name: 'Parc de la Ciutadella', categories: ['naturaleza'], why: 'Un respiro verde con lago y cascada monumental.', kind: 'sight', visitMinutes: 45, paid: false, aliases: ['ciutadella', 'ciudadela', 'parc de la ciutadella'], order: 7, kids: true },
    { id: 'bcn-cafe', name: "Pausa para café", categories: ['gastronomia'], why: 'Un café tranquilo para recargar.', kind: 'pause', visitMinutes: 20, paid: true, aliases: [], order: 99 },
  ],
  {
    'bcn-sagrada-familia|bcn-casa-batllo': { walk: 30, transit: 10 },
    'bcn-casa-batllo|bcn-boqueria': { walk: 20, transit: 10 },
    'bcn-boqueria|bcn-bar-del-pla': { walk: 15, transit: 8 },
    'bcn-boqueria|bcn-barri-gotic': { walk: 10, transit: 6 },
    'bcn-barri-gotic|bcn-bar-del-pla': { walk: 8, transit: 6 },
    'bcn-bar-del-pla|bcn-museu-picasso': { walk: 5, transit: 5 },
    'bcn-museu-picasso|bcn-ciutadella': { walk: 10, transit: 6 },
    'bcn-barri-gotic|bcn-museu-picasso': { walk: 8, transit: 6 },
    'bcn-sagrada-familia|bcn-barri-gotic': { walk: 35, transit: 15 },
    'bcn-casa-batllo|bcn-barri-gotic': { walk: 22, transit: 10 },
    'bcn-barri-gotic|bcn-ciutadella': { walk: 15, transit: 8 },
  },
)

const valencia = city(
  'Valencia',
  [
    { id: 'vlc-barrio-carmen', name: 'Barrio del Carmen', categories: ['historia', 'arte_urbano'], why: 'Casco antiguo con murales y torres medievales.', kind: 'sight', visitMinutes: 45, paid: false, aliases: ['barrio del carmen', 'el carmen'], order: 1 },
    { id: 'vlc-catedral', name: 'Catedral y Miguelete', categories: ['historia', 'arquitectura'], why: 'Sube al Miguelete para ver toda la ciudad.', kind: 'sight', visitMinutes: 45, paid: true, aliases: ['catedral', 'miguelete'], order: 2 },
    { id: 'vlc-mercado-central', name: 'Mercado Central', categories: ['gastronomia', 'compras', 'arquitectura'], why: 'Modernismo valenciano lleno de producto local.', kind: 'sight', visitMinutes: 45, paid: false, aliases: ['mercado central'], order: 3, kids: true },
    { id: 'vlc-horchateria', name: 'Horchatería Santa Catalina', categories: ['gastronomia'], why: 'Horchata y fartons de toda la vida.', kind: 'food', visitMinutes: 30, paid: true, aliases: ['horchateria', 'horchata'], order: 3.5, kids: true },
    { id: 'vlc-turia', name: 'Jardín del Turia', categories: ['naturaleza'], why: 'Un parque de nueve kilómetros en el antiguo cauce del río.', kind: 'sight', visitMinutes: 60, paid: false, aliases: ['turia', 'jardin del turia'], order: 4, kids: true },
    { id: 'vlc-ciudad-artes', name: 'Ciudad de las Artes y las Ciencias', categories: ['arquitectura', 'museos'], why: 'La Valencia futurista de Calatrava.', kind: 'sight', visitMinutes: 120, paid: true, aliases: ['ciudad de las artes', 'ciutat de les arts'], order: 5, kids: true },
    { id: 'vlc-oceanografic', name: 'Oceanogràfic', categories: ['naturaleza', 'museos'], why: 'El acuario más grande de Europa.', kind: 'sight', visitMinutes: 150, paid: true, aliases: ['oceanografic', 'acuario'], order: 6, kids: true },
    { id: 'vlc-la-pepica', name: 'La Pepica', categories: ['gastronomia'], why: 'Paella frente a la playa de la Malvarrosa.', kind: 'food', visitMinutes: 60, paid: true, aliases: ['la pepica', 'paella'], order: 7, kids: true },
    { id: 'vlc-cafe', name: "Pausa para café", categories: ['gastronomia'], why: 'Un café tranquilo para recargar.', kind: 'pause', visitMinutes: 20, paid: true, aliases: [], order: 99 },
  ],
  {
    'vlc-barrio-carmen|vlc-catedral': { walk: 8, transit: 6 },
    'vlc-catedral|vlc-mercado-central': { walk: 8, transit: 6 },
    'vlc-mercado-central|vlc-turia': { walk: 15, transit: 8 },
    'vlc-turia|vlc-ciudad-artes': { walk: 25, transit: 12 },
    'vlc-ciudad-artes|vlc-oceanografic': { walk: 10, transit: 6 },
    'vlc-oceanografic|vlc-la-pepica': { walk: 40, transit: 20 },
    'vlc-mercado-central|vlc-ciudad-artes': { walk: 35, transit: 15 },
  },
)

const sevilla = city(
  'Sevilla',
  [
    { id: 'svq-setas', name: 'Metropol Parasol', categories: ['arquitectura', 'arte_urbano'], why: 'Las Setas: madera y vistas sobre los tejados.', kind: 'sight', visitMinutes: 30, paid: true, aliases: ['setas', 'metropol parasol'], order: 1 },
    { id: 'svq-catedral', name: 'Catedral y Giralda', categories: ['historia', 'arquitectura'], why: 'La catedral gótica más grande del mundo.', kind: 'sight', visitMinutes: 75, paid: true, aliases: ['catedral', 'giralda'], order: 2 },
    { id: 'svq-alcazar', name: 'Real Alcázar', categories: ['historia', 'arquitectura', 'naturaleza'], why: 'Palacios mudéjares y jardines de cuento.', kind: 'sight', visitMinutes: 90, paid: true, aliases: ['alcazar', 'real alcazar'], order: 3 },
    { id: 'svq-santa-cruz', name: 'Barrio de Santa Cruz', categories: ['historia'], why: 'La antigua judería, blanca y laberíntica.', kind: 'sight', visitMinutes: 40, paid: false, aliases: ['santa cruz', 'barrio de santa cruz'], order: 4, kids: true },
    { id: 'svq-bodega', name: 'Bodega Santa Cruz', categories: ['gastronomia'], why: 'Tapas de pie, como manda la tradición.', kind: 'food', visitMinutes: 40, paid: true, aliases: ['bodega santa cruz', 'tapas'], order: 4.5 },
    { id: 'svq-maria-luisa', name: 'Parque de María Luisa', categories: ['naturaleza'], why: 'Sombra, fuentes y glorietas.', kind: 'sight', visitMinutes: 40, paid: false, aliases: ['maria luisa', 'parque de maria luisa'], order: 5, kids: true },
    { id: 'svq-plaza-espana', name: 'Plaza de España', categories: ['arquitectura', 'historia'], why: 'Cerámica, canales y puentes de 1929.', kind: 'sight', visitMinutes: 45, paid: false, aliases: ['plaza de espana'], order: 6, kids: true },
    { id: 'svq-triana', name: 'Triana', categories: ['gastronomia', 'historia', 'vida_nocturna'], why: 'Al otro lado del río: cerámica, mercado y flamenco.', kind: 'sight', visitMinutes: 45, paid: false, aliases: ['triana'], order: 7 },
    { id: 'svq-cafe', name: "Pausa para café", categories: ['gastronomia'], why: 'Un café tranquilo para recargar.', kind: 'pause', visitMinutes: 20, paid: true, aliases: [], order: 99 },
  ],
  {
    'svq-setas|svq-catedral': { walk: 15, transit: 8 },
    'svq-catedral|svq-alcazar': { walk: 5, transit: 5 },
    'svq-alcazar|svq-santa-cruz': { walk: 5, transit: 5 },
    'svq-santa-cruz|svq-maria-luisa': { walk: 15, transit: 8 },
    'svq-maria-luisa|svq-plaza-espana': { walk: 5, transit: 5 },
    'svq-plaza-espana|svq-triana': { walk: 25, transit: 12 },
    'svq-santa-cruz|svq-bodega': { walk: 3, transit: 3 },
  },
)


const generic = [
    { id: 'gen-centro', name: "Centro histórico", categories: ['historia', 'arquitectura'], why: "Un básico para conocer la ciudad.", kind: 'sight', visitMinutes: 60, paid: false, aliases: [], order: 1, kids: true },
    { id: 'gen-mercado', name: "Mercado central", categories: ['gastronomia', 'compras'], why: "Un básico para conocer la ciudad.", kind: 'sight', visitMinutes: 45, paid: false, aliases: [], order: 2, kids: true },
    { id: 'gen-mirador', name: "Mirador", categories: ['naturaleza', 'arquitectura'], why: "Un básico para conocer la ciudad.", kind: 'sight', visitMinutes: 45, paid: true, aliases: [], order: 3 },
    { id: 'gen-parque', name: "Parque principal", categories: ['naturaleza'], why: "Un básico para conocer la ciudad.", kind: 'sight', visitMinutes: 45, paid: false, aliases: [], order: 4, kids: true },
    { id: 'gen-restaurante', name: "Restaurante local", categories: ['gastronomia'], why: "Un básico para conocer la ciudad.", kind: 'food', visitMinutes: 60, paid: true, aliases: [], order: 2.5 },
    { id: 'gen-cafe', name: "Pausa para café", categories: ['gastronomia'], why: "Un básico para conocer la ciudad.", kind: 'pause', visitMinutes: 20, paid: true, aliases: [], order: 99 },
  ]

export const sampleCities = [barcelona, valencia, sevilla];
export const genericPlaces = generic;
