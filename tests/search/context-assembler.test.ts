/**
 * Context Assembler Tests
 */

import { describe, it, expect } from 'vitest';
import { DefaultContextAssembler } from '../../packages/core/src/search/context-assembler.js';
import type { AnalyzedQuery } from '../../packages/core/src/search/query-analyzer.js';
import type { CandidateNode } from '../../packages/core/src/search/retrieval-service.js';
import type { SearchConfig } from '../../packages/core/src/storage/config.js';

const mockConfig: SearchConfig = {
  defaultLanguage: 'en',
  languageDetection: { provider: 'heuristic', fallback: 'heuristic', confidenceThreshold: 0.7 },
  semantic: { topK: 100, threshold: 0.75, hybridWeight: 0.7 },
  rerank: { topK: 10, weights: { concept: 1, claim: 0.5, summary: 0.8, language: 0.3 } },
  cascade: { budgets: { vague: 500, section: 800, precision: 1500 } },
  citations: { format: 'markdown', includeLineNumbers: true, includeTimestamps: true },
  prompts: {},
  crossLingual: { enabled: true },
};

function makeCandidate(overrides: Partial<CandidateNode> = {}): CandidateNode {
  return {
    nodeId: 'a'.repeat(64),
    score: 1.0,
    l2Summary: 'This is a summary about machine learning and neural networks.',
    l1Preview: '# Introduction\n\nMachine learning is a field.\n\n# Methods\n\nNeural networks are used.',
    l0Preview: 'Machine learning is a subset of AI. Neural networks mimic the brain.',
    lineRange: { start: 10, end: 12 },
    ...overrides,
  };
}

describe('DefaultContextAssembler', () => {
  const assembler = new DefaultContextAssembler({ config: mockConfig });

  it('assembles vague intent with L2 only', async () => {
    const query: AnalyzedQuery = {
      originalQuery: 'tell me about ML',
      language: 'en',
      confidence: 1,
      intent: 'vague',
      enrichedQuery: 'tell me about ML',
      entities: ['ml'],
      signals: [],
    };
    const ctx = await assembler.assemble(query, [makeCandidate()]);
    expect(ctx.segments.every((s) => s.level === 'L2')).toBe(true);
    expect(ctx.totalTokens).toBeGreaterThan(0);
    expect(ctx.trace.budgetTotal).toBe(8000);
  });

  it('assembles section intent with L2 + L1', async () => {
    const query: AnalyzedQuery = {
      originalQuery: 'what methods are used',
      language: 'en',
      confidence: 1,
      intent: 'section',
      enrichedQuery: 'what methods are used',
      entities: ['methods'],
      signals: [],
    };
    const ctx = await assembler.assemble(query, [makeCandidate()]);
    const levels = ctx.segments.map((s) => s.level);
    expect(levels).toContain('L2');
    expect(levels).toContain('L1');
    expect(levels).not.toContain('L0');
  });

  it('assembles precision intent with L2 + L1 + L0', async () => {
    const query: AnalyzedQuery = {
      originalQuery: 'exact text about neural networks',
      language: 'en',
      confidence: 1,
      intent: 'precision',
      enrichedQuery: 'exact text about neural networks',
      entities: ['neural networks'],
      signals: [],
    };
    const ctx = await assembler.assemble(query, [makeCandidate()]);
    const levels = ctx.segments.map((s) => s.level);
    expect(levels).toContain('L2');
    expect(levels).toContain('L1');
    expect(levels).toContain('L0');
  });

  it('respects maxTokens option', async () => {
    const query: AnalyzedQuery = {
      originalQuery: 'test',
      language: 'en',
      confidence: 1,
      intent: 'vague',
      enrichedQuery: 'test',
      entities: [],
      signals: [],
    };
    const ctx = await assembler.assemble(query, [makeCandidate()], { maxTokens: 100 });
    expect(ctx.trace.budgetTotal).toBe(100);
    expect(ctx.totalTokens).toBeLessThanOrEqual(100 + 10); // rough tolerance
  });

  it('generates citations with markdown format', async () => {
    const query: AnalyzedQuery = {
      originalQuery: 'test',
      language: 'en',
      confidence: 1,
      intent: 'precision',
      enrichedQuery: 'test',
      entities: [],
      signals: [],
    };
    const ctx = await assembler.assemble(query, [makeCandidate()]);
    expect(ctx.citations.length).toBeGreaterThan(0);
    const l0Cit = ctx.citations.find((c) => c.level === 'L0');
    expect(l0Cit).toBeDefined();
    expect(l0Cit!.content).toContain('[[');
  });

  it('supports drill-down via children', async () => {
    const query: AnalyzedQuery = {
      originalQuery: 'test',
      language: 'en',
      confidence: 1,
      intent: 'precision',
      enrichedQuery: 'test',
      entities: [],
      signals: [],
    };
    const ctx = await assembler.assemble(query, [makeCandidate()], { includeChildren: true });
    const l2Seg = ctx.segments.find((s) => s.level === 'L2');
    expect(l2Seg).toBeDefined();
    expect(l2Seg!.children).toBeDefined();
    expect(l2Seg!.children!.length).toBeGreaterThan(0);
  });

  it('reports language from query', async () => {
    const query: AnalyzedQuery = {
      originalQuery: 'тест',
      language: 'ru',
      confidence: 1,
      intent: 'vague',
      enrichedQuery: 'тест',
      entities: [],
      signals: [],
    };
    const ctx = await assembler.assemble(query, [makeCandidate()]);
    expect(ctx.language).toBe('ru');
  });
});
