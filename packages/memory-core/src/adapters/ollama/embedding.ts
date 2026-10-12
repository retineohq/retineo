import type { EmbeddingVector } from '../../ports/embedding.js';
import { cosineSimilarity } from './similarity.js';

export interface OllamaEmbeddingOptions {
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}

export class OllamaEmbeddingModel {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(options: OllamaEmbeddingOptions = {}) {
    this.baseUrl = (options.baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434').replace(/\/$/, '');
    this.model = options.model ?? process.env.OLLAMA_EMBEDDING_MODEL ?? 'nomic-embed-text';
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  async embedAsync(text: string): Promise<EmbeddingVector> {
    const response = await this.requestEmbeddingAsync(text);
    const vector = this.parseEmbedding(response.body);
    return { vector, dimensions: vector.length };
  }

  cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
    return cosineSimilarity(a, b);
  }

  private parseEmbedding(body: string): number[] {
    const parsed = JSON.parse(body) as { embedding?: unknown; embeddings?: unknown };
    const embedding = Array.isArray(parsed.embedding)
      ? parsed.embedding
      : Array.isArray(parsed.embeddings) && Array.isArray(parsed.embeddings[0])
        ? parsed.embeddings[0]
        : null;
    if (!embedding || !embedding.every((value) => typeof value === 'number')) {
      throw new Error(`OllamaEmbeddingModel: unexpected response shape for model ${this.model}`);
    }
    return embedding as number[];
  }

  private async requestEmbeddingAsync(text: string): Promise<{ ok: boolean; status: number; body: string }> {
    const url = `${this.baseUrl}/api/embeddings`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt: text }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      return { ok: response.ok, status: response.status, body: await response.text() };
    } catch (error) {
      throw new Error(`OllamaEmbeddingModel: request failed: ${(error as Error).message}`);
    }
  }
}
