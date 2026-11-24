import assert from 'node:assert/strict';
import test from 'node:test';
import { chatInput, chatTurn } from '../lib/chat.js';
import model from '../model/interests.json' with { type: 'json' };

function turn(message, profile = {}, premium = false) {
  return chatTurn(chatInput({ profile, message }), premium);
}

test('Cacahuete cuenta por separado paseo y comida y acepta una corrección', () => {
  const first = turn('Estoy en la Alameda con mis padres, tenemos hora y media, queremos comer algo típico y mi padre camina despacio.');
  assert.equal(first.question.id, 'mealMinutes');
  assert.equal(first.profile.minutes, 90);
  assert.equal(first.profile.pace, 'tranquilo');
  assert.deepEqual(first.profile.interests, ['gastronomia']);
  const reserved = turn('30 minutos', first.profile);
  assert.equal(reserved.state, 'route');
  assert.equal(reserved.route.mealMinutes, 30);
  assert.ok(reserved.route.stops.length);
  assert.equal(reserved.route.totalMinutes, 30 + reserved.route.stops.reduce((sum, stop) => sum + stop.walkMinutes + stop.visitMinutes, 0));
  assert.ok(reserved.route.totalMinutes <= 90);
  const revised = turn('Al final solo nos quedan cuarenta minutos', reserved.profile);
  assert.equal(revised.profile.minutes, 40);
  assert.equal(revised.profile.mealMinutes, 30);
  assert.equal(revised.profile.pace, 'tranquilo');
  assert.equal(revised.route.stops.length, 0);
  const skip = turn('No quiero comer durante la ruta', revised.profile);
  assert.equal(skip.profile.mealMinutes, 0);
  assert.ok(skip.route.stops.length);
});

test('acepta dos duraciones explícitas y revisa una reserva que excede el total', () => {
  const first = turn('Salimos de la Alameda, tenemos 90 minutos y queremos 45 minutos para comer y ver arte.');
  assert.equal(first.profile.minutes, 90);
  assert.equal(first.profile.mealMinutes, 45);
  const shorter = turn('Al final quedan 35 minutos', first.profile);
  assert.equal(shorter.question.id, 'mealMinutes');
  assert.ok(shorter.question.options.every(option => option.value <= 35));
  const choice = chatTurn(chatInput({ profile: shorter.profile, questionId: 'mealMinutes', answer: 0 }), false);
  assert.equal(choice.profile.minutes, 35);
  assert.ok(choice.route.totalMinutes <= 35);
});

test('recuerda exclusiones, permite rectificar y distingue indiferencia de rechazo', () => {
  const profile = { start: 'marina', minutes: 120, interests: ['naturaleza'] };
  const neutral = turn('Me da igual la playa', profile);
  assert.deepEqual(neutral.profile, profile);
  const skip = turn('Prefiero evitar la playa, pero sí quiero jardines', profile, true);
  assert.ok(skip.profile.excludedStops.includes('fontanilla'));
  for (const route of [skip.route, ...skip.alternatives]) {
    assert.ok(route.stops.every(stop => !skip.profile.excludedStops.includes(stop.id)));
  }
  const change = turn('Ahora sí quiero ir a la playa', skip.profile);
  assert.equal(change.profile.excludedStops, undefined);
  const replace = turn('No quiero naturaleza, prefiero historia', change.profile);
  assert.deepEqual(replace.profile.interests, ['historia']);
  const none = turn('Tampoco quiero historia', replace.profile);
  assert.equal(none.question.id, 'interests');
  const any = turn('Me da igual', none.profile);
  assert.equal(any.state, 'route');
  assert.ok(!any.profile.interests.includes('historia'));
});

test('la rama de diálogo entrenada interpreta una preferencia y la API usa el nombre Cacahuete', () => {
  const first = chatTurn(chatInput({}), false);
  assert.match(first.message, /Soy Cacahuete/);
  assert.equal(model.name, 'Cacahuete');
  const answer = turn('Necesitamos un paseo muy pausado', { start: 'banus' });
  assert.equal(answer.profile.pace, 'tranquilo');
  assert.equal(answer.interpretation, 'model');
  assert.equal(answer.question.id, 'minutes');
});

test('una restricción de acceso conserva los intereses positivos del mismo enunciado', () => {
  const first = turn('Estoy en la Alameda y tengo dos horas y media y quiero ver arte sin escaleras.');
  assert.equal(first.profile.minutes, 150);
  assert.equal(first.profile.avoidStairs, true);
  assert.deepEqual(first.profile.interests, ['arte']);
  const revised = turn('Sin playas ni compras, pero quiero jardines', first.profile);
  assert.ok(revised.profile.excludedStops.includes('fontanilla'));
  assert.ok(revised.profile.excludedInterests.includes('compras'));
  assert.ok(revised.profile.interests.includes('naturaleza'));
});
