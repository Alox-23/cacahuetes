import pieces from '../model/bpemb-es-pieces.json' with { type: 'json' };

const buckets = 768;
const publicRanks = new Map(pieces.slice(3).map((piece, index) => [piece, index]));

function hash(value) {
  let result = 2166136261;
  for (const character of value) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  return (result >>> 0) % buckets;
}

function subwords(word, ranks) {
  const pieces = [...`▁${word}`];
  while (pieces.length > 1) {
    let best = -1;
    let rank = Infinity;
    for (let index = 0; index < pieces.length - 1; index++) {
      const candidate = ranks.get(pieces[index] + pieces[index + 1]);
      if (candidate !== undefined && candidate < rank) {
        rank = candidate;
        best = index;
      }
    }
    if (best === -1) break;
    pieces.splice(best, 2, pieces[best] + pieces[best + 1]);
  }
  return pieces;
}

export function prepareEmbeddings(base) {
  if (!base) return null;
  return { dimensions: base.dimensions, ranks: new Map(base.ranks), vectors: new Map(base.vectors) };
}

export function features(text, embeddings) {
  const words = text.toLowerCase().normalize('NFKC').match(/[\p{L}]+/gu) ?? [];
  const result = new Float64Array(buckets + (embeddings?.dimensions ?? 0));
  for (const word of words) {
    const normalized = word.normalize('NFD').replace(/\p{Diacritic}/gu, '');
    result[hash(`w:${normalized}`)] += 2;
    for (const piece of subwords(word, publicRanks)) result[hash(`bpe:${piece}`)]++;
    const bounded = `^${normalized}$`;
    for (const size of [3, 4]) {
      for (let offset = 0; offset <= bounded.length - size; offset++) {
        result[hash(`${size}:${bounded.slice(offset, offset + size)}`)]++;
      }
    }
  }
  const norm = Math.hypot(...result) || 1;
  for (let index = 0; index < buckets; index++) result[index] /= norm;
  if (embeddings) {
    for (const word of words) {
      for (const piece of subwords(word, embeddings.ranks)) {
        const vector = embeddings.vectors.get(piece);
        if (vector) vector.forEach((value, index) => { result[buckets + index] += value; });
      }
    }
    const vectorNorm = Math.hypot(...result.subarray(buckets)) || 1;
    for (let index = buckets; index < result.length; index++) result[index] /= vectorNorm;
  }
  return result;
}

export function probability(input, classifier) {
  let score = classifier.bias;
  for (let index = 0; index < input.length; index++) score += input[index] * classifier.weights[index];
  return 1 / (1 + Math.exp(-score));
}

export function classify(input, classifiers) {
  return classifiers.filter((classifier) => probability(input, classifier) >= classifier.threshold)
    .map(({ label }) => label);
}
