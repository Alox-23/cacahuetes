// Synthetic requests for the demo. Keep the evaluation phrases separate from the training inputs.
export const examples = {
  arte: [
    'ver una exposición de pintura', 'visitar una galería', 'me gustan los cuadros',
    'buscar esculturas al aire libre', 'quiero ver murales', 'pasar por museos de arte',
    'una muestra fotográfica', 'obras de artistas locales', 'el arte contemporáneo',
    'ver grabados', 'me interesa el diseño y la pintura', 'admirar lienzos',
    'ver cerámica artística', 'galerías y exposiciones', 'un sitio con obras abstractas',
    'ver arte urbano', 'busco una colección de arte', 'pinturas de artistas andaluces'
  ],
  historia: [
    'quiero visitar la muralla', 'conocer el pasado de la ciudad', 'ver arquitectura antigua',
    'aprender sobre el castillo', 'hacer un recorrido por monumentos', 'buscar edificios históricos',
    'visitar las iglesias antiguas', 'conocer el patrimonio local', 'ver restos medievales',
    'me interesan las ruinas', 'escuchar historias del casco viejo', 'seguir huellas romanas',
    'ver construcciones de otra época', 'pasear por fortalezas antiguas', 'visitar yacimientos',
    'conocer la historia de Marbella', 'leer sobre las antiguas civilizaciones', 'fachadas centenarias'
  ],
  gastronomia: [
    'salir de tapas', 'probar comida típica', 'me gustaría comer pescado',
    'algo para merendar', 'probar platos malagueños', 'ir a un bar de pinchos',
    'beber un café y desayunar', 'me apetece un helado', 'dónde almorzar',
    'sitios para cenar', 'probar el pescaíto frito', 'cocina tradicional andaluza',
    'ir a un restaurante', 'buscar una churrería', 'quiero comer algo rico',
    'probar espetos', 'tomar un postre', 'ruta de gastronomía y productos típicos'
  ],
  naturaleza: [
    'pasear entre árboles', 'buscar un parque para pasear', 'caminar por un jardín',
    'ver la costa y el mar', 'pasar por la playa', 'me apetece ver espacios verdes',
    'respirar aire fresco entre plantas', 'un paseo rodeado de naturaleza', 'ver dunas',
    'disfrutar del paisaje natural', 'buscar flora local', 'recorrer un camino costero',
    'me gusta el senderismo', 'paseo junto al agua', 'ver aves y vegetación',
    'mirar el litoral', 'visitar jardines con sombra', 'un rato de playa y sombra'
  ],
  compras: [
    'comprar un recuerdo', 'buscar tiendas de artesanía', 'llevarme un souvenir',
    'mirar escaparates', 'hacer unas compras', 'una tienda de regalos',
    'comprar una camiseta', 'buscar puestos de artesanos', 'comprar un imán',
    'ir de tiendas', 'quiero comprar ropa', 'encontrar boutiques',
    'buscar un bolso de recuerdo', 'ver tiendas pequeñas', 'encontrar joyería local',
    'una ruta de tiendas', 'necesito comprar regalos', 'sitios para comprar artesanía'
  ],
  familia: [
    'voy con mis hijos pequeños', 'planes para toda la familia', 'vamos con niños',
    'un plan apto para críos', 'cosas para hacer con peques', 'actividades infantiles',
    'viajamos con dos menores', 'algo que entretenga a los niños', 'tengo hijos de cinco años',
    'venimos con un bebé', 'un sitio para pasar el rato en familia', 'salimos con los peques',
    'mi hija pequeña viene conmigo', 'buscamos un plan familiar', 'viajo con mis sobrinos pequeños',
    'llevamos un carrito de bebé', 'actividades para niños', 'vengo con toda la familia'
  ]
};

export const neutral = [
  'hola', 'buenas tardes', 'gracias por la ayuda', 'no lo sé todavía', 'me da igual',
  'tengo una hora y media', 'desde la plaza de los Naranjos', 'me quedan treinta minutos',
  'ahora estamos en Puerto Banús', 'quiero un plan gratis', 'prefiero evitar las escaleras',
  'vamos despacio', 'no quiero aglomeraciones', 'empiezo en la Alameda',
  'tengo cuarenta minutos libres', 'no sé dónde estoy', 'unos noventa minutos',
  'por favor más cerca', 'quiero la opción rápida', 'queremos evitar colas',
  'no importa el presupuesto', 'desde el puerto deportivo', 'dame otra opción',
  'empezamos en la estación', 'hoy tenemos dos horas', 'no tengo mucho tiempo',
  '¿qué puedes hacer?', 'estoy a cinco minutos del centro', 'dime dónde empieza'
];

export const evaluation = [
  ['quiero contemplar una pinacoteca llena de pinturas', ['arte']],
  ['me llaman la atención los lienzos y las galerías de artistas', ['arte']],
  ['quisiera explorar iglesias y vestigios medievales', ['historia']],
  ['quiero aprender de épocas pasadas a través de la arquitectura', ['historia']],
  ['buscamos dónde comer unas raciones de pescado', ['gastronomia']],
  ['algún lugar para tomar café con un dulce', ['gastronomia']],
  ['me gustaría acercarme al litoral para ver las dunas', ['naturaleza']],
  ['me apetece caminar por un parque lleno de vegetación', ['naturaleza']],
  ['busco un obsequio y unas tiendas de artesanos', ['compras']],
  ['dónde se pueden comprar recuerdos para llevar a casa', ['compras']],
  ['vamos con nuestros hijos y queremos algo que los entretenga', ['familia']],
  ['viajamos con un bebé y un niño de seis años', ['familia']],
  ['me apetece ver obras de arte y después cenar', ['arte', 'gastronomia']],
  ['quiero ver ruinas medievales y comprar un recuerdo', ['historia', 'compras']],
  ['salimos con los niños y queremos caminar entre árboles', ['familia', 'naturaleza']],
  ['me gustaría merendar y buscar regalos', ['gastronomia', 'compras']],
  ['salimos de la Alameda y tenemos sesenta minutos', []],
  ['solo puedo caminar media hora y despacio', []],
  ['estamos en el centro y hay demasiadas colas', []],
  ['podemos empezar a las cinco y evitar cuestas', []]
];
