/**
 * ECHO Core — Real Integration Test Suite
 * Uses actual files, actual Ollama API, actual SQLite database.
 * No mocks.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { FileConfigManager } from '../../packages/core/src/storage/config.js';
import { LocalCASStorage } from '../../packages/core/src/storage/cas.js';
import { SQLiteRegistry } from '../../packages/core/src/storage/registry.js';
import { DefaultRetrievalService } from '../../packages/core/src/search/retrieval-service.js';
import { DefaultContextAssembler } from '../../packages/core/src/search/context-assembler.js';
import { DefaultQueryAnalyzer } from '../../packages/core/src/search/query-analyzer.js';
import { DefaultLLMProviderFactory, DefaultEmbeddingProviderFactory } from '../../packages/core/src/llm/factory.js';
import { FileSecretsManager } from '../../packages/core/src/storage/secrets.js';

const DATA_DIR = process.env.ECHO_DATA_DIR ?? path.join(os.homedir(), '.echo');
const TEST_FILE = path.join(os.homedir(), 'echo-beta-test', 'test.md');
const CONFIG_PATH = path.join(DATA_DIR, 'config.yaml');

function findFile(dir: string, filename: string): string | null {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(fullPath, filename);
      if (found) return found;
    } else if (entry.name === filename) {
      return fullPath;
    }
  }
  return null;
}

function runCommand(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 120_000, cwd: path.join(os.homedir(), 'MY_Brand/ECHO/echo-core') });
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    throw new Error(`Command failed: ${cmd}\nstdout: ${e.stdout ?? ''}\nstderr: ${e.stderr ?? e.message ?? ''}`);
  }
}

describe('E2E Real: Config Validation', () => {
  it('config has real Ollama providers', async () => {
    const configManager = new FileConfigManager(DATA_DIR);
    const config = await configManager.load();

    // LLM provider must be real
    expect(config.llm.defaultProvider).not.toBe('mock');
    expect(config.llm.providers.length).toBeGreaterThan(0);
    expect(config.llm.providers[0].type).toBe('ollama');

    // Embedding provider must be real, not mock
    expect(config.embedding.defaultProvider).not.toBe('mock');
    expect(config.embedding.providers.length).toBeGreaterThan(0);

    // Embedding model must NOT be a LLM model
    const embedModel = config.embedding.providers[0].model;
    expect(embedModel).not.toMatch(/gemma4|llama|granite|gpt/);
    // Embedding model SHOULD contain 'embed' or be known embedder
    expect(embedModel).toMatch(/embed|nomic|bge|qwen3-embed|openai/);
  });

  it('config search has reasonable threshold', async () => {
    const configManager = new FileConfigManager(DATA_DIR);
    const config = await configManager.load();
    // Threshold should be <= 0.6 for cross-lingual to work
    expect(config.search.semantic.threshold).toBeLessThanOrEqual(0.6);
  });
});

describe('E2E Real: L3 Index Integrity', () => {
  it('embeddings.jsonl has valid embeddings', () => {
    const embeddingsPath = path.join(DATA_DIR, 'index', 'embeddings.jsonl');
    expect(fs.existsSync(embeddingsPath)).toBe(true);

    const raw = fs.readFileSync(embeddingsPath, 'utf-8').trim();
    const lines = raw.split('\n').filter((l) => l.trim());
    expect(lines.length).toBeGreaterThan(0);

    // Parse first line
    const first = JSON.parse(lines[0]) as { hash: string; vector: number[] };
    expect(first.hash).toBeDefined();
    expect(first.hash.length).toBeGreaterThan(10);
    expect(first.vector).toBeDefined();
    expect(first.vector.length).toBeGreaterThan(0);

    // Vector must not be all zeros or all identical (bad embedder)
    const uniqueValues = new Set(first.vector.slice(0, 20));
    expect(uniqueValues.size).toBeGreaterThan(1);

    // Vector magnitude should be reasonable
    const magnitude = Math.sqrt(first.vector.reduce((sum, v) => sum + v * v, 0));
    expect(magnitude).toBeGreaterThan(0.1);
  });

  it('embeddings.jsonl has no duplicate hashes', () => {
    const embeddingsPath = path.join(DATA_DIR, 'index', 'embeddings.jsonl');
    if (!fs.existsSync(embeddingsPath)) return;

    const raw = fs.readFileSync(embeddingsPath, 'utf-8').trim();
    const lines = raw.split('\n').filter((l) => l.trim());
    const hashes = lines.map((line) => {
      const rec = JSON.parse(line) as { hash: string };
      return rec.hash;
    });

    const uniqueHashes = new Set(hashes);
    // If duplicates exist, this test documents the issue
    if (hashes.length !== uniqueHashes.size) {
      console.warn(
        `WARNING: ${hashes.length} entries but only ${uniqueHashes.size} unique hashes. Duplicates detected.`
      );
    }
    // After fix: no duplicates
    expect(hashes.length).toBe(uniqueHashes.size);
  });

  it('no LLM model used as embedder in embeddings', () => {
    const embeddingsPath = path.join(DATA_DIR, 'index', 'embeddings.jsonl');
    if (!fs.existsSync(embeddingsPath)) return;

    const raw = fs.readFileSync(embeddingsPath, 'utf-8').trim();
    const lines = raw.split('\n').filter((l) => l.trim());
    expect(lines.length).toBeGreaterThan(0);

    // Check vector values - LLM-as-embedder produces repeating patterns
    const first = JSON.parse(lines[0]) as { vector: number[] };
    const vec = first.vector;

    // Real embedding models produce diverse values
    // Check first 20 values aren't all identical
    const first20 = vec.slice(0, 20);
    const allSame = first20.every((v) => Math.abs(v - first20[0]) < 0.001);
    expect(allSame).toBe(false);

    // Check vector dimension is reasonable for known embedders
    // nomic: 768, openai: 1536, bge: 768-1024
    expect(vec.length).toBeGreaterThanOrEqual(384);
    expect(vec.length).toBeLessThanOrEqual(4096);
  });
});

describe('E2E Real: Search Results', () => {
  let retrievalService: DefaultRetrievalService;
  let queryAnalyzer: DefaultQueryAnalyzer;
  let contextAssembler: DefaultContextAssembler;

  beforeAll(async () => {
    const configManager = new FileConfigManager(DATA_DIR);
    const config = await configManager.load();
    const secretsManager = new FileSecretsManager(path.join(DATA_DIR, 'secrets.json'));

    // Load real embedding provider
    const embedFactory = new DefaultEmbeddingProviderFactory();
    await embedFactory.loadFromConfig(config, secretsManager);
    const embedder = embedFactory.getDefault();

    const cas = new LocalCASStorage(DATA_DIR);
    const indexDir = path.join(DATA_DIR, 'index');

    retrievalService = new DefaultRetrievalService({
      embeddingProvider: embedder,
      casStorage: cas,
      indexDir,
      config: config.search,
    });

    queryAnalyzer = new DefaultQueryAnalyzer({ searchConfig: config.search });
    contextAssembler = new DefaultContextAssembler({ config: config.search });
  });

  it('search "content compilation engine" returns results, no duplicates', async () => {
    const analyzed = await queryAnalyzer.analyze('content compilation engine');
    const results = await retrievalService.search(analyzed, {
      topK: 100,
      threshold: 0.3,
    });

    expect(results.selected.length).toBeGreaterThan(0);

    // No duplicates
    const nodeIds = results.selected.map((r) => r.nodeId);
    const uniqueNodeIds = [...new Set(nodeIds)];
    expect(nodeIds.length).toBe(uniqueNodeIds.length);

    // Assembled context has tokens
    const assembled = await contextAssembler.assemble(analyzed, results.selected, {
      maxTokens: 8000,
    });
    expect(assembled.totalTokens).toBeGreaterThan(0);
  });

  it('search "semantic layers" returns results', async () => {
    const analyzed = await queryAnalyzer.analyze('semantic layers');
    const results = await retrievalService.search(analyzed, {
      topK: 100,
      threshold: 0.3,
    });

    expect(results.selected.length).toBeGreaterThan(0);
  });

  it('search "vector embeddings" returns results', async () => {
    const analyzed = await queryAnalyzer.analyze('vector embeddings');
    const results = await retrievalService.search(analyzed, {
      topK: 100,
      threshold: 0.2, // short query, lower threshold
    });

    expect(results.selected.length).toBeGreaterThan(0);
  });

  it('search cross-lingual "компиляция контента" returns results', async () => {
    const analyzed = await queryAnalyzer.analyze('компиляция контента');
    const results = await retrievalService.search(analyzed, {
      topK: 100,
      threshold: 0.3,
    });

    // Cross-lingual should find the English document
    expect(results.selected.length).toBeGreaterThan(0);
  });

  it('search cross-lingual "семантические слои" returns results', async () => {
    const analyzed = await queryAnalyzer.analyze('семантические слои');
    const results = await retrievalService.search(analyzed, {
      topK: 100,
      threshold: 0.2, // lower threshold for cross-lingual on short docs
    });

    expect(results.selected.length).toBeGreaterThan(0);
  });
});

describe('E2E Real: L2 Artifact Quality', () => {
  it('L2.json has real content, not mock', () => {
    const l2Path = findFile(path.join(DATA_DIR, 'objects'), 'L2.json');
    expect(l2Path).not.toBeNull();

    const l2 = JSON.parse(fs.readFileSync(l2Path!, 'utf-8'));

    // Must not be mock content
    expect(l2.summary).not.toMatch(/Mock summary for prompt hash/);
    expect(l2.summary).not.toMatch(/mock-concept/);
    expect(l2.summary.length).toBeGreaterThan(20);

    // Must have real concepts
    expect(l2.concepts).toBeDefined();
    expect(l2.concepts.length).toBeGreaterThan(0);

    // Concepts must be real strings, not mock
    for (const concept of l2.concepts) {
      expect(concept).not.toMatch(/^mock/i);
      expect(concept.length).toBeGreaterThan(2);
    }
  });

  it('node.json generator info shows real provider', () => {
    const nodePath = findFile(path.join(DATA_DIR, 'objects'), 'node.json');
    expect(nodePath).not.toBeNull();

    const manifest = JSON.parse(fs.readFileSync(nodePath!, 'utf-8'));

    expect(manifest.generators.l2.provider).toBe('ollama');
    expect(manifest.generators.l2.model).not.toBe('mock-llm');
    expect(manifest.generators.embedding.provider).toBeDefined();
    expect(manifest.generators.embedding.model).not.toBe('mock-embedder');
  });
});

describe('E2E Real: Compile with Provider', () => {
  it('compile --provider nonexistent fails with clear error', () => {
    const output = runCommand('node bin/echo-core.js compile /home/ryzen/echo-beta-test/test.md --provider nonexistent 2>&1 || true');
    expect(output).toMatch(/Provider 'nonexistent' not found/);
  });
});

describe('E2E Real: BM25 Index', () => {
  it('bm25.json has terms and references', () => {
    const bm25Path = path.join(DATA_DIR, 'index', 'bm25.json');
    expect(fs.existsSync(bm25Path)).toBe(true);

    const bm25 = JSON.parse(fs.readFileSync(bm25Path, 'utf-8')) as Record<string, string[]>;
    const terms = Object.keys(bm25);
    expect(terms.length).toBeGreaterThan(0);

    // Should have relevant terms from the test document
    const termSet = new Set(terms.map((t) => t.toLowerCase()));
    // At least some of these should exist
    const expectedTerms = ['content', 'compilation', 'engine', 'semantic', 'layers'];
    const hits = expectedTerms.filter((t) => termSet.has(t));
    expect(hits.length).toBeGreaterThan(0);
  });
});
