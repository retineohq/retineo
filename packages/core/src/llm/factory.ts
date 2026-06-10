/**
 * RETINEO Core — LLM & Embedding Provider Factory
 * Phase 7: Config-driven provider loading with circuit breaker, fallback, and secret resolution.
 */

import type { RetineoConfig } from '../storage/config.js';
import type { SecretsManager } from '../storage/secrets.js';
import type { LLMProvider, EmbeddingProvider, ProviderConfig } from './provider.js';
import { SemaphoreRateLimiter, type RateLimiter } from './rate-limiter.js';
import { OllamaProvider } from './providers/ollama.js';
import { OpenAICompatibleProvider } from './providers/openai-compatible.js';
import { MockLLMProvider } from './providers/mock.js';
import { DefaultCircuitBreaker, type CircuitBreaker, type CircuitBreakerConfig } from './circuit-breaker.js';
import { resolveConfigValue } from '../storage/secrets.js';
import { LLMCircuitOpen, LLMError } from '../utils/errors.js';

export interface LLMProviderFactory {
  loadFromConfig(config: RetineoConfig, secrets?: SecretsManager): Promise<void>;
  get(id: string): LLMProvider;
  getDefault(): LLMProvider;
  list(): string[];
  register(id: string, provider: LLMProvider): void;
  getRateLimiter(): RateLimiter;
  getCircuitBreaker(id: string): CircuitBreaker;
  resetCircuitBreaker(id: string): void;
  getFallback(id: string): LLMProvider | undefined;
}

export interface EmbeddingProviderFactory {
  loadFromConfig(config: RetineoConfig, secrets?: SecretsManager): Promise<void>;
  get(id: string): EmbeddingProvider;
  getDefault(): EmbeddingProvider;
  list(): string[];
  register(id: string, provider: EmbeddingProvider): void;
  getRateLimiter(): RateLimiter;
  getCircuitBreaker(id: string): CircuitBreaker;
  resetCircuitBreaker(id: string): void;
  getFallback(id: string): EmbeddingProvider | undefined;
}

interface ProviderEntry<T> {
  provider: T;
  breaker: CircuitBreaker;
  fallbackId?: string;
}

async function resolveProviderConfig(raw: ProviderConfig, secrets?: SecretsManager): Promise<ProviderConfig> {
  const resolved: ProviderConfig = { ...raw };
  if (resolved.apiKey) {
    resolved.apiKey = await resolveConfigValue(resolved.apiKey, secrets);
  }
  if (resolved.baseUrl) {
    resolved.baseUrl = await resolveConfigValue(resolved.baseUrl, secrets);
  }
  return resolved;
}

function createCircuitBreakerConfig(raw?: Record<string, unknown>): CircuitBreakerConfig {
  return {
    failureThreshold: (raw?.failureThreshold as number) ?? 5,
    recoveryTimeoutMs: (raw?.recoveryTimeoutMs as number) ?? 30000,
    halfOpenMaxCalls: (raw?.halfOpenMaxCalls as number) ?? 1,
  };
}

export class DefaultLLMProviderFactory implements LLMProviderFactory {
  private providers = new Map<string, ProviderEntry<LLMProvider>>();
  private defaultId = '';
  private rateLimiter = new SemaphoreRateLimiter();

  async loadFromConfig(config: RetineoConfig, secrets?: SecretsManager): Promise<void> {
    const llmConfig = (config as unknown as Record<string, unknown>).llm as
      | { defaultProvider?: string; providers?: Array<ProviderConfig & { fallback?: string; circuitBreaker?: Record<string, unknown> }> }
      | undefined;

    if (!llmConfig?.providers) return;

    this.defaultId = llmConfig.defaultProvider ?? llmConfig.providers[0]?.id ?? '';

    for (const raw of llmConfig.providers) {
      const cfg = await resolveProviderConfig(raw, secrets);
      const provider = this.createProvider(cfg);
      const breaker = new DefaultCircuitBreaker(createCircuitBreakerConfig(raw.circuitBreaker));
      this.providers.set(cfg.id, { provider, breaker, fallbackId: raw.fallback });
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
    const entry = this.providers.get(id);
    if (!entry) throw new Error(`LLM provider not found: ${id}`);
    return this.wrapWithCircuitBreaker(entry);
  }

  getDefault(): LLMProvider {
    if (!this.defaultId) throw new Error('No default LLM provider configured');
    return this.get(this.defaultId);
  }

  list(): string[] {
    return Array.from(this.providers.keys());
  }

  register(id: string, provider: LLMProvider): void {
    const breaker = new DefaultCircuitBreaker();
    this.providers.set(id, { provider, breaker });
    this.rateLimiter.register(id, provider.config.concurrency ?? 1);
  }

  getRateLimiter(): RateLimiter {
    return this.rateLimiter;
  }

  getCircuitBreaker(id: string): CircuitBreaker {
    return this.providers.get(id)?.breaker ?? new DefaultCircuitBreaker();
  }

  resetCircuitBreaker(id: string): void {
    this.providers.get(id)?.breaker.reset();
  }

  getFallback(id: string): LLMProvider | undefined {
    const entry = this.providers.get(id);
    if (!entry?.fallbackId) return undefined;
    const fallbackEntry = this.providers.get(entry.fallbackId);
    if (!fallbackEntry) return undefined;
    return this.wrapWithCircuitBreaker(fallbackEntry);
  }

  private wrapWithCircuitBreaker(entry: ProviderEntry<LLMProvider>): LLMProvider {
    const original = entry.provider;
    const breaker = entry.breaker;

    return {
      get id() { return original.id; },
      get config() { return original.config; },

      generate: async (prompt: string, options?) => {
        try {
          return await breaker.call(() => original.generate(prompt, options));
        } catch (err) {
          if (breaker.getState() === 'open') {
            const fallback = this.getFallback(original.id);
            if (fallback) {
              return fallback.generate(prompt, options);
            }
            throw LLMCircuitOpen(original.id, err instanceof Error ? err : undefined);
          }
          throw err;
        }
      },

      stream: (prompt: string, options?) => {
        if (!original.stream) throw new Error('Provider does not support streaming');
        return original.stream(prompt, options);
      },

      async validate() {
        try {
          return await breaker.call(() => original.validate());
        } catch {
          return false;
        }
      },

      capabilities() {
        return original.capabilities();
      },
    };
  }
}

export class DefaultEmbeddingProviderFactory implements EmbeddingProviderFactory {
  private providers = new Map<string, ProviderEntry<EmbeddingProvider>>();
  private defaultId = '';
  private rateLimiter = new SemaphoreRateLimiter();

  async loadFromConfig(config: RetineoConfig, secrets?: SecretsManager): Promise<void> {
    const embedConfig = (config as unknown as Record<string, unknown>).embedding as
      | { defaultProvider?: string; providers?: Array<ProviderConfig & { fallback?: string; circuitBreaker?: Record<string, unknown> }> }
      | undefined;

    if (!embedConfig?.providers) return;

    this.defaultId = embedConfig.defaultProvider ?? embedConfig.providers[0]?.id ?? '';

    for (const raw of embedConfig.providers) {
      const cfg = await resolveProviderConfig(raw, secrets);
      const provider = this.createProvider(cfg);
      const breaker = new DefaultCircuitBreaker(createCircuitBreakerConfig(raw.circuitBreaker));
      this.providers.set(cfg.id, { provider, breaker, fallbackId: raw.fallback });
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
    const entry = this.providers.get(id);
    if (!entry) throw new Error(`Embedding provider not found: ${id}`);
    return this.wrapWithCircuitBreaker(entry);
  }

  getDefault(): EmbeddingProvider {
    if (!this.defaultId) throw new Error('No default embedding provider configured');
    return this.get(this.defaultId);
  }

  list(): string[] {
    return Array.from(this.providers.keys());
  }

  register(id: string, provider: EmbeddingProvider): void {
    const breaker = new DefaultCircuitBreaker();
    this.providers.set(id, { provider, breaker });
    this.rateLimiter.register(id, provider.config.concurrency ?? 1);
  }

  getRateLimiter(): RateLimiter {
    return this.rateLimiter;
  }

  getCircuitBreaker(id: string): CircuitBreaker {
    return this.providers.get(id)?.breaker ?? new DefaultCircuitBreaker();
  }

  resetCircuitBreaker(id: string): void {
    this.providers.get(id)?.breaker.reset();
  }

  getFallback(id: string): EmbeddingProvider | undefined {
    const entry = this.providers.get(id);
    if (!entry?.fallbackId) return undefined;
    const fallbackEntry = this.providers.get(entry.fallbackId);
    if (!fallbackEntry) return undefined;
    return this.wrapWithCircuitBreaker(fallbackEntry);
  }

  private wrapWithCircuitBreaker(entry: ProviderEntry<EmbeddingProvider>): EmbeddingProvider {
    const original = entry.provider;
    const breaker = entry.breaker;

    return {
      get id() { return original.id; },
      get config() { return original.config; },

      embed: async (texts: string[]) => {
        try {
          return await breaker.call(() => original.embed(texts));
        } catch (err) {
          if (breaker.getState() === 'open') {
            const fallback = this.getFallback(original.id);
            if (fallback) {
              return fallback.embed(texts);
            }
            const message = original.id.includes('ollama')
              ? `Ollama embed model not responding — check model settings and ensure Ollama is running`
              : `LLM provider circuit breaker open: ${original.id}`;
            throw new LLMError('LLM_CIRCUIT_OPEN', message, 503, { providerId: original.id }, err instanceof Error ? err : undefined);
          }
          throw err;
        }
      },

      async validate() {
        try {
          return await breaker.call(() => original.validate());
        } catch {
          return false;
        }
      },

      dimension() {
        return original.dimension();
      },
    };
  }
}
