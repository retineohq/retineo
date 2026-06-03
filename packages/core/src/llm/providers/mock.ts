/**
 * ECHO Core — Mock LLM Provider
 * Phase 3: Deterministic provider for tests. Hash(prompt) → fixed response.
 */

import crypto from 'crypto';
import type { LLMProvider, EmbeddingProvider, ProviderConfig, GenerateOptions, ProviderCapabilities } from '../provider.js';

function hashString(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export class MockLLMProvider implements LLMProvider, EmbeddingProvider {
  readonly id: string;
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.id = config.id;
    this.config = config;
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    const h = hashString(prompt);
    const prefix = h.slice(0, 8);

    if (options?.jsonMode) {
      return JSON.stringify({
        summary: `Mock summary for prompt hash ${prefix}`,
        concepts: ['mock-concept-a', 'mock-concept-b'],
        entities: ['mock-entity-1'],
        claims: [`Mock claim from hash ${prefix}`],
        relations: [{ source: 'mock-concept-a', target: 'mock-concept-b', type: 'related_to' }],
      });
    }

    return `Mock response for prompt hash ${prefix}. Prompt length: ${prompt.length}`;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const dim = this.dimension();
    return texts.map((text) => {
      const h = hashString(text);
      // Deterministic pseudo-random vector from hash bytes
      const vec: number[] = [];
      for (let i = 0; i < dim; i++) {
        const byteIdx = i % h.length;
        const val = parseInt(h.slice(byteIdx, byteIdx + 2), 16) / 255;
        vec.push(val);
      }
      // Normalize to unit length
      const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
      return vec.map((v) => v / (norm || 1));
    });
  }

  async validate(): Promise<boolean> {
    return true;
  }

  capabilities(): ProviderCapabilities {
    return {
      supportsStreaming: false,
      supportsJsonMode: true,
      maxContextLength: 4096,
    };
  }

  dimension(): number {
    return (this.config.dimension as number | undefined) ?? 384;
  }
}
