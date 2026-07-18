/**
 * Retrieval Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import os from 'os';
import { DefaultRetrievalService } from '../../packages/core/src/search/retrieval-service.js';
import { MockLLMProvider } from '../../packages/core/src/llm/providers/mock.js';
import { LocalCASStorage, computeHash } from '../../packages/core/src/storage/cas.js';
import { SQLiteRegistry } from '../../packages/core/src/storage/registry.js';
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
    JSON.stringify({ hash: 'hash-a', vector: veca, parentId: '/docs/cats.md', rootHash: 'hash-a' }),
    JSON.stringify({ hash: 'hash-b', vector: vecb, parentId: '/docs/dogs.md', rootHash: 'hash-b' }),
    JSON.stringify({ hash: 'hash-c', vector: vecc, parentId: '/docs/birds.md', rootHash: 'hash-c' }),
    JSON.stringify({ hash: 'hash-d', vector: vecd, parentId: '/docs/fish.md', rootHash: 'hash-d' }),
    JSON.stringify({ hash: 'hash-e', vector: vece, parentId: '/docs/cats-ru.md', rootHash: 'hash-e' }),
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

  it('marks deleted sources as ghosts and skips L0 read', async () => {
    const dbPath = path.join(tmpDir, 'retineo.sqlite');
    const registry = new SQLiteRegistry(dbPath);
    registry.set({
      sourceId: 'filesystem',
      externalId: '/docs/cats.md',
      contentHash: 'hash-a',
      etag: 'etag',
      status: 'ghost',
      deletedAt: Date.now(),
      lastSeenAt: Date.now(),
    });
    registry.insertOrphan('hash-a', 'src-a', '/docs/cats.md');

    const service = new DefaultRetrievalService({
      embeddingProvider: provider,
      casStorage: cas,
      registry,
      indexDir,
      config: mockConfig,
    });
    const query: AnalyzedQuery = {
      originalQuery: 'cats',
      language: 'en',
      confidence: 1,
      intent: 'precision',
      enrichedQuery: 'cats',
      entities: ['cats'],
      signals: [],
    };
    const result = await service.search(query, { mode: 'semantic', topK: 5 });
    const ghost = result.selected.find((c) => c.nodeId === 'hash-a');
    expect(ghost).toBeDefined();
    expect(ghost?.isGhost).toBe(true);
    expect(ghost?.sourcePath).toBe('/docs/cats.md');
    expect(ghost?.l0Preview).toBeUndefined();
    expect(result.citations.find((c) => c.nodeId === 'hash-a')?.isGhost).toBe(true);
    registry.close();
  });
});

describe('DefaultRetrievalService exact cascade', () => {
  let tmpDir: string;
  let indexDir: string;
  let cas: LocalCASStorage;
  let provider: MockLLMProvider;
  let registry: SQLiteRegistry;

  beforeEach(async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'retineo-cascade-'));
    indexDir = path.join(tmpDir, 'index');
    mkdirSync(indexDir, { recursive: true });
    cas = new LocalCASStorage(tmpDir);
    provider = new MockLLMProvider({ id: 'mock', type: 'mock', model: 'test', dimension: 384 });
  });

  afterEach(() => {
    registry?.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns exact L0 slice for precision intent when chunk geometry is present', async () => {
    const content = 'Alpha cats here.\n\nBeta dogs there.\n\nGamma birds elsewhere.';
    const chunks = [
      { text: 'Alpha cats here.', charStart: 0, charEnd: 15, lineStart: 0, lineEnd: 0, concept: 'cats' },
      { text: 'Beta dogs there.', charStart: 18, charEnd: 33, lineStart: 2, lineEnd: 2, concept: 'dogs' },
      { text: 'Gamma birds elsewhere.', charStart: 36, charEnd: 57, lineStart: 4, lineEnd: 4, concept: 'birds' },
    ];

    const docHash = computeHash(content);
    const docDir = cas.getObjectPath(docHash);
    mkdirSync(docDir, { recursive: true });
    writeFileSync(path.join(docDir, 'content.md'), content, 'utf-8');
    writeFileSync(path.join(docDir, 'L2.json'), JSON.stringify(createL2('Animals document', ['cats', 'dogs', 'birds'])), 'utf-8');

    const records: string[] = [];
    for (const chunk of chunks) {
      const hash = computeHash(chunk.text);
      const [vector] = await provider.embed([chunk.text]);
      records.push(
        JSON.stringify({
          hash,
          vector,
          parentId: docHash,
          rootHash: docHash,
          chunkId: `chunk-${chunk.concept}`,
          lineStart: chunk.lineStart,
          lineEnd: chunk.lineEnd,
          charStart: chunk.charStart,
          charEnd: chunk.charEnd,
        })
      );

      const objDir = cas.getObjectPath(hash);
      mkdirSync(objDir, { recursive: true });
    }
    writeFileSync(path.join(indexDir, 'embeddings.jsonl'), records.join('\n') + '\n', 'utf-8');

    const dbPath = path.join(tmpDir, 'retineo.sqlite');
    registry = new SQLiteRegistry(dbPath);
    registry.set({
      sourceId: 'filesystem',
      externalId: '/docs/animals.md',
      contentHash: docHash,
      etag: 'etag',
      status: 'active',
      deletedAt: null,
      lastSeenAt: Date.now(),
    });

    const service = new DefaultRetrievalService({
      embeddingProvider: provider,
      casStorage: cas,
      registry,
      indexDir,
      config: mockConfig,
    });

    const query: AnalyzedQuery = {
      originalQuery: 'Alpha cats here.',
      language: 'en',
      confidence: 1,
      intent: 'precision',
      enrichedQuery: 'Alpha cats here.',
      entities: [],
      signals: [],
    };

    const result = await service.search(query, { mode: 'semantic', finalTopK: 3 });
    const selected = result.selected.find((c) => c.l0Preview === 'Alpha cats here.');
    expect(selected).toBeDefined();
    expect(selected?.lineRange).toEqual({ start: 0, end: 0 });
    expect(selected?.sourcePath).toBe('/docs/animals.md');
  });
});
