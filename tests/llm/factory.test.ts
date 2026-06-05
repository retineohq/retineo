/**
 * LLM Provider Factory Tests
 * Phase 7: Updated for async loadFromConfig and circuit breaker wrapping.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DefaultLLMProviderFactory, DefaultEmbeddingProviderFactory } from '../../packages/core/src/llm/factory.js';
import { MockLLMProvider } from '../../packages/core/src/llm/providers/mock.js';
import type { EchoConfig } from '../../packages/core/src/storage/config.js';

describe('DefaultLLMProviderFactory', () => {
  let factory: DefaultLLMProviderFactory;

  beforeEach(() => {
    factory = new DefaultLLMProviderFactory();
  });

  it('loads providers from config and resolves env vars', async () => {
    process.env.TEST_API_KEY = 'secret123';
    const config: EchoConfig = {
      dataDir: '/tmp/echo',
      defaultAdapter: 'file',
      llmProvider: 'openai',
      embeddingModel: 'text-embedding-3-small',
      llm: {
        defaultProvider: 'mock',
        providers: [
          { id: 'mock', type: 'mock', model: 'mock-model', apiKey: '${TEST_API_KEY}' },
        ],
      },
    } as unknown as EchoConfig;

    await factory.loadFromConfig(config);
    expect(factory.list()).toContain('mock');
    const p = factory.get('mock');
    expect(p.config.apiKey).toBe('secret123');
    delete process.env.TEST_API_KEY;
  });

  it('returns default provider', async () => {
    const config: EchoConfig = {
      dataDir: '/tmp/echo',
      defaultAdapter: 'file',
      llmProvider: 'openai',
      embeddingModel: 'text-embedding-3-small',
      llm: {
        defaultProvider: 'mock',
        providers: [{ id: 'mock', type: 'mock', model: 'mock-model' }],
      },
    } as unknown as EchoConfig;

    await factory.loadFromConfig(config);
    expect(factory.getDefault().id).toBe('mock');
  });

  it('throws when provider not found', () => {
    expect(() => factory.get('missing')).toThrow('LLM provider not found: missing');
  });

  it('allows manual registration', () => {
    const mock = new MockLLMProvider({ id: 'custom', type: 'mock', model: 'm' });
    factory.register('custom', mock);
    const wrapped = factory.get('custom');
    expect(wrapped.id).toBe('custom');
    expect(wrapped.config.model).toBe('m');
  });
});

describe('DefaultEmbeddingProviderFactory', () => {
  let factory: DefaultEmbeddingProviderFactory;

  beforeEach(() => {
    factory = new DefaultEmbeddingProviderFactory();
  });

  it('loads embedding providers from config', async () => {
    const config: EchoConfig = {
      dataDir: '/tmp/echo',
      defaultAdapter: 'file',
      llmProvider: 'openai',
      embeddingModel: 'text-embedding-3-small',
      embedding: {
        defaultProvider: 'mock-embed',
        providers: [{ id: 'mock-embed', type: 'mock', model: 'mock-embed-model' }],
      },
    } as unknown as EchoConfig;

    await factory.loadFromConfig(config);
    expect(factory.list()).toContain('mock-embed');
    expect(factory.getDefault().id).toBe('mock-embed');
  });
});
