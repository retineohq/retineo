/**
 * Retrieval Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import os from 'os';
import { DefaultRetrievalService } from '../../packages/core/src/search/retrieval-service.js';
import { MockLLMProvider } from '../../packages/core/src/llm/providers/mock.js';
import { LocalCASStorage } from '../../packages/core/src/storage/cas.js';
import type { AnalyzedQuery } from '../../packages/core/src/search/query-analyzer.js';
import type { L2Artifact } from '../../packages/core/src/domain/types.js';
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

function createL2(summary: string, concepts: string[], language = 'en'): L2Artifact {
  return {
    summary,
    language,
    concepts,
    conceptsEn: language === 'en' ? undefined : concepts,
    entities: [],
    claims: [],
    relations: [],
  };
}

async function seedIndex(indexDir: string, cas: LocalCASStorage, provider: MockLLMProvider) {
  const l2a = createL2('Document about cats and felines.', ['cats', 'felines']);
  const l2b = createL2('Document about dogs and canines.', ['dogs', 'canines']);
  const l2c = createL2('Document about birds and aves.', ['birds', 'aves']);
  const l2d = createL2('Document about fish and marine life.', ['fish', 'marine']);
  const l2e = createL2('Документ о кошках и фелинах.', ['кошки', 'фелины'], 'ru');

  // Generate embeddings via mock provider
  const [veca] = await provider.embed([l2a.summary]);
  const [vecb] = await provider.embed([l2b.summary]);
  const [vecc] = await provider.embed([l2c.summary]);
  const [vecd] = await provider.embed([l2d.summary]);
  const [vece] = await provider.embed([l2e.summary]);

  // Write embeddings.jsonl
  const lines = [
    JSON.stringify({ hash: 'hash-a', vector: veca }),
    JSON.stringify({ hash: 'hash-b', vector: vecb }),
    JSON.stringify({ hash: 'hash-c', vector: vecc }),
    JSON.stringify({ hash: 'hash-d', vector: vecd }),
    JSON.stringify({ hash: 'hash-e', vector: vece }),
  ];
  writeFileSync(path.join(indexDir, 'embeddings.jsonl'), lines.join('\n') + '\n', 'utf-8');

  // Write bm25.json (extended format with docLengths for Okapi BM25)
  const bm25Data = {
    invertedIndex: {
      cats: ['hash-a'],
      felines: ['hash-a'],
      dogs: ['hash-b'],
      canines: ['hash-b'],
      birds: ['hash-c'],
      aves: ['hash-c'],
      fish: ['hash-d'],
      marine: ['hash-d'],
      кошки: ['hash-e'],
      фелины: ['hash-e'],
    },
    docLengths: {
      'hash-a': 2,
      'hash-b': 2,
      'hash-c': 2,
      'hash-d': 2,
      'hash-e': 2,
    },
  };
  writeFileSync(path.join(indexDir, 'bm25.json'), JSON.stringify(bm25Data), 'utf-8');

  // Write CAS objects with L2 artifacts
  for (const [hash, l2] of [
    ['hash-a', l2a],
    ['hash-b', l2b],
    ['hash-c', l2c],
    ['hash-d', l2d],
    ['hash-e', l2e],
  ] as const) {
    const objDir = cas.getObjectPath(hash);
    mkdirSync(objDir, { recursive: true });
    writeFileSync(path.join(objDir, 'L2.json'), JSON.stringify(l2), 'utf-8');
    writeFileSync(path.join(objDir, 'content.md'), `# ${l2.summary}\n\nSome body text.`, 'utf-8');
    writeFileSync(path.join(objDir, 'L1.md'), `# Heading\n\n${l2.summary}`, 'utf-8');
  }
}

describe('DefaultRetrievalService', () => {
  let tmpDir: string;
  let indexDir: string;
  let cas: LocalCASStorage;
  let provider: MockLLMProvider;

  beforeEach(async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'retineo-retrieval-'));
    indexDir = path.join(tmpDir, 'index');
    mkdirSync(indexDir, { recursive: true });
    cas = new LocalCASStorage(tmpDir);
    provider = new MockLLMProvider({ id: 'mock', type: 'mock', model: 'test', dimension: 384 });
    await seedIndex(indexDir, cas, provider);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeQuery(text: string): AnalyzedQuery {
    return {
      originalQuery: text,
      language: 'en',
      confidence: 1,
      intent: 'vague',
      enrichedQuery: text,
      entities: [],
      signals: [],
    };
  }

  it('performs L3 semantic search', async () => {
    const service = new DefaultRetrievalService({
      embeddingProvider: provider,
      casStorage: cas,
      indexDir,
      config: mockConfig,
    });
    const query = makeQuery('cats and felines');
    const result = await service.search(query, { mode: 'semantic', topK: 5 });
    expect(result.candidates.length).toBeGreaterThan(0);
    // Mock embeddings are deterministic but hash-b may score higher depending on vector
    const ids = result.candidates.map((c) => c.nodeId);
    expect(ids).toContain('hash-a');
  });

  it('performs keyword search', async () => {
    const service = new DefaultRetrievalService({
      embeddingProvider: provider,
      casStorage: cas,
      indexDir,
      config: mockConfig,
    });
    const query = makeQuery('dogs');
    const result = await service.search(query, { mode: 'keyword', topK: 5 });
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates[0].nodeId).toBe('hash-b');
  });

  it('performs keyword search with Cyrillic tokens', async () => {
    const service = new DefaultRetrievalService({
      embeddingProvider: provider,
      casStorage: cas,
      indexDir,
      config: mockConfig,
    });
    const query: AnalyzedQuery = {
      originalQuery: 'кошки',
      language: 'ru',
      confidence: 1,
      intent: 'vague',
      enrichedQuery: 'кошки',
      entities: ['кошки'],
      signals: [],
    };
    const result = await service.search(query, { mode: 'keyword', topK: 5 });
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates[0].nodeId).toBe('hash-e');
  });

  it('ranks same-language documents higher in rerank', async () => {
    const service = new DefaultRetrievalService({
      embeddingProvider: provider,
      casStorage: cas,
      indexDir,
      config: mockConfig,
    });
    const query: AnalyzedQuery = {
      originalQuery: 'cats',
      language: 'en',
      confidence: 1,
      intent: 'vague',
      enrichedQuery: 'cats',
      entities: ['cats'],
      signals: [],
    };
    const result = await service.search(query, { mode: 'hybrid', topK: 5 });
    const ranked = result.candidates.slice(0, 3);
    const englishDocs = ranked.filter((c) => c.nodeId !== 'hash-e');
    const russianDoc = ranked.find((c) => c.nodeId === 'hash-e');
    if (russianDoc) {
      expect(englishDocs.length).toBeGreaterThan(0);
      expect(englishDocs[0].score).toBeGreaterThanOrEqual(russianDoc.score);
    }
  });

  it('performs hybrid search', async () => {
    const service = new DefaultRetrievalService({
      embeddingProvider: provider,
      casStorage: cas,
      indexDir,
      config: mockConfig,
    });
    const query = makeQuery('cats');
    const result = await service.search(query, { mode: 'hybrid', topK: 5 });
    expect(result.candidates.length).toBeGreaterThan(0);
  });

  it('applies similarity threshold', async () => {
    const service = new DefaultRetrievalService({
      embeddingProvider: provider,
      casStorage: cas,
      indexDir,
      config: mockConfig,
    });
    const query = makeQuery('completely unrelated aerospace engineering');
    const result = await service.search(query, { mode: 'semantic', threshold: 0.99 });
    expect(result.candidates.length).toBe(0);
  });

  it('L2 rerank scores candidates', async () => {
    const service = new DefaultRetrievalService({
      embeddingProvider: provider,
      casStorage: cas,
      indexDir,
      config: mockConfig,
    });
    const query = makeQuery('cats');
    const result = await service.search(query, { mode: 'semantic', rerankTopK: 2 });
    expect(result.candidates[0].score).toBeGreaterThan(0);
    expect(result.candidates[0].l2Summary).toBeDefined();
  });

  it('L1/L0 cascade loads deeper artifacts for precision intent', async () => {
    const service = new DefaultRetrievalService({
      embeddingProvider: provider,
      casStorage: cas,
      indexDir,
      config: mockConfig,
    });
    const query: AnalyzedQuery = {
      originalQuery: 'exact text about cats',
      language: 'en',
      confidence: 1,
      intent: 'precision',
      enrichedQuery: 'exact text about cats',
      entities: ['cats'],
      signals: [],
    };
    const result = await service.search(query, { finalTopK: 2 });
    expect(result.selected.length).toBeGreaterThan(0);
    expect(result.selected[0].l0Preview).toBeDefined();
    expect(result.selected[0].lineRange).toBeDefined();
  });

  it('returns trace with steps and duration', async () => {
    const service = new DefaultRetrievalService({
      embeddingProvider: provider,
      casStorage: cas,
      indexDir,
      config: mockConfig,
    });
    const result = await service.search(makeQuery('cats'));
    expect(result.trace.steps.length).toBeGreaterThan(0);
    expect(result.trace.durationMs).toBeGreaterThanOrEqual(0);
  });
});
