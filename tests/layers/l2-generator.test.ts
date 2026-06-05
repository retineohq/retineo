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
    expect(l2.concepts).toBeInstanceOf(Array);
    expect(l2.entities).toBeInstanceOf(Array);
    expect(l2.claims).toBeInstanceOf(Array);
    expect(l2.relations).toBeInstanceOf(Array);
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
});
