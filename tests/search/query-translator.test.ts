/**
 * Query Translator Tests
 */

import { describe, it, expect } from 'vitest';
import { NoOpQueryTranslator, LLMQueryTranslator } from '../../packages/core/src/search/query-translator.js';
import { MockLLMProvider } from '../../packages/core/src/llm/providers/mock.js';

describe('NoOpQueryTranslator', () => {
  it('returns empty English translations', async () => {
    const t = new NoOpQueryTranslator();
    const result = await t.translate(['foo', 'bar'], 'ru');
    expect(result.original).toEqual(['foo', 'bar']);
    expect(result.english).toEqual([]);
  });
});

describe('LLMQueryTranslator', () => {
  it('returns parsed translations', async () => {
    const provider = new MockLLMProvider({ id: 'mock', type: 'mock', model: 'test' });
    provider.generate = async () => JSON.stringify({ translations: ['machine', 'learning'] });
    const t = new LLMQueryTranslator(provider);
    const result = await t.translate(['машинное', 'обучение'], 'ru');
    expect(result.english).toEqual(['machine', 'learning']);
  });

  it('falls back to empty translations on invalid JSON', async () => {
    const provider = new MockLLMProvider({ id: 'mock', type: 'mock', model: 'test' });
    provider.generate = async () => 'not json';
    const t = new LLMQueryTranslator(provider);
    const result = await t.translate(['foo'], 'ru');
    expect(result.english).toEqual([]);
  });

  it('falls back to empty translations when length mismatches', async () => {
    const provider = new MockLLMProvider({ id: 'mock', type: 'mock', model: 'test' });
    provider.generate = async () => JSON.stringify({ translations: ['only one'] });
    const t = new LLMQueryTranslator(provider);
    const result = await t.translate(['foo', 'bar'], 'ru');
    expect(result.english).toEqual([]);
  });

  it('returns empty for English source', async () => {
    const provider = new MockLLMProvider({ id: 'mock', type: 'mock', model: 'test' });
    const t = new LLMQueryTranslator(provider);
    const result = await t.translate(['foo'], 'en');
    expect(result.english).toEqual([]);
  });
});
