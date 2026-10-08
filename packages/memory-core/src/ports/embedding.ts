export interface EmbeddingVector {
  vector: number[];
  dimensions: number;
}

export interface EmbeddingModel {
  embed(text: string): EmbeddingVector;
  cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number;
}
