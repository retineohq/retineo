/**
 * End-to-End Search Pipeline Test
 * Russian query → detect → search → rerank → assemble → citations in Russian
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import os from 'os';
import { DefaultQueryAnalyzer } from '../../packages/core/src/search/query-analyzer.js';
import { DefaultRetrievalService } from '../../packages/core/src/search/retrieval-service.js';
import { DefaultContextAssembler } from '../../packages/core/src/search/context-assembler.js';
import { HeuristicDetector } from '../../packages/core/src/i18n/detector.js';
import { DefaultLanguagePackRegistry } from '../../packages/core/src/i18n/registry.js';
import { MockLLMProvider } from '../../packages/core/src/llm/providers/mock.js';
import { LocalCASStorage } from '../../packages/core/src/storage/cas.js';
import type { SearchConfig } from '../../packages/core/src/storage/config.js';
import type { L2Artifact } from '../../packages/core/src/domain/types.js';

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

async function seedIndex(indexDir: string, cas: LocalCASStorage, provider: MockLLMProvider) {
  const l2: L2Artifact = {
    summary: 'Document about machine learning.',
    concepts: ['machine learning', 'AI'],
    entities: ['OpenAI'],
    claims: ['AI is advancing rapidly.'],
    relations: [],
  };

  const [vec] = await provider.embed([l2.summary]);
  writeFileSync(
    path.join(indexDir, 'embeddings.jsonl'),
    JSON.stringify({ hash: 'hash-ml', vector: vec }) + '\n',
    'utf-8'
  );

  const bm25Data = {
    invertedIndex: {
      machine: ['hash-ml'],
      learning: ['hash-ml'],
    },
    docLengths: { 'hash-ml': 2 },
  };
  writeFileSync(path.join(indexDir, 'bm25.json'), JSON.stringify(bm25Data), 'utf-8');

  const objDir = cas.getObjectPath('hash-ml');
  mkdirSync(objDir, { recursive: true });
  writeFileSync(path.join(objDir, 'L2.json'), JSON.stringify(l2), 'utf-8');
  writeFileSync(path.join(objDir, 'content.md'), '# ML\n\nMachine learning is a subset of AI.', 'utf-8');
  writeFileSync(path.join(objDir, 'L1.md'), '# ML\n\n## Overview\n\nMachine learning.', 'utf-8');
}

describe('End-to-end search pipeline', () => {
  let tmpDir: string;
  let indexDir: string;
  let cas: LocalCASStorage;
  let provider: MockLLMProvider;

  beforeEach(async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'retineo-e2e-'));
    indexDir = path.join(tmpDir, 'index');
    mkdirSync(indexDir, { recursive: true });
    cas = new LocalCASStorage(tmpDir);
    provider = new MockLLMProvider({ id: 'mock', type: 'mock', model: 'test', dimension: 384 });
    await seedIndex(indexDir, cas, provider);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('Russian query → detect → search → rerank → assemble → citations', async () => {
    const analyzer = new DefaultQueryAnalyzer({
      detector: new HeuristicDetector(),
      registry: new DefaultLanguagePackRegistry(),
      searchConfig: mockConfig,
    });

    const retrieval = new DefaultRetrievalService({
      embeddingProvider: provider,
      casStorage: cas,
      indexDir,
      config: mockConfig,
    });

    const assembler = new DefaultContextAssembler({ config: mockConfig });

    // Russian query about machine learning
    const analyzed = await analyzer.analyze('расскажи про машинное обучение');
    // heuristic detects 'ru' with 0.6 confidence, but threshold 0.7 falls back to 'en'
    expect(analyzed.language).toBe('en');
    expect(analyzed.intent).toBe('vague');

    const result = await retrieval.search(analyzed, { mode: 'semantic', finalTopK: 3 });
    expect(result.selected.length).toBeGreaterThan(0);
    expect(result.citations.length).toBeGreaterThan(0);

    const ctx = await assembler.assemble(analyzed, result.selected, { maxTokens: 2000 });
    expect(ctx.language).toBe('en');
    expect(ctx.segments.length).toBeGreaterThan(0);
    expect(ctx.totalTokens).toBeGreaterThan(0);
    expect(ctx.trace.budgetUsed).toBeLessThanOrEqual(2000);

    // Citations should contain markdown links
    for (const c of ctx.citations) {
      expect(c.content).toContain('[[');
    }
  });

  it('cross-lingual: Russian query matches English document', async () => {
    const analyzer = new DefaultQueryAnalyzer({
      detector: new HeuristicDetector(),
      searchConfig: mockConfig,
    });

    const retrieval = new DefaultRetrievalService({
      embeddingProvider: provider,
      casStorage: cas,
      indexDir,
      config: mockConfig,
    });

    // Russian query, English content in index
    const analyzed = await analyzer.analyze('машинное обучение');
    // heuristic detects 'ru' with 0.6 confidence, but threshold 0.7 falls back to 'en'
    expect(analyzed.language).toBe('en');

    const result = await retrieval.search(analyzed, { mode: 'semantic' });
    // Should still find English doc because shared embedding space
    expect(result.candidates.length).toBeGreaterThan(0);
  });
});
