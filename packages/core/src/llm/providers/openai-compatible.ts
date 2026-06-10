/**
 * RETINEO Core — OpenAI-Compatible Provider
 * Phase 3: LLM + Embedding via OpenAI-compatible HTTP API
 * Works with OpenAI, OpenRouter, DeepSeek, and any /chat/completions + /embeddings API
 */

import type { LLMProvider, EmbeddingProvider, ProviderConfig, GenerateOptions, ProviderCapabilities } from '../provider.js';

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
}

interface EmbeddingResponse {
  data?: Array<{
    embedding?: number[];
  }>;
}

export class OpenAICompatibleProvider implements LLMProvider, EmbeddingProvider {
  readonly id: string;
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.id = config.id;
    this.config = config;
  }

  private get baseUrl(): string {
    return (this.config.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  }

  private get headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.apiKey) h['Authorization'] = `Bearer ${this.config.apiKey}`;
    return h;
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    const url = `${this.baseUrl}/chat/completions`;
    const messages: ChatMessage[] = [];
    if (options?.systemPrompt) messages.push({ role: 'system', content: options.systemPrompt });
    messages.push({ role: 'user', content: prompt });

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages,
      temperature: options?.temperature ?? this.config.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? this.config.maxTokens ?? 4096,
    };

    if (options?.jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 30000),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`OpenAI-compatible generate failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as ChatCompletionResponse;
    return data.choices?.[0]?.message?.content ?? '';
  }

  async embed(texts: string[]): Promise<number[][]> {
    const url = `${this.baseUrl}/embeddings`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 30000),
      body: JSON.stringify({
        model: this.config.model,
        input: texts,
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI-compatible embed failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as EmbeddingResponse;
    if (!data.data) throw new Error('OpenAI-compatible embed: empty response');
    return data.data.map((d) => d.embedding ?? []);
  }

  async validate(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: this.headers,
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  capabilities(): ProviderCapabilities {
    return {
      supportsStreaming: false,
      supportsJsonMode: true,
      maxContextLength: 128000,
    };
  }

  dimension(): number {
    return (this.config.dimension as number | undefined) ?? 1536;
  }
}
