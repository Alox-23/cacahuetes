// Turn fragments written for Cacahuete. Labels describe what this utterance adds.
// Adjacent rows in a conversation can change earlier choices.
export const conversations = [
  [['Estamos en la Alameda', []], ['vamos a paso de tortuga', ['slow']], ['solo planes sin coste', ['free']]],
  [['Vengo caminando desde el puerto', []], ['quiero sentarme a almorzar', ['meal']], ['para comer reservo treinta minutos', ['meal']]],
  [['Tenemos dos horas para pasear', []], ['nos cansamos enseguida', ['slow']], ['necesitamos accesos sin escalones', ['stepFree']]],
  [['Busco esculturas', ['arte']], ['también edificios históricos', ['historia']], ['al final queda media hora', []]],
  [['Voy con dos niños pequeños', ['familia']], ['llevamos un carrito y hacen falta rampas', ['stepFree']], ['un jardín para descansar', ['naturaleza']]],
  [['Queremos probar los sabores de Marbella', ['gastronomia']], ['podemos pagar una entrada barata', ['cheap']], ['mejor algo gratuito', ['free']]],
  [['Primero una galería de grabados', ['arte']], ['luego comprar un regalo', ['compras']], ['preferimos calles poco concurridas', ['quiet']]],
  [['Estamos por Puerto Banús', []], ['hoy nos va la marcha rápida', ['fast']], ['la gente no nos molesta', ['crowdOK']]],
  [['¿Desde dónde se sale?', []], ['plaza de los Naranjos', []], ['mi padre necesita caminar despacito', ['slow']]],
  [['Me interesa el patrimonio', ['historia']], ['podemos subir escalones sin problema', ['stairsOK']], ['evitemos lugares masificados', ['quiet']]],
  [['Salimos del puerto deportivo', []], ['nos sentamos a cenar', ['meal']], ['dejemos la cena para después del paseo', ['skipMeal']]],
  [['¿Qué hay cerca?', []], ['me da igual, sorpréndeme', ['anyInterest']], ['sin gastarme un euro', ['free']]],
  [['Me encanta la vegetación', ['naturaleza']], ['hoy no quiero tiendas', []], ['prefiero ir de tapas', ['gastronomia']]],
  [['Nos quedan 50 minutos', []], ['necesitamos ir a ritmo suave', ['slow']], ['queremos parar para comer juntos', ['meal']]],
  [['Vamos a ver arte urbano', ['arte']], ['no hace falta esquivar las multitudes', ['crowdOK']], ['a paso ligero', ['fast']]],
  [['Busco un mercado de artesanos', ['compras']], ['con poco presupuesto', ['cheap']], ['paso de pagar por la visita', ['free']]],
  [['Quiero un paseo junto al agua', ['naturaleza']], ['sin barreras ni peldaños', ['stepFree']], ['la comida va aparte', ['skipMeal']]],
  [['¿Qué apetece hacer?', []], ['cualquier plan me viene bien', ['anyInterest']], ['comemos al terminar la visita', ['skipMeal']]]
];

export const phrases = {
  slow: ['andamos muy despacio', 'hacemos muchas pausas al andar', 'vamos despacito', 'me canso al caminar', 'un paseo pausado', 'mi madre camina lentamente', 'con calma', 'sin prisa', 'un ritmo suave'],
  fast: ['marchamos a buen ritmo', 'vamos deprisa', 'somos rápidos caminando', 'a ritmo intenso', 'paso rápido', 'caminar a paso ligero'],
  stepFree: ['no puedo subir escaleras', 'necesito una rampa', 'solo accesos sin escalones', 'evitemos los peldaños', 'voy en silla de ruedas', 'necesito evitar escalinatas', 'sin tramos de escaleras'],
  stairsOK: ['las escaleras me dan igual', 'puedo subir escaleras', 'los escalones no me molestan', 'no necesito rampa', 'las escaleras no son problema'],
  quiet: ['quiero evitar la multitud', 'prefiero menos gentío', 'sin colas ni aglomeraciones', 'busco sitios poco concurridos', 'lejos del bullicio', 'evitar zonas saturadas'],
  crowdOK: ['la multitud me da igual', 'me da igual el gentío', 'las aglomeraciones no me importan', 'no me molesta que haya cola', 'acepto lugares concurridos'],
  free: ['que todo sea gratis', 'solo visitas gratuitas', 'no puedo gastar dinero', 'sin coste', 'nada de pagar entradas', 'presupuesto cero', 'sin pagar'],
  cheap: ['barato por favor', 'busco algo económico', 'tengo poco presupuesto', 'precios bajos', 'gastar poquito', 'alguna entrada económica'],
  meal: ['queremos comer algo típico', 'queremos sentarnos a comer', 'parar para almorzar', 'hacer una pausa para cenar', 'reservar tiempo para comer', 'comer durante la ruta', 'paramos a desayunar', 'quiero sentarme a merendar'],
  skipMeal: ['no vamos a parar a comer', 'comemos después de la ruta', 'cenaré al acabar', 'quito la pausa para almorzar', 'almorzamos fuera del recorrido', 'ya hemos comido'],
  anyInterest: ['lo que sea', 'me dejo aconsejar', 'elige tú el plan', 'cualquier cosa está bien', 'no tengo preferencias', 'sorpréndenos']
};

// Each utterance is kept out of the training set.
export const dialogueEvaluation = [
  ['necesitamos un paseo muy pausado', ['slow']], ['andamos a paso rápido', ['fast']],
  ['necesito entrar con silla de ruedas', ['stepFree']], ['puedo subir unos escalones', ['stairsOK']],
  ['preferimos zonas poco concurridas', ['quiet']], ['el gentío me da igual', ['crowdOK']],
  ['mi presupuesto es cero', ['free']], ['prefiero gastar poquito', ['cheap']],
  ['vamos a sentarnos a almorzar', ['meal']], ['la cena será al acabar el recorrido', ['skipMeal']],
  ['elige tú cualquier plan', ['anyInterest']], ['mi tren llega a las cuatro', []],
  ['buenos días Cacahuete', []], ['me quedan 55 minutos', []]
];
