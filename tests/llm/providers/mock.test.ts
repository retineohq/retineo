/**
 * Mock LLM Provider Tests
 */

import { describe, it, expect } from 'vitest';
import { MockLLMProvider } from '../../../packages/core/src/llm/providers/mock.js';

describe('MockLLMProvider', () => {
  const provider = new MockLLMProvider({ id: 'mock', type: 'mock', model: 'test' });

  it('generate returns deterministic text', async () => {
    const text = await provider.generate('hello world');
    expect(text).toContain('Mock response');
    expect(text).toContain('11');
  });

  it('generate returns deterministic JSON in jsonMode', async () => {
    const json = await provider.generate('explain ai', { jsonMode: true });
    const parsed = JSON.parse(json);
    expect(parsed.summary).toContain('Mock summary');
    expect(parsed.concepts).toBeInstanceOf(Array);
    expect(parsed.entities).toBeInstanceOf(Array);
    expect(parsed.claims).toBeInstanceOf(Array);
    expect(parsed.relations).toBeInstanceOf(Array);
  });

  it('embed returns deterministic normalized vectors', async () => {
    const vectors = await provider.embed(['foo', 'bar']);
    expect(vectors).toHaveLength(2);
    expect(vectors[0]).toHaveLength(provider.dimension());

    // Check normalization
    const norm = Math.sqrt(vectors[0].reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it('validate returns true', async () => {
    expect(await provider.validate()).toBe(true);
  });

  it('capabilities are correct', () => {
    const caps = provider.capabilities();
    expect(caps.supportsJsonMode).toBe(true);
    expect(caps.supportsStreaming).toBe(false);
    expect(caps.maxContextLength).toBe(4096);
  });

  it('dimension defaults to 384', () => {
    expect(provider.dimension()).toBe(384);
  });
});
