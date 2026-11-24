import model from '../model/interests.json' with { type: 'json' };
import { classify, features, prepareEmbeddings } from './interest-features.js';

const embeddings = prepareEmbeddings(model.base);

export function inferInterests(text) {
  return classify(features(text, embeddings), model.classifiers);
}
