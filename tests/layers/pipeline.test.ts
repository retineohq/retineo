/**
 * Compilation Pipeline Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import os from 'os';
import { DefaultCompilationPipeline } from '../../packages/core/src/layers/pipeline.js';
import { LocalCASStorage, computeHash } from '../../packages/core/src/storage/cas.js';
import { SQLiteRegistry } from '../../packages/core/src/storage/registry.js';
import { DefaultContextNodeRepository } from '../../packages/core/src/storage/context-node-repository.js';
import { DefaultL1Generator } from '../../packages/core/src/layers/l1-generator.js';
import { DefaultL2Generator } from '../../packages/core/src/layers/l2-generator.js';
import { DefaultL3Generator } from '../../packages/core/src/layers/l3-generator.js';
import { MockLLMProvider } from '../../packages/core/src/llm/providers/mock.js';
import type { ContextNode, BuildManifest } from '../../packages/core/src/domain/types.js';

describe('DefaultCompilationPipeline', () => {
  let tmpDir: string;
  let dataDir: string;
  let cas: LocalCASStorage;
  let registry: SQLiteRegistry;
  let pipeline: DefaultCompilationPipeline;
  const llmProvider = new MockLLMProvider({ id: 'mock', type: 'mock', model: 'test' });
  const embeddingProvider = new MockLLMProvider({ id: 'mock-embed', type: 'mock', model: 'test-embed', dimension: 384 });

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'retineo-pipe-'));
    dataDir = tmpDir;
    cas = new LocalCASStorage(dataDir);
    registry = new SQLiteRegistry(path.join(dataDir, 'registry.sqlite'));
    const contextNodeRepository = new DefaultContextNodeRepository(cas, registry);

    pipeline = new DefaultCompilationPipeline({
      cas,
      registry,
      contextNodeRepository,
      l1Generator: new DefaultL1Generator(),
      l2Generator: new DefaultL2Generator(),
      l3Generator: new DefaultL3Generator(),
      llmProvider,
      embeddingProvider,
      dataDir,
    });
  });

  afterEach(() => {
    registry.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function seedNode(content: string): string {
    const hash = computeHash(content);
    const objPath = cas.getObjectPath(hash);
    mkdirSync(objPath, { recursive: true });
    writeFileSync(path.join(objPath, 'content.md'), content);
    writeFileSync(path.join(objPath, 'content.meta.json'), JSON.stringify({ blocks: [] }));

    const manifest: BuildManifest = {
      schemaVersion: 2,
      nodeVersion: 1,
      rawHash: hash,
      contentHash: hash,
      generators: {
        l1: { id: 'placeholder', version: '0.0.0' },
        l2: { id: 'placeholder', version: '0.0.0' },
        embedding: { id: 'placeholder', version: '0.0.0' },
      },
      buildTimestamp: new Date().toISOString(),
    };
    writeFileSync(path.join(objPath, 'node.json'), JSON.stringify(manifest));
    return hash;
  }

  it('processes GENERATE_L1 and enqueues L2', async () => {
    const hash = seedNode('# Hello\n\nWorld.');
    const job = {
      id: 'job-1',
      type: 'GENERATE_L1' as const,
      payload: JSON.stringify({ nodeId: hash }),
      priority: 0,
      attempts: 0,
      maxAttempts: 3,
      status: 'RUNNING' as const,
      leaseUntil: null,
      workerId: null,
      heartbeatAt: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
    };

    await pipeline.processJob(job);

    const objPath = cas.getObjectPath(hash);
    expect(require('fs').existsSync(path.join(objPath, 'L1.md'))).toBe(true);
    expect(require('fs').existsSync(path.join(objPath, 'L1.index.json'))).toBe(true);

    const pending = registry.getPendingJobs(10);
    expect(pending.some((j) => j.type === 'GENERATE_L2')).toBe(true);
  });

  it('processes GENERATE_L2 and enqueues L3', async () => {
    const hash = seedNode('# Title\n\nBody.');
    // Pre-generate L1
    const l1Job = {
      id: 'job-l1', type: 'GENERATE_L1' as const,
      payload: JSON.stringify({ nodeId: hash }),
      priority: 0, attempts: 0, maxAttempts: 3, status: 'RUNNING' as const,
      leaseUntil: null, workerId: null, heartbeatAt: null,
      createdAt: new Date().toISOString(), startedAt: null, completedAt: null,
    };
    await pipeline.processJob(l1Job);

    const l2Job = {
      id: 'job-l2', type: 'GENERATE_L2' as const,
      payload: JSON.stringify({ nodeId: hash }),
      priority: 0, attempts: 0, maxAttempts: 3, status: 'RUNNING' as const,
      leaseUntil: null, workerId: null, heartbeatAt: null,
      createdAt: new Date().toISOString(), startedAt: null, completedAt: null,
    };
    await pipeline.processJob(l2Job);

    const objPath = cas.getObjectPath(hash);
    expect(require('fs').existsSync(path.join(objPath, 'L2.json'))).toBe(true);

    const pending = registry.getPendingJobs(10);
    expect(pending.some((j) => j.type === 'GENERATE_L3')).toBe(true);
  });

  it('processes GENERATE_L3 and updates manifest', async () => {
    const hash = seedNode('# Title\n\nBody.');
    // Run full chain
    await pipeline.processJob({
      id: 'j1', type: 'GENERATE_L1', payload: JSON.stringify({ nodeId: hash }),
      priority: 0, attempts: 0, maxAttempts: 3, status: 'RUNNING',
      leaseUntil: null, workerId: null, heartbeatAt: null,
      createdAt: new Date().toISOString(), startedAt: null, completedAt: null,
    });
    await pipeline.processJob({
      id: 'j2', type: 'GENERATE_L2', payload: JSON.stringify({ nodeId: hash }),
      priority: 0, attempts: 0, maxAttempts: 3, status: 'RUNNING',
      leaseUntil: null, workerId: null, heartbeatAt: null,
      createdAt: new Date().toISOString(), startedAt: null, completedAt: null,
    });
    await pipeline.processJob({
      id: 'j3', type: 'GENERATE_L3', payload: JSON.stringify({ nodeId: hash }),
      priority: 0, attempts: 0, maxAttempts: 3, status: 'RUNNING',
      leaseUntil: null, workerId: null, heartbeatAt: null,
      createdAt: new Date().toISOString(), startedAt: null, completedAt: null,
    });

    const objPath = cas.getObjectPath(hash);
    const manifest = JSON.parse(require('fs').readFileSync(path.join(objPath, 'node.json'), 'utf-8')) as BuildManifest;
    expect(manifest.nodeVersion).toBeGreaterThan(1);
    expect(manifest.generators.l1.id).toBe('outline-parser');
    expect(manifest.generators.l2.id).toBe('semantic-extractor');
    expect(manifest.generators.embedding.id).toBe('embedding-indexer');
  });

  it('end-to-end: ingest content → pipeline generates L1/L2/L3 artifacts', async () => {
    const hash = seedNode('# Hello World\n\nThis is a test document for RETINEO Core.');
    pipeline.enqueueL1(hash, 'src-e2e');

    // Simulate worker processing all jobs
    for (let i = 0; i < 10; i++) {
      registry.releaseExpiredLeases();
      const job = registry.acquireLease('worker-1', 60000);
      if (!job) break;
      await pipeline.processJob(job);
      registry.completeJob(job.id);
    }

    const objPath = cas.getObjectPath(hash);
    expect(require('fs').existsSync(path.join(objPath, 'L1.md'))).toBe(true);
    expect(require('fs').existsSync(path.join(objPath, 'L1.index.json'))).toBe(true);
    expect(require('fs').existsSync(path.join(objPath, 'L2.json'))).toBe(true);
    expect(require('fs').existsSync(path.join(dataDir, 'index', 'embeddings.jsonl'))).toBe(true);
    expect(require('fs').existsSync(path.join(dataDir, 'index', 'bm25.json'))).toBe(true);
    expect(require('fs').existsSync(path.join(dataDir, 'index', 'hnsw.manifest.json'))).toBe(true);
  });

  it('fails with clear error when LLM provider is null on L2 job', async () => {
    const contextNodeRepository = new DefaultContextNodeRepository(cas, registry);
    const noLlmPipeline = new DefaultCompilationPipeline({
      cas,
      registry,
      contextNodeRepository,
      l1Generator: new DefaultL1Generator(),
      l2Generator: new DefaultL2Generator(),
      l3Generator: new DefaultL3Generator(),
      llmProvider: null,
      embeddingProvider,
      dataDir,
    });

    const hash = seedNode('# Title\n\nBody.');
    // Pre-generate L1
    await noLlmPipeline.processJob({
      id: 'j1', type: 'GENERATE_L1', payload: JSON.stringify({ nodeId: hash }),
      priority: 0, attempts: 0, maxAttempts: 3, status: 'RUNNING',
      leaseUntil: null, workerId: null, heartbeatAt: null,
      createdAt: new Date().toISOString(), startedAt: null, completedAt: null,
    });

    await expect(
      noLlmPipeline.processJob({
        id: 'j2', type: 'GENERATE_L2', payload: JSON.stringify({ nodeId: hash }),
        priority: 0, attempts: 0, maxAttempts: 3, status: 'RUNNING',
        leaseUntil: null, workerId: null, heartbeatAt: null,
        createdAt: new Date().toISOString(), startedAt: null, completedAt: null,
      })
    ).rejects.toThrow('LLM provider not configured');
  });

  it('fails with clear error when embedding provider is null on L3 job', async () => {
    const contextNodeRepository = new DefaultContextNodeRepository(cas, registry);
    const noEmbedPipeline = new DefaultCompilationPipeline({
      cas,
      registry,
      contextNodeRepository,
      l1Generator: new DefaultL1Generator(),
      l2Generator: new DefaultL2Generator(),
      l3Generator: new DefaultL3Generator(),
      llmProvider,
      embeddingProvider: null,
      dataDir,
    });

    const hash = seedNode('# Title\n\nBody.');
    // Pre-generate L1 and L2
    await noEmbedPipeline.processJob({
      id: 'j1', type: 'GENERATE_L1', payload: JSON.stringify({ nodeId: hash }),
      priority: 0, attempts: 0, maxAttempts: 3, status: 'RUNNING',
      leaseUntil: null, workerId: null, heartbeatAt: null,
      createdAt: new Date().toISOString(), startedAt: null, completedAt: null,
    });
    await noEmbedPipeline.processJob({
      id: 'j2', type: 'GENERATE_L2', payload: JSON.stringify({ nodeId: hash }),
      priority: 0, attempts: 0, maxAttempts: 3, status: 'RUNNING',
      leaseUntil: null, workerId: null, heartbeatAt: null,
      createdAt: new Date().toISOString(), startedAt: null, completedAt: null,
    });

    await expect(
      noEmbedPipeline.processJob({
        id: 'j3', type: 'GENERATE_L3', payload: JSON.stringify({ nodeId: hash }),
        priority: 0, attempts: 0, maxAttempts: 3, status: 'RUNNING',
        leaseUntil: null, workerId: null, heartbeatAt: null,
        createdAt: new Date().toISOString(), startedAt: null, completedAt: null,
      })
    ).rejects.toThrow('Embedding provider not configured');
  });
});
