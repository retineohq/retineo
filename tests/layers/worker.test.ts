/**
 * Queue Worker Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import os from 'os';
import { DefaultQueueWorker } from '../../packages/core/src/layers/worker.js';
import { DefaultCompilationPipeline } from '../../packages/core/src/layers/pipeline.js';
import { LocalCASStorage, computeHash } from '../../packages/core/src/storage/cas.js';
import { SQLiteRegistry } from '../../packages/core/src/storage/registry.js';
import { DefaultL1Generator } from '../../packages/core/src/layers/l1-generator.js';
import { DefaultL2Generator } from '../../packages/core/src/layers/l2-generator.js';
import { DefaultL3Generator } from '../../packages/core/src/layers/l3-generator.js';
import { MockLLMProvider } from '../../packages/core/src/llm/providers/mock.js';
import type { BuildManifest } from '../../packages/core/src/domain/types.js';

describe('DefaultQueueWorker', () => {
  let tmpDir: string;
  let dataDir: string;
  let cas: LocalCASStorage;
  let registry: SQLiteRegistry;
  let pipeline: DefaultCompilationPipeline;
  let worker: DefaultQueueWorker;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'echo-worker-'));
    dataDir = tmpDir;
    cas = new LocalCASStorage(dataDir);
    registry = new SQLiteRegistry(path.join(dataDir, 'registry.sqlite'));

    const llmProvider = new MockLLMProvider({ id: 'mock', type: 'mock', model: 'test' });
    const embeddingProvider = new MockLLMProvider({ id: 'mock-embed', type: 'mock', model: 'test-embed', dimension: 384 });

    pipeline = new DefaultCompilationPipeline({
      cas,
      registry,
      l1Generator: new DefaultL1Generator(),
      l2Generator: new DefaultL2Generator(),
      l3Generator: new DefaultL3Generator(),
      llmProvider,
      embeddingProvider,
      dataDir,
    });

    worker = new DefaultQueueWorker({
      workerId: 'worker-1',
      registry,
      pipeline,
      leaseDurationMs: 5000,
      pollIntervalMs: 50,
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
      schemaVersion: 1, nodeVersion: 1, rawHash: hash, contentHash: hash,
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

  it('processes next job and returns true', async () => {
    const hash = seedNode('# Hello\n\nWorld.');
    pipeline.enqueueL1(hash, 'src-1');

    const processed = await worker.processNext();
    expect(processed).toBe(true);

    const objPath = cas.getObjectPath(hash);
    expect(require('fs').existsSync(path.join(objPath, 'L1.md'))).toBe(true);
  });

  it('returns false when no jobs available', async () => {
    const processed = await worker.processNext();
    expect(processed).toBe(false);
  });

  it('handles crash recovery via releaseExpiredLeases', async () => {
    const hash = seedNode('# Doc\n\nText.');
    pipeline.enqueueL1(hash);

    // Simulate another worker acquiring lease then dying
    const job = registry.acquireLease('dead-worker', 10);
    expect(job).not.toBeNull();

    // Wait for lease to expire
    await new Promise((r) => setTimeout(r, 50));

    // Our worker should recover and process
    const processed = await worker.processNext();
    expect(processed).toBe(true);
  });

  it('marks failed jobs as PENDING for retry', async () => {
    const hash = seedNode('# Doc\n\nText.');
    // Enqueue L2 without L1 → will fail
    pipeline.enqueueL2(hash);

    const processed = await worker.processNext();
    expect(processed).toBe(true);

    const pending = registry.getPendingJobs(10);
    const retried = pending.find((j) => j.type === 'GENERATE_L2');
    expect(retried).toBeDefined();
    expect(retried!.attempts).toBe(1);
  });

  it('start/stop lifecycle', async () => {
    const hash = seedNode('# Hello\n\nWorld.');
    pipeline.enqueueL1(hash);

    // Start worker, let it process one job, then stop
    let stopped = false;
    const run = worker.start();
    setTimeout(() => { worker.stop().then(() => { stopped = true; }); }, 300);

    await run;
    expect(stopped).toBe(true);

    const objPath = cas.getObjectPath(hash);
    expect(require('fs').existsSync(path.join(objPath, 'L1.md'))).toBe(true);
  });
});
