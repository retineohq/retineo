import { describe, it, expect } from 'vitest';
import { OllamaEmbeddingModel } from '../src/adapters/ollama/embedding.js';
import { cosineSimilarity } from '../src/adapters/ollama/similarity.js';

describe('OllamaEmbeddingModel', () => {
  it('constructor defaults to nomic-embed-text at 127.0.0.1:11434', () => {
    const model = new OllamaEmbeddingModel();
    expect(model).toBeInstanceOf(OllamaEmbeddingModel);
  });

  it('constructor accepts explicit baseUrl/model/timeout', () => {
    const model = new OllamaEmbeddingModel({
      baseUrl: 'http://localhost:9999',
      model: 'custom-model',
      timeoutMs: 5000,
    });
    expect(model).toBeInstanceOf(OllamaEmbeddingModel);
  });

  it('embedAsync: ECONNREFUSED throws descriptive error (without ollama running)', async () => {
    const model = new OllamaEmbeddingModel({ baseUrl: 'http://127.0.0.1:59999', timeoutMs: 1000 });
    await expect(model.embedAsync('test')).rejects.toThrow(/request failed|fetch failed/i);
  }, 10_000);

  it('cosineSimilarity: identical vectors = 1', () => {
    const a = { vector: [1, 0, 0], dimensions: 3 };
    const b = { vector: [1, 0, 0], dimensions: 3 };
    expect(cosineSimilarity(a, b)).toBeCloseTo(1);
  });

  it('cosineSimilarity: orthogonal vectors = 0', () => {
    const a = { vector: [1, 0, 0], dimensions: 3 };
    const b = { vector: [0, 1, 0], dimensions: 3 };
    expect(cosineSimilarity(a, b)).toBeCloseTo(0);
  });

  it('cosineSimilarity: opposite vectors = -1', () => {
    const a = { vector: [1, 0], dimensions: 2 };
    const b = { vector: [-1, 0], dimensions: 2 };
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1);
  });

  it('cosineSimilarity: zero vector returns 0 (no NaN)', () => {
    const a = { vector: [0, 0], dimensions: 2 };
    const b = { vector: [1, 1], dimensions: 2 };
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('cosineSimilarity: different dimensions use min length', () => {
    const a = { vector: [1, 2], dimensions: 2 };
    const b = { vector: [1, 2, 3], dimensions: 3 };
    expect(cosineSimilarity(a, b)).toBeCloseTo(1);
  });

  it('parseEmbedding: valid embedding field parses', () => {
    const model = new OllamaEmbeddingModel();
    const parsed = (model as any).parseEmbedding(JSON.stringify({ embedding: [0.1, 0.2, 0.3] }));
    expect(parsed).toEqual([0.1, 0.2, 0.3]);
  });

  it('parseEmbedding: embeddings[0] field parses (newer ollama response)', () => {
    const model = new OllamaEmbeddingModel();
    const parsed = (model as any).parseEmbedding(JSON.stringify({ embeddings: [[0.1, 0.2]] }));
    expect(parsed).toEqual([0.1, 0.2]);
  });

  it('parseEmbedding: unexpected shape throws', () => {
    const model = new OllamaEmbeddingModel();
    expect(() => (model as any).parseEmbedding(JSON.stringify({ foo: 'bar' }))).toThrow('unexpected response shape');
  });

  it('parseEmbedding: non-numeric values throws', () => {
    const model = new OllamaEmbeddingModel();
    expect(() => (model as any).parseEmbedding(JSON.stringify({ embedding: ['a', 'b'] }))).toThrow('unexpected response shape');
  });
});
