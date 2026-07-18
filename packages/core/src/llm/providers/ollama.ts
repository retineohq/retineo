/**
 * RETINEO Core — Ollama Provider
 * Phase 3: LLM + Embedding via Ollama HTTP API
 */

import type { LLMProvider, EmbeddingProvider, ProviderConfig, GenerateOptions, ProviderCapabilities } from '../provider.js';

export class OllamaProvider implements LLMProvider, EmbeddingProvider {
  readonly id: string;
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.id = config.id;
    this.config = config;
  }

  private get baseUrl(): string {
    return (this.config.baseUrl ?? 'http://localhost:11434').replace(/\/$/, '');
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    const url = `${this.baseUrl}/api/generate`;
    const body = {
      model: this.config.model,
      prompt,
      stream: false,
      options: {
        temperature: options?.temperature ?? this.config.temperature ?? 0.3,
        num_predict: options?.maxTokens ?? this.config.maxTokens ?? 4096,
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 60000),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Ollama generate failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as { response?: string };
    return data.response ?? '';
  }

  async *stream(prompt: string, options?: GenerateOptions): AsyncIterable<string> {
    const url = `${this.baseUrl}/api/generate`;
    const body = {
      model: this.config.model,
      prompt,
      stream: true,
      options: {
        temperature: options?.temperature ?? this.config.temperature ?? 0.3,
        num_predict: options?.maxTokens ?? this.config.maxTokens ?? 4096,
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 60000),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Ollama stream failed: ${res.status} ${await res.text()}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('Ollama stream: no response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line) as { response?: string; done?: boolean };
          if (chunk.response) yield chunk.response;
          if (chunk.done) return;
        } catch {
          // ignore malformed lines
        }
      }
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    const url = `${this.baseUrl}/api/embed`;
    const results: number[][] = [];

    for (const text of texts) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 60000),
        body: JSON.stringify({ model: this.config.model, input: text }),
      });

      if (!res.ok) {
        throw new Error(`Ollama embed failed: ${res.status} ${await res.text()}`);
      }

      const data = (await res.json()) as { embeddings?: number[][] };
      const vec = data.embeddings?.[0];
      if (!vec) throw new Error('Ollama embed: empty response');
      results.push(vec);
    }

    return results;
  }

  async validate(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  capabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsJsonMode: false,
      maxContextLength: 32768,
    };
  }

  dimension(): number {
    // Ollama embedding dimensions vary by model; default to nomic-embed-text / all-minilm
    return (this.config.dimension as number | undefined) ?? 768;
  }
}
