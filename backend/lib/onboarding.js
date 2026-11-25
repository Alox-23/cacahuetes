import { interests, places, starts } from './catalog.js';
import { badRequest, object } from './http.js';
import { inferInterests } from './interest-model.js';

const choices = (values) => Object.entries(values).map(([value, label]) => ({ value, label }));
const interestLabels = {
  arte: 'Arte', historia: 'Historia', gastronomia: 'Gastronomía',
  naturaleza: 'Naturaleza', compras: 'Compras', familia: 'Actividades en familia'
};

export const questions = [
  { id: 'start', label: '¿Desde dónde salimos?', options: choices(
    Object.fromEntries(Object.entries(starts).map(([id, place]) => [id, place.name]))
  ) },
  { id: 'minutes', label: '¿Cuánto tiempo tienes? Entre 20 minutos y 8 horas.', options: [
    { value: 30, label: '30 minutos' }, { value: 60, label: '1 hora' },
    { value: 90, label: '1 hora y media' }, { value: 120, label: '2 horas' }
  ] },
  { id: 'interests', label: '¿Qué te apetece hacer en Marbella?', options: choices(interestLabels), multiple: true },
  { id: 'budget', label: '¿Qué presupuesto prefieres por parada?', options: choices({
    gratis: 'Solo planes gratuitos', bajo: 'Gastar poco', medio: 'Puedo pagar alguna entrada', cualquiera: 'Flexible'
  }) },
  { id: 'pace', label: '¿Cómo prefieres caminar?', options: choices({
    tranquilo: 'Con calma', normal: 'A un ritmo normal', activo: 'Puedo caminar más'
  }) },
  { id: 'avoidStairs', label: '¿Prefieres evitar paradas con escaleras conocidas?', options: [
    { value: true, label: 'Sí, evítalas' }, { value: false, label: 'Me da igual' }
  ] },
  { id: 'crowd', label: 'Si hay información de afluencia, ¿quieres evitar puntos concurridos?', options: choices({
    evitar: 'Sí, dame otras opciones', indiferente: 'Me da igual'
  }) }
];

export function nextQuestion(profile) {
  return questions.find(({ id }) => !Object.hasOwn(profile, id)) ?? null;
}

export function validAnswer(question, value) {
  if (question.id === 'minutes') {
    return Number.isInteger(value) && value >= 20 && value <= 480;
  }
  if (question.id === 'interests') {
    return Array.isArray(value) && value.length > 0 && value.length <= interests.length &&
      value.every((entry) => interests.includes(entry)) && new Set(value).size === value.length;
  }
  return question.options.some((option) => option.value === value);
}

export function validateProfile(value) {
  const raw = object(value, 'profile');
  const profile = {};
  for (const question of questions) {
    if (!Object.hasOwn(raw, question.id)) continue;
    if (!validAnswer(question, raw[question.id])) throw badRequest(`Respuesta no válida para ${question.id}.`);
    profile[question.id] = raw[question.id];
  }
  if (Object.hasOwn(raw, 'mealMinutes')) {
    const minutes = raw.mealMinutes;
    if (minutes !== null && (!Number.isInteger(minutes) || minutes < 0 || minutes > 480)) {
      throw badRequest('Los minutos para comer deben estar entre 0 y 480.');
    }
    profile.mealMinutes = minutes;
  }
  for (const [field, allowed] of [['excludedInterests', interests], ['excludedStops', places.map(place => place.id)]]) {
    if (!Object.hasOwn(raw, field)) continue;
    if (!Array.isArray(raw[field]) || raw[field].length > allowed.length || !raw[field].every(id => allowed.includes(id))) {
      throw badRequest(`Preferencia no válida en ${field}.`);
    }
    profile[field] = [...new Set(raw[field])];
  }
  return profile;
}

export const normalize = (text) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

function minutesFromText(text) {
  if (text === 'hora y media') return 90;
  const tens = { veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, noventa: 90 };
  text = text.replace(/\b(veinte|treinta|cuarenta|cincuenta|sesenta|noventa)( y cinco)?\b/g,
    (_, word, five) => String(tens[word] + (five ? 5 : 0)));
  const numeric = text.match(/^(?:tengo )?(\d{1,3})(?:\s*(?:min(?:utos?)?|m))?$/);
  if (numeric) return Number(numeric[1]);
  if (/^(?:media|1\/2) hora$/.test(text)) return 30;
  text = text.replace(/\s+y media$/, ' y 30 min');
  const hours = text.match(/^(?:tengo )?(una|dos|tres|cuatro|cinco|seis|siete|ocho|\d+(?:[.,]\d+)?)\s*(?:h|horas?)(?:\s*(?:(?:y\s+)?(\d{1,2})\s*(?:min(?:utos?)?|m)?))?$/);
  if (!hours) return null;
  const words = ['una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho'];
  const amount = words.includes(hours[1]) ? words.indexOf(hours[1]) + 1 : Number(hours[1].replace(',', '.'));
  return Math.round(amount * 60) + Number(hours[2] ?? 0);
}

export function interpretWithRules(question, answer) {
  const text = normalize(answer);
  const option = question.options.find((item) =>
    text === normalize(item.label) || text === normalize(String(item.value)));
  if (option) return question.multiple ? [option.value] : option.value;
  switch (question.id) {
    case 'minutes': return minutesFromText(text);
    case 'start': {
      const points = [
        ['naranjos', /\b(naranjos|casco antiguo)\b/], ['alameda', /\balameda\b/],
        ['marina', /\bpuerto deportivo(?: de marbella)?\b/], ['banus', /\bbanus\b/]
      ].filter(([, pattern]) => pattern.test(text));
      return points.length === 1 ? points[0][0] : null;
    }
    case 'interests': {
      if (/\b(no|excepto|sin|tampoco)\b/.test(text)) return null;
      return [
        ['arte', /\b(arte|museos?|pintura|exposiciones?|picasso)\b/],
        ['historia', /\b(historia|historic[oa]s?|monumentos?|romano)\b/],
        ['gastronomia', /\b(gastronomia|comer|comida|tapas|dulce|merendar)\b/],
        ['naturaleza', /\b(naturaleza|parques?|jardines?|playa|mar)\b/],
        ['compras', /\b(compras?|comprar|artesania|tiendas?|souvenirs?)\b/],
        ['familia', /\b(familia|ninos?|peques|hijos?)\b/]
      ].filter(([, pattern]) => pattern.test(text)).map(([interest]) => interest);
    }
    case 'budget':
      if (/^(sin gastar|gratuito|gratuita|nada)$/.test(text)) return 'gratis';
      if (/^(barato|poco|economico)$/.test(text)) return 'bajo';
      if (/^(me da igual|lo que sea|flexible)$/.test(text)) return 'cualquiera';
      return null;
    case 'pace':
      if (/^(despacio|sin prisa|con calma)$/.test(text)) return 'tranquilo';
      if (/^(rapido|deprisa|andamos mucho)$/.test(text)) return 'activo';
      return null;
    case 'avoidStairs':
      if (/^(si|evitar escaleras|sin escaleras)$/.test(text)) return true;
      if (/^(no|me da igual|puedo subir escaleras)$/.test(text)) return false;
      return null;
    case 'crowd':
      if (/^(si|evitar aglomeraciones|sin aglomeraciones|evitar multitudes|(?:mejor )?sin (?:mucha|demasiada) gente)$/.test(text)) return 'evitar';
      if (/^(no|me da igual|sin preferencia)$/.test(text)) return 'indiferente';
      return null;
    default: return null;
  }
}

export function validateTurn(body, savedProfile = {}) {
  const profile = validateProfile(body.profile ?? savedProfile);
  const question = nextQuestion(profile);
  if (!Object.hasOwn(body, 'answer')) return { profile, question };
  if (!question || body.questionId !== question.id) throw badRequest('La pregunta ha cambiado. Solicita el turno actual.');
  const answer = body.answer;
  if (!validAnswer(question, answer) && (typeof answer !== 'string' || !answer.trim() || answer.length > 400)) {
    throw badRequest('Elige una opción válida o escribe hasta 400 caracteres.');
  }
  return { profile, question, answer };
}

export function takeTurn({ profile, question, answer }) {
  if (answer === undefined) {
    return { profile, question, complete: !question, accepted: null, interpretation: null };
  }
  let value = answer;
  let interpretation = 'choice';
  if (!validAnswer(question, value)) {
    const exactLabel = question.options.find((option) => normalize(option.label) === normalize(answer));
    if (exactLabel) value = question.multiple ? [exactLabel.value] : exactLabel.value;
    if (!validAnswer(question, value)) {
      value = interpretWithRules(question, answer);
      interpretation = 'rules';
    }
    if (question.id === 'interests' && Array.isArray(value) && value.length === 0) {
      value = inferInterests(answer);
      interpretation = 'model';
    }
  }
  if (!validAnswer(question, value)) {
    return { profile, question, complete: false, accepted: false, interpretation: null,
      message: 'No he podido interpretar esa respuesta. Puedes elegir una opción o reformularla.' };
  }
  const updatedProfile = { ...profile, [question.id]: value };
  const following = nextQuestion(updatedProfile);
  return { profile: updatedProfile, question: following, complete: !following, accepted: true, interpretation };
}
