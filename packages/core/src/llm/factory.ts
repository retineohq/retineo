/**
 * ECHO Core — LLM & Embedding Provider Factory
 * Phase 3: Config-driven provider loading with env var resolution
 */

import type { EchoConfig } from '../storage/config.js';
import type { LLMProvider, EmbeddingProvider, ProviderConfig } from './provider.js';
import { SemaphoreRateLimiter, type RateLimiter } from './rate-limiter.js';
import { OllamaProvider } from './providers/ollama.js';
import { OpenAICompatibleProvider } from './providers/openai-compatible.js';
import { MockLLMProvider } from './providers/mock.js';

export interface LLMProviderFactory {
  loadFromConfig(config: EchoConfig): void;
  get(id: string): LLMProvider;
  getDefault(): LLMProvider;
  list(): string[];
  register(id: string, provider: LLMProvider): void;
  getRateLimiter(): RateLimiter;
}

export interface EmbeddingProviderFactory {
  loadFromConfig(config: EchoConfig): void;
  get(id: string): EmbeddingProvider;
  getDefault(): EmbeddingProvider;
  list(): string[];
  register(id: string, provider: EmbeddingProvider): void;
  getRateLimiter(): RateLimiter;
}

function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, name) => process.env[name] ?? '');
}

function resolveConfig(config: ProviderConfig): ProviderConfig {
  const resolved: ProviderConfig = { ...config };
  if (resolved.apiKey) resolved.apiKey = resolveEnvVars(resolved.apiKey);
  if (resolved.baseUrl) resolved.baseUrl = resolveEnvVars(resolved.baseUrl);
  return resolved;
}

export class DefaultLLMProviderFactory implements LLMProviderFactory {
  private providers = new Map<string, LLMProvider>();
  private defaultId = '';
  private rateLimiter = new SemaphoreRateLimiter();

  loadFromConfig(config: EchoConfig): void {
    const llmConfig = (config as unknown as Record<string, unknown>).llm as
      | { defaultProvider?: string; providers?: ProviderConfig[] }
      | undefined;

    if (!llmConfig?.providers) return;

    this.defaultId = llmConfig.defaultProvider ?? llmConfig.providers[0]?.id ?? '';

    for (const raw of llmConfig.providers) {
      const cfg = resolveConfig(raw);
      const provider = this.createProvider(cfg);
      this.providers.set(cfg.id, provider);
      this.rateLimiter.register(cfg.id, cfg.concurrency ?? 1);
    }
  }

  private createProvider(config: ProviderConfig): LLMProvider {
    switch (config.type) {
      case 'ollama':
        return new OllamaProvider(config);
      case 'openai-compatible':
        return new OpenAICompatibleProvider(config);
      case 'mock':
        return new MockLLMProvider(config);
      default:
        throw new Error(`Unknown LLM provider type: ${config.type}`);
    }
  }

  get(id: string): LLMProvider {
    const p = this.providers.get(id);
    if (!p) throw new Error(`LLM provider not found: ${id}`);
    return p;
  }

  getDefault(): LLMProvider {
    if (!this.defaultId) throw new Error('No default LLM provider configured');
    return this.get(this.defaultId);
  }

  list(): string[] {
    return Array.from(this.providers.keys());
  }

  register(id: string, provider: LLMProvider): void {
    this.providers.set(id, provider);
    this.rateLimiter.register(id, provider.config.concurrency ?? 1);
  }

  getRateLimiter(): RateLimiter {
    return this.rateLimiter;
  }
}

export class DefaultEmbeddingProviderFactory implements EmbeddingProviderFactory {
  private providers = new Map<string, EmbeddingProvider>();
  private defaultId = '';
  private rateLimiter = new SemaphoreRateLimiter();

  loadFromConfig(config: EchoConfig): void {
    const embedConfig = (config as unknown as Record<string, unknown>).embedding as
      | { defaultProvider?: string; providers?: ProviderConfig[] }
      | undefined;

    if (!embedConfig?.providers) return;

    this.defaultId = embedConfig.defaultProvider ?? embedConfig.providers[0]?.id ?? '';

    for (const raw of embedConfig.providers) {
      const cfg = resolveConfig(raw);
      const provider = this.createProvider(cfg);
      this.providers.set(cfg.id, provider);
      this.rateLimiter.register(cfg.id, cfg.concurrency ?? 1);
    }
  }

  private createProvider(config: ProviderConfig): EmbeddingProvider {
    switch (config.type) {
      case 'ollama':
        return new OllamaProvider(config);
      case 'openai-compatible':
        return new OpenAICompatibleProvider(config);
      case 'mock':
        return new MockLLMProvider(config);
      default:
        throw new Error(`Unknown embedding provider type: ${config.type}`);
    }
  }

  get(id: string): EmbeddingProvider {
    const p = this.providers.get(id);
    if (!p) throw new Error(`Embedding provider not found: ${id}`);
    return p;
  }

  getDefault(): EmbeddingProvider {
    if (!this.defaultId) throw new Error('No default embedding provider configured');
    return this.get(this.defaultId);
  }

  list(): string[] {
    return Array.from(this.providers.keys());
  }

  register(id: string, provider: EmbeddingProvider): void {
    this.providers.set(id, provider);
    this.rateLimiter.register(id, provider.config.concurrency ?? 1);
  }

  getRateLimiter(): RateLimiter {
    return this.rateLimiter;
  }
}
