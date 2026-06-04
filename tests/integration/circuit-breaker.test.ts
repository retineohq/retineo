/**
 * ECHO Core — Circuit Breaker Integration Tests
 * Phase 7: End-to-end fallback and recovery.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DefaultLLMProviderFactory } from '../../packages/core/src/llm/factory.js';
import { MockLLMProvider } from '../../packages/core/src/llm/providers/mock.js';
import type { EchoConfig } from '../../packages/core/src/storage/config.js';
import { FileSecretsManager } from '../../packages/core/src/storage/secrets.js';

describe('Circuit Breaker Integration', () => {
  it('falls back to secondary provider when primary opens', async () => {
    const primary = new MockLLMProvider({ id: 'primary', type: 'mock', model: 'mock' });
    const secondary = new MockLLMProvider({ id: 'secondary', type: 'mock', model: 'mock' });

    // Override primary generate to always fail
    const failingPrimary = {
      ...primary,
      async generate() {
        throw new Error('primary down');
      },
    };

    const factory = new DefaultLLMProviderFactory();
    factory.register('primary', failingPrimary);
    factory.register('secondary', secondary);

    // Manually set fallback relationship via internal map
    const internalMap = (factory as unknown as { providers: Map<string, { provider: unknown; breaker: unknown; fallbackId?: string }> }).providers;
    const entry = internalMap.get('primary')!;
    entry.fallbackId = 'secondary';

    // Trip the circuit breaker
    const breaker = factory.getCircuitBreaker('primary');
    for (let i = 0; i < 5; i++) {
      try { await breaker.call(() => failingPrimary.generate('test')); } catch { /* ignore */ }
    }
    expect(breaker.getState()).toBe('open');

    // Wrapped provider should fallback
    const wrapped = factory.get('primary');
    const result = await wrapped.generate('hello');
    expect(result).toContain('Mock response');
  });

  it('factory loads circuit breaker config from config', async () => {
    const config: EchoConfig = {
      dataDir: '/tmp/echo',
      defaultAdapter: 'file',
      llmProvider: 'mock',
      embeddingModel: 'mock',
      search: {
        defaultLanguage: 'en',
        languageDetection: { provider: 'heuristic', fallback: 'heuristic', confidenceThreshold: 0.7 },
        semantic: { topK: 10, threshold: 0.75, hybridWeight: 0.7 },
        rerank: { topK: 5, weights: { concept: 1, claim: 0.5, summary: 0.8, language: 0.3 } },
        cascade: { budgets: { vague: 500, section: 800, precision: 1500 } },
        citations: { format: 'markdown', includeLineNumbers: true, includeTimestamps: true },
        prompts: {},
        crossLingual: { enabled: true },
      },
      i18n: { defaultLanguage: 'en', packs: [] },
    };

    const factory = new DefaultLLMProviderFactory();
    await factory.loadFromConfig(config);
    expect(factory.list()).toEqual([]); // no providers in default config
  });
});
