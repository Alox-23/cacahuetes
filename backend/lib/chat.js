import { badRequest } from './http.js';
import { interests, places } from './catalog.js';
import { inferDialogue, inferInterests } from './interest-model.js';
import { interpretWithRules, normalize, questions, validAnswer, validateProfile } from './onboarding.js';
import { buildRoutes, routeOptions } from './routes.js';

const defaults = { budget: 'cualquiera', pace: 'normal', avoidStairs: false, crowd: 'evitar' };
const byId = new Map(questions.map((question) => [question.id, question]));
const required = questions.filter(({ id }) => !Object.hasOwn(defaults, id));
const mealQuestion = { id: 'mealMinutes', label: 'De tu tiempo total, ¿cuántos minutos reservo para comer? Elige 0 si comes después del paseo.',
  options: [0, 20, 30, 45, 60].map(value => ({ value, label: value ? `${value} minutos` : 'Comeré después' })) };

function nextQuestion(profile) {
  const missing = required.find(({ id }) => !Object.hasOwn(profile, id));
  if (missing) return missing;
  if (profile.mealMinutes === null || profile.mealMinutes > profile.minutes) {
    return { ...mealQuestion, options: mealQuestion.options.filter(option => option.value <= profile.minutes) };
  }
  return null;
}

export function chatInput(body, savedProfile = {}) {
  const profile = validateProfile(body.profile ?? savedProfile);
  const options = routeOptions(body);
  const message = body.message;
  const hasChoice = Object.hasOwn(body, 'answer') || Object.hasOwn(body, 'questionId');
  if (message !== undefined && (typeof message !== 'string' || !message.trim() || message.length > 700 || hasChoice)) {
    throw badRequest('Envía un mensaje de hasta 700 caracteres o selecciona una opción.');
  }
  if (!hasChoice) return { profile, options, message: message?.trim() };
  if (body.questionId === 'mealMinutes' && nextQuestion(profile)?.id === 'mealMinutes' &&
    Number.isInteger(body.answer) && body.answer >= 0 && body.answer <= profile.minutes) {
    return { profile, options, choice: { mealMinutes: body.answer } };
  }
  const question = byId.get(body.questionId);
  if (!question || !validAnswer(question, body.answer)) throw badRequest('La opción seleccionada no es válida.');
  return { profile, options, choice: { [question.id]: body.answer } };
}

const preferenceValues = {
  slow: ['pace', 'tranquilo'], fast: ['pace', 'activo'], stepFree: ['avoidStairs', true],
  stairsOK: ['avoidStairs', false], quiet: ['crowd', 'evitar'], crowdOK: ['crowd', 'indiferente'],
  free: ['budget', 'gratis'], cheap: ['budget', 'bajo']
};
const preferenceTopics = {
  pace: /\b(?:ritmo|paso|and\w*|camin\w*|paus\w*|prisa|cans\w*|despac\w*|lent\w*|deprisa|rapi\w*|tortuga)\b/,
  avoidStairs: /\b(?:escaler\w*|escalon\w*|escalinat\w*|rampas?|silla de ruedas|peldan\w*|barreras?)\b/,
  crowd: /\b(?:colas?|gente|gentio|multitud\w*|aglomer\w*|concurrid\w*|bullicio|masific\w*|saturad\w*)\b/,
  budget: /\b(?:grat\w*|coste|dinero|eur\w*|presupuesto|precios?|pagar|gast\w*|barat\w*|economic\w*)\b/
};
const namedStops = [
  [/\bplayas?\b/, places.filter(place => place.name.startsWith('Playa')).map(place => place.id)],
  [/\bmuseos?\b/, ['grabado']]
];
const durationPattern = /\b(?:hora y media|(?:media|1\/2)\s+hora|(?:una|dos|tres|cuatro|cinco|seis|siete|ocho|\d{1,3}(?:[.,]\d+)?)\s*(?:horas?|h)(?:\s+y\s+media|\s*(?:y\s+)?\d{1,2}\s*(?:min(?:utos?)?|m)?)?|(?:veinte|treinta|cuarenta|cincuenta|sesenta|noventa)(?: y cinco)? minutos?|\d{1,3}\s*(?:min(?:utos?)?|m))\b/g;
const rules = (id, text) => interpretWithRules(byId.get(id), text);

function explicitPreferences(text) {
  const values = {};
  if (/\b(?:gratis|gratuit[oa]s?|sin gastar|sin pagar)\b/.test(text)) values.budget = 'gratis';
  else if (/\b(?:barat[oa]|gastar poco|economic[oa])\b/.test(text)) values.budget = 'bajo';
  if (/\b(?:con calma|sin prisa|despacio)\b/.test(text)) values.pace = 'tranquilo';
  if (/\b(?:sin escaleras|evitar (?:las )?escaleras|no puedo subir escaleras)\b/.test(text)) values.avoidStairs = true;
  if (/\b(?:evitar|evitando|sin) (?:las )?(?:aglomeraciones|multitudes|colas|(?:mucha|demasiada) gente)\b/.test(text)) values.crowd = 'evitar';
  return values;
}

function applyMessage(message, profile, pending) {
  const text = normalize(message);
  const updated = { ...profile };
  let usedModel = false;
  const start = text.match(/\b(?:est(?:oy|amos) en|sal(?:go|imos) de|parto de|empiezo en|desde|cerca de)\s+([^,;.!?]+)/);
  if (start || (pending?.id === 'start' && !/\b(?:quiero|queremos|visitar|ver|no|prefiero|destino)\b/.test(text))) {
    const value = rules('start', start?.[1].split(/\s+(?:y|pero|para)\s+/)[0] ?? text);
    if (value) updated.start = value;
  }
  const allDurations = [...text.matchAll(durationPattern)];
  const forMeal = allDurations.find(match => /^\s+(?:para|en) (?:la comida|el almuerzo|comer|almorzar|cenar)\b/.test(text.slice(match.index + match[0].length)));
  if (forMeal) updated.mealMinutes = rules('minutes', forMeal[0]);
  const durations = allDurations.filter(match => match !== forMeal);
  const mealReply = pending?.id === 'mealMinutes' && !/\b(?:quedan|total|para (?:todo|el paseo))\b/.test(text) && !forMeal;
  if (durations.length === 1 || !durations.length && (mealReply || pending?.id === 'minutes')) {
    const value = rules('minutes', durations[0]?.[0] ?? text);
    if (mealReply && Number.isInteger(value) && value >= 0 && value <= profile.minutes) updated.mealMinutes = value;
    else if (!mealReply && validAnswer(byId.get('minutes'), value) && !/\b(?:entre|no tengo)\b/.test(text)) updated.minutes = value;
  }

  const wanted = new Set(profile.interests);
  const excluded = new Set(profile.excludedInterests);
  const excludedStops = new Set(profile.excludedStops);
  const parts = text.replace(/\ben (?:vez|lugar) de\b/g, ', excepto ')
    .split(/[,;.!?]+|\b(?:pero|en cambio)\b|\s+(?=(?:sin|evitando|excepto|salvo)\b)|\s+y\s+(?=(?:ahora|al final|(?:mi|mis|nuestro|nuestra|nos|me|no|tambien|despues|luego|sin|a paso|con calma)\b|quier|queremos|prefier|preferimos|busc|tenemos|tengo|vamos|somos|necesit|ver\b|comer\b|comprar\b))/)
    .map(part => part.trim()).filter(Boolean);
  for (const part of parts) {
    const negative = /\b(?:no (?:quiero|queremos|(?:me|nos) (?:interesan?|apetecen?|gustan?))|tampoco|excepto|salvo|evit(?:ar|emos|ando)|sin)\b/.test(part) || /^no\s+(?:la |el |los |las )?(?:playas?|museos?|arte|historia|compras)\b/.test(part);
    const indifferent = /\b(?:me|nos) da igual\b/.test(part);
    const intents = inferDialogue(part);
    const explicit = explicitPreferences(part);
    for (const tag of intents) {
      const field = preferenceValues[tag];
      if (field && preferenceTopics[field[0]].test(part) && !Object.hasOwn(explicit, field[0])) {
        updated[field[0]] = field[1];
        usedModel = true;
      }
    }
    Object.assign(updated, explicit);
    const aboutMeal = /\b(?:comer|comida|comemos|comido|desayun\w*|almorz\w*|almuerzo|cen\w*|merend\w*)\b/.test(part);
    const skipMeal = aboutMeal && (intents.includes('skipMeal') || /\b(?:no (?:quiero|queremos|vamos a) (?:parar (?:a|para) )?(?:comer|cenar|almorzar)|(?:comemos|comere|cenamos) (?:al acabar|despues))\b/.test(part));
    const meal = aboutMeal && !negative && (intents.includes('meal') || /\b(?:comer algo|parar (?:a|para) (?:comer|almorzar|cenar))\b/.test(part));
    if (skipMeal) updated.mealMinutes = 0;
    else if (meal && (updated.mealMinutes === undefined || updated.mealMinutes === 0) && !mealReply && !forMeal) updated.mealMinutes = null;

    if ((intents.includes('anyInterest') || /^(?:(?:me|nos) da igual|lo que sea)$/.test(part)) && pending?.id === 'interests' &&
        !/\bda igual\s+\S/.test(part)) {
      for (const tag of interests) if (!excluded.has(tag)) wanted.add(tag);
      continue;
    }
    if (indifferent) {
      for (const [pattern, ids] of namedStops) if (pattern.test(part)) for (const id of ids) excludedStops.delete(id);
      continue;
    }
    if (skipMeal) continue;
    const cue = part.match(/\b(?:quier[oe]|queremos|me apetece|nos apetece|prefier[oe]|preferimos|me interesan?|busc(?:o|amos)|me gustaria)\s+(.+)/);
    let subject = cue?.[1] ?? part;
    if (!cue && (/\b(?:desde|estoy en|estamos en|salimos de|salgo de|tenemos|me quedan)\b/.test(part) ||
        (updated.start && !profile.start && rules('start', part)))) continue;
    if (negative) subject = subject.replace(/\b(?:no|excepto|sin|tampoco|evitar|evitemos)\b/g, '');
    const scopedStops = namedStops.filter(([pattern]) => pattern.test(subject)).flatMap(([, ids]) => ids);
    if (negative && scopedStops.length) {
      for (const id of scopedStops) excludedStops.add(id);
      // Discard the specific stop type while preserving other exclusions in this clause.
      for (const [pattern] of namedStops) subject = subject.replace(pattern, '');
    }
    let tags = rules('interests', subject) ?? [];
    if (!tags.length && !negative && !intents.length && (cue || pending?.id === 'interests' || parts.length > 1 || profile.interests)) {
      tags = inferInterests(subject);
      if (tags.length) usedModel = true;
    }
    if (meal && !tags.includes('gastronomia')) tags = [...tags, 'gastronomia'];
    if (!tags.length) continue;
    if (!negative && /\b(?:solo|solamente|unicamente)\b/.test(part)) wanted.clear();
    for (const tag of tags) {
      if (negative) { wanted.delete(tag); excluded.add(tag); }
      else { wanted.add(tag); excluded.delete(tag); }
    }
    if (!negative) for (const id of scopedStops) excludedStops.delete(id);
  }
  if (wanted.size) updated.interests = [...wanted];
  else delete updated.interests;
  if (excluded.size) updated.excludedInterests = [...excluded];
  else delete updated.excludedInterests;
  if (excludedStops.size) updated.excludedStops = [...excludedStops];
  else delete updated.excludedStops;
  return { updated, source: usedModel ? 'model' : 'rules' };
}

export function chatTurn({ profile, options, message, choice }, premium) {
  let interpretation = null;
  let updated = profile;
  let accepted = null;
  if (choice) {
    updated = { ...profile, ...choice };
    if (choice.interests && profile.excludedInterests) {
      updated.excludedInterests = profile.excludedInterests.filter(tag => !choice.interests.includes(tag));
    }
    accepted = true;
    interpretation = 'choice';
  } else if (message) {
    const result = applyMessage(message, profile, nextQuestion(profile));
    updated = result.updated;
    interpretation = result.source;
    accepted = JSON.stringify(updated) !== JSON.stringify(profile);
  }
  const question = nextQuestion(updated);
  const context = { profile: updated, question, accepted, interpretation };
  if (question) {
    return {
      ...context, state: 'question', route: null,
      message: message || choice ? question.label : `Soy Cacahuete, tu guía en Marbella. ${question.label}`
    };
  }

  const appliedDefaults = Object.fromEntries(Object.entries(defaults).filter(([key]) => !Object.hasOwn(updated, key)));
  const routes = buildRoutes({ ...options, profile: { ...appliedDefaults, ...updated } }, premium);
  return {
    ...context, ...routes, state: 'route', appliedDefaults,
    message: message && !accepted
      ? `He mantenido tus preferencias. ${routes.route.summary}`
      : routes.route.summary
  };
}
