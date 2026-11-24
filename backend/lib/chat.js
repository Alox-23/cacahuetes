import { badRequest } from './http.js';
import { inferInterests } from './interest-model.js';
import { interpretWithRules, normalize, questions, validAnswer, validateProfile } from './onboarding.js';
import { buildRoutes, routeOptions } from './routes.js';

const defaults = { budget: 'cualquiera', pace: 'normal', avoidStairs: false, crowd: 'evitar' };
const byId = new Map(questions.map((question) => [question.id, question]));
const required = questions.filter(({ id }) => !Object.hasOwn(defaults, id));

function nextQuestion(profile) {
  return required.find(({ id }) => !Object.hasOwn(profile, id)) ?? null;
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
  const question = byId.get(body.questionId);
  if (!question || !validAnswer(question, body.answer)) throw badRequest('La opción seleccionada no es válida.');
  return { profile, options, choice: { [question.id]: body.answer } };
}

function applyRules(message, profile, pending) {
  const text = normalize(message);
  const rules = (id, answer) => interpretWithRules(byId.get(id), answer);
  const changes = {};
  if (pending?.id === 'minutes') changes.minutes = rules('minutes', text);
  if (pending?.id === 'start' && !/\b(?:quiero|visitar|ver|no|me apetece|prefiero|destino)\b/.test(text)) {
    changes.start = rules('start', text);
  }

  const startsHere = text.match(/\b(?:estoy(?: en)?|salgo(?: de)?|salimos(?: de)?|parto(?: de)?|empiezo(?: en)?|desde|cerca de)\s+([^,;.!?]+)/);
  if (startsHere) {
    const location = startsHere[1].split(/\s+(?:y\s+)?(?:tengo|quiero|me apetece|prefiero|busco)\b/)[0];
    changes.start = rules('start', location);
  }

  const durations = [...text.matchAll(/\b(?:(?:media|1\/2)\s+hora|(?:una|dos|tres|cuatro|cinco|seis|siete|ocho|\d{1,3}(?:[.,]\d+)?)\s*(?:horas?|h)(?:\s+y\s+media|\s*(?:y\s+)?\d{1,2}\s*(?:min(?:utos?)?|m)?)?|\d{1,3}\s*(?:min(?:utos?)?|m))\b/g)];
  if (durations.length === 1 && !/\b(?:entre|no tengo)\b/.test(text)) {
    changes.minutes = rules('minutes', durations[0][0]);
  }

  const preferences = message.match(/\b(?:quiero|me apetece|prefiero|me interesan?|busco|me gustar[ií]a)\s+(.+)/i)?.[1];
  const interestText = preferences?.split(/[,;.!?]|\s+(?:pero|(?:y\s+)?(?:sin|evitando))\s+/i)[0];
  const subject = interestText ?? (startsHere || changes.start ? '' : message);
  const negative = /\b(?:no|excepto|tampoco)\b/.test(text);
  const matched = negative ? [] : rules('interests', subject);
  const inferred = !negative && subject && (interestText || pending?.id === 'interests')
    ? inferInterests(subject)
    : [];
  const family = /\b(?:voy|vamos|viajo|viajamos) con (?:ninos|peques|mis hijos)\b/.test(text);
  const found = matched?.length ? matched : inferred;
  if (found.length || family) {
    const previous = /\b(?:solo|solamente|en vez de)\b/.test(normalize(interestText ?? '')) ? [] : (profile.interests ?? []);
    changes.interests = [...new Set([...previous, ...found, ...(family ? ['familia'] : [])])];
  }

  if (/\b(?:gratis|gratuit[oa]s?|sin gastar|sin pagar)\b/.test(text)) changes.budget = 'gratis';
  else if (/\b(?:barato|barata|gastar poco|economico|economica)\b/.test(text)) changes.budget = 'bajo';
  if (/\b(?:con calma|sin prisa|despacio)\b/.test(text)) changes.pace = 'tranquilo';
  if (/\b(?:sin escaleras|evitar escaleras|no puedo subir escaleras)\b/.test(text)) changes.avoidStairs = true;
  if (/\b(?:evitar|evitando|sin) (?:las )?(?:aglomeraciones|multitudes|colas|(?:mucha|demasiada) gente)\b/.test(text)) {
    changes.crowd = 'evitar';
  }
  return { values: changes, source: !matched?.length && inferred.length ? 'model' : 'rules' };
}

export function chatTurn({ profile, options, message, choice }, premium) {
  let interpretation = null;
  const changes = {};
  if (choice) {
    Object.assign(changes, choice);
    interpretation = 'choice';
  } else if (message) {
    const { values, source } = applyRules(message, profile, nextQuestion(profile));
    interpretation = source;
    for (const question of questions) {
      const value = values[question.id];
      if (validAnswer(question, value)) changes[question.id] = value;
    }
  }
  const updated = { ...profile, ...changes };
  const question = nextQuestion(updated);
  const accepted = message || choice ? Object.keys(changes).length > 0 : null;
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
