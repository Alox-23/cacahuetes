import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { classify, features, prepareEmbeddings, probability } from '../lib/interest-features.js';
import { evaluation, examples, neutral } from './interest-examples.js';
import { conversations, dialogueEvaluation, phrases } from './dialogue-examples.js';
import { trainRanking } from './route-examples.js';

const labels = Object.keys(examples);
const usePublicBase = process.argv.includes('--bpemb');
const bpemb = 'https://bpemb.h-its.org/es/es.wiki.bpe.vs3000';
const localFlag = process.argv.indexOf('--bpemb-dir');
const localDirectory = localFlag > -1 ? process.argv[localFlag + 1] : undefined;
if (localFlag > -1 && (!localDirectory || localDirectory.startsWith('--'))) throw new Error('Falta la carpeta de los ficheros BPEmb.');

async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} al obtener ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

function textFromArchive(compressed) {
  const archive = gunzipSync(compressed, { maxOutputLength: 5_000_000 });
  for (let offset = 0; offset + 512 <= archive.length;) {
    const header = archive.subarray(offset, offset + 512);
    if (header[0] === 0) break;
    const name = header.subarray(0, 100).toString().replace(/\0.*$/, '');
    const size = Number.parseInt(header.subarray(124, 136).toString().trim(), 8);
    if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > archive.length) break;
    if (name.endsWith('.w2v.txt')) return archive.subarray(offset + 512, offset + 512 + size).toString('utf8');
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error('El archivo oficial no contiene los vectores de texto esperados.');
}

async function loadPublicBase() {
  const [vocabulary, archive] = await Promise.all(['.vocab', '.d25.w2v.txt.tar.gz'].map(suffix =>
    localDirectory ? readFile(join(localDirectory, 'es.wiki.bpe.vs3000' + suffix)) : download(bpemb + suffix)));
  const ranks = vocabulary.toString('utf8').trim().split(/\r?\n/).slice(3).map((row, index) =>
    [row.split('\t')[0], index]);
  const [header, ...lines] = textFromArchive(archive).trim().split(/\r?\n/);
  const [count, dimensions] = header.split(/\s+/).map(Number);
  if (count !== 3000 || dimensions !== 25 || lines.length !== count || ranks.length !== count - 3) {
    throw new Error('El modelo público no tiene las dimensiones esperadas.');
  }
  const vectors = lines.map((line) => {
    const [word, ...numbers] = line.trim().split(/\s+/);
    const vector = numbers.map(Number);
    if (vector.length !== dimensions || !vector.every(Number.isFinite)) throw new Error('Vector BPEmb no válido.');
    return [word, vector];
  });
  return { name: 'BPEmb es 3000×25', dimensions, ranks, vectors };
}

function trainingExamples() {
  const rows = neutral.map((text) => [text, []]);
  for (const [label, phrases] of Object.entries(examples)) {
    for (const [index, phrase] of phrases.entries()) {
      rows.push([phrase, [label]], [`${neutral[index % neutral.length]}. ${phrase}`, [label]]);
    }
  }
  for (let left = 0; left < labels.length; left++) {
    for (const right of labels.slice(left + 1)) {
      const first = labels[left];
      for (let index = 0; index < 16; index++) {
        rows.push([`${examples[first][index]} y ${examples[right][(index + 5) % examples[right].length]}`, [first, right]]);
      }
    }
  }
  return rows;
}

function train(label, rows) {
  const weights = new Float64Array(rows[0].input.length);
  const classifier = { label, weights, bias: 0, threshold: 0.59 };
  const gradients = new Float64Array(weights.length);
  const positives = rows.filter(row => row.labels.includes(label)).length;
  const positiveWeight = (rows.length - positives) / positives;
  for (let epoch = 0; epoch < 360; epoch++) {
    gradients.fill(0);
    let bias = 0;
    for (const row of rows) {
      const expected = Number(row.labels.includes(label));
      const error = (expected - probability(row.input, classifier)) * (expected ? positiveWeight : 1);
      bias += error;
      for (const index of row.nonzero) gradients[index] += row.input[index] * error;
    }
    const step = 1.7 / Math.sqrt(1 + epoch / 70);
    classifier.bias += step * bias / rows.length;
    for (let index = 0; index < weights.length; index++) {
      weights[index] += step * (gradients[index] / rows.length - 0.0004 * weights[index]);
    }
  }
  return { ...classifier, weights: Array.from(weights, (value) => Number(value.toFixed(5))) };
}

const base = usePublicBase || localDirectory ? await loadPublicBase() : null;
const embeddings = prepareEmbeddings(base);
function encode([text, labels]) {
  const input = features(text, embeddings);
  const nonzero = [...input.keys()].filter((index) => input[index] !== 0);
  return { input, nonzero, labels };
}
const turns = conversations.flat();
const rows = [...trainingExamples(), ...turns.map(([text, tags]) => [text, tags.filter(tag => labels.includes(tag))])].map(encode);
const classifiers = labels.map((label) => train(label, rows));
const dialogueLabels = Object.keys(phrases);
const dialogueRows = [
  ...turns,
  ...Object.entries(phrases).flatMap(([label, messages]) => messages.map(text => [text, [label]])),
  ...Object.values(examples).flat().map(text => [text, []]),
  ...neutral.filter(text => !/quiero|prefiero|despacio|aglomeraciones|evitar|opción/.test(text)).map(text => [text, []])
].map(encode);
const dialogue = dialogueLabels.map(label => train(label, dialogueRows));
const dialogueExact = dialogueEvaluation.filter(([text, expected]) => {
  const found = classify(features(text, embeddings), dialogue);
  return found.length === expected.length && found.every(label => expected.includes(label));
}).length;

let exact = 0;
let tp = 0;
let fp = 0;
let fn = 0;
for (const [text, expected] of evaluation) {
  const predicted = classify(features(text, embeddings), classifiers);
  if (predicted.length === expected.length && predicted.every((label) => expected.includes(label))) exact++;
  tp += predicted.filter((label) => expected.includes(label)).length;
  fp += predicted.filter((label) => !expected.includes(label)).length;
  fn += expected.filter((label) => !predicted.includes(label)).length;
}

const model = {
  version: 2, name: 'Cacahuete', tokenizer: 'BPEmb es vs3000', base, classifiers, dialogue, ranking: trainRanking(),
  evaluation: { trainingExamples: rows.length, heldOut: evaluation.length, exact, microF1: 2 * tp / (2 * tp + fp + fn),
    conversations: conversations.length, dialogueTraining: dialogueRows.length, dialogueHeldOut: dialogueEvaluation.length, dialogueExact }
};
const outputDirectory = new URL('../model/', import.meta.url);
await mkdir(outputDirectory, { recursive: true });
const pending = new URL(`interests-${randomUUID()}.tmp`, outputDirectory);
try {
  await writeFile(pending, JSON.stringify(model) + '\n');
  await rename(pending, new URL('interests.json', outputDirectory));
} finally {
  await rm(pending, { force: true });
}
console.log(JSON.stringify({ name: model.name, tokenizer: model.tokenizer, vectors: base?.name ?? null,
  ...model.evaluation, routeComparisons: model.ranking.examples, routeHeldOut: model.ranking.heldOut, routeCorrect: model.ranking.correct }, null, 2));
