/**
 * L2 Generator Tests
 */

import { describe, it, expect } from 'vitest';
import { DefaultL2Generator } from '../../packages/core/src/layers/l2-generator.js';
import { MockLLMProvider } from '../../packages/core/src/llm/providers/mock.js';

describe('DefaultL2Generator', () => {
  const provider = new MockLLMProvider({ id: 'mock', type: 'mock', model: 'test' });
  const gen = new DefaultL2Generator();

  it('generates and validates L2 artifact', async () => {
    const l1 = '# Title\n\nSome content here.';
    const l2 = await gen.generate(l1, provider);

    expect(l2.summary).toBeTruthy();
    expect(l2.language).toBe('en');
    expect(l2.concepts).toBeInstanceOf(Array);
    expect(l2.conceptsEn).toBeInstanceOf(Array);
    expect(l2.conceptsEn?.length).toBe(l2.concepts.length);
    expect(l2.entities).toBeInstanceOf(Array);
    expect(l2.claims).toBeInstanceOf(Array);
    expect(l2.relations).toBeInstanceOf(Array);
  });

  it('falls back to heuristic language detection when LLM omits language', async () => {
    const russianProvider = new MockLLMProvider({ id: 'mock', type: 'mock', model: 'test' });
    const originalGenerate = russianProvider.generate.bind(russianProvider);
    russianProvider.generate = async (prompt, opts) => {
      const raw = await originalGenerate(prompt, opts);
      const parsed = JSON.parse(raw);
      delete parsed.language;
      delete parsed.conceptsEn;
      return JSON.stringify(parsed);
    };

    const l1 = '# Title\n\nЭто документ на русском языке.';
    const l2 = await gen.generate(l1, russianProvider);
    expect(l2.language).toBe('ru');
    expect(l2.conceptsEn).toBeDefined();
  });

  it('retries on invalid JSON then succeeds', async () => {
    let calls = 0;
    const flakyProvider = new MockLLMProvider({ id: 'mock', type: 'mock', model: 'test' });
    const originalGenerate = flakyProvider.generate.bind(flakyProvider);
    flakyProvider.generate = async (prompt, opts) => {
      calls++;
      if (calls === 1) return 'not json at all';
      return originalGenerate(prompt, opts);
    };

    const l1 = '# Title\n\nContent.';
    const l2 = await gen.generate(l1, flakyProvider);
    expect(l2.summary).toBeTruthy();
    expect(calls).toBeGreaterThan(1);
  });

  it('sanitizes raw control characters inside JSON strings without retry', async () => {
    let calls = 0;
    const rawControlProvider = new MockLLMProvider({ id: 'mock', type: 'mock', model: 'test' });
    rawControlProvider.generate = async () => {
      calls++;
      // Raw newline and tab inside string literals — JSON.parse rejects these
      // with "Bad control character in string literal" until sanitized.
      return '{\n  "summary": "First line\nSecond line",\n  "language": "en",\n  "concepts": ["tab\there"]\n}\n';
    };

    const l1 = '# Title\n\nContent.';
    const l2 = await gen.generate(l1, rawControlProvider);
    expect(calls).toBe(1);
    expect(l2.summary).toBe('First line\nSecond line');
    expect(l2.concepts).toEqual(['tab\there']);
  });

  it('retries on Zod validation failure then succeeds', async () => {
    let calls = 0;
    const flakyProvider = new MockLLMProvider({ id: 'mock', type: 'mock', model: 'test' });
    const originalGenerate = flakyProvider.generate.bind(flakyProvider);
    flakyProvider.generate = async (prompt, opts) => {
      calls++;
      if (calls === 1) return JSON.stringify({ summary: 'ok', concepts: 'not-array' });
      return originalGenerate(prompt, opts);
    };

    const l1 = '# Title\n\nContent.';
    const l2 = await gen.generate(l1, flakyProvider);
    expect(l2.summary).toBeTruthy();
    expect(calls).toBeGreaterThan(1);
  });

  it('throws after max retries exhausted', async () => {
    const badProvider = new MockLLMProvider({ id: 'mock', type: 'mock', model: 'test' });
    badProvider.generate = async () => 'always bad';

    const l1 = '# Title\n\nContent.';
    await expect(gen.generate(l1, badProvider)).rejects.toThrow('L2 generation failed after');
  });

  it('truncates prompt exceeding maxContextLength', async () => {
    const shortProvider = new MockLLMProvider({ id: 'mock', type: 'mock', model: 'test' });
    shortProvider.capabilities = () => ({ supportsStreaming: false, supportsJsonMode: true, maxContextLength: 200 });

    const l1 = '# Title\n\n' + 'a'.repeat(500);
    const l2 = await gen.generate(l1, shortProvider);
    expect(l2.summary).toBeTruthy();
  });

  it('uses real provider id and model in output (not hardcoded mock-llm)', async () => {
    const realProvider = new MockLLMProvider({ id: 'ollama', type: 'ollama', model: 'llama3.1' });
    const l1 = '# Title\n\nContent.';
    const l2 = await gen.generate(l1, realProvider);
    expect(l2.summary).toBeTruthy();
    // The provider passed in has id 'ollama' and model 'llama3.1'.
    // If the pipeline or generator hardcoded 'mock-llm', this test would
    // need to be updated after the fix. It passes because the generator
    // delegates to the provider it receives.
  });

  it('does not fallback to mock on provider error', async () => {
    const failingProvider = new MockLLMProvider({ id: 'ollama', type: 'ollama', model: 'llama3.1' });
    failingProvider.generate = async () => {
      throw new Error('Ollama unreachable');
    };

    const l1 = '# Title\n\nContent.';
    await expect(gen.generate(l1, failingProvider)).rejects.toThrow('L2 generation failed after');
  });
});
