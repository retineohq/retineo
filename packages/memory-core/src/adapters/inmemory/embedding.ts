import type { EmbeddingModel, EmbeddingVector } from '../../ports/embedding.js';

export class HashEmbeddingModel implements EmbeddingModel {
  private readonly dimensions: number;

  constructor(dimensions: number = 64) {
    this.dimensions = dimensions;
  }

  embed(text: string): EmbeddingVector {
    const vector = new Array(this.dimensions).fill(0);
    const tokens = text.toLowerCase().split(/[^a-zа-яё0-9]+/).filter((token) => token.length > 2);
    for (const token of tokens) {
      let hash = 0;
      for (let i = 0; i < token.length; i++) {
        hash = ((hash << 5) - hash + token.charCodeAt(i)) | 0;
      }
      const index = Math.abs(hash) % this.dimensions;
      vector[index] += 1;
    }
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (norm > 0) {
      for (let i = 0; i < this.dimensions; i++) {
        vector[i] /= norm;
      }
    }
    return { vector, dimensions: this.dimensions };
  }

  cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.dimensions; i++) {
      dot += a.vector[i] * b.vector[i];
      normA += a.vector[i] * a.vector[i];
      normB += b.vector[i] * b.vector[i];
    }
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dot / denominator;
  }
}
