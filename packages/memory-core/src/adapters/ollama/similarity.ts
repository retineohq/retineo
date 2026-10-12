import type { EmbeddingVector } from '../../ports/embedding.js';

export function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const length = Math.min(a.vector.length, b.vector.length);
  for (let i = 0; i < length; i++) {
    dot += a.vector[i] * b.vector[i];
    normA += a.vector[i] * a.vector[i];
    normB += b.vector[i] * b.vector[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dot / denominator;
}
