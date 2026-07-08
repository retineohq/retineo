/**
 * Ingestion Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import { LocalCASStorage, computeHash } from '../../packages/core/src/storage/cas.js';
import { SQLiteRegistry } from '../../packages/core/src/storage/registry.js';
import { DefaultNodeBuilder } from '../../packages/core/src/storage/node-builder.js';
import { DefaultAdapterManager } from '../../packages/core/src/adapters/manager.js';
import { DefaultAdapterProcessRunner } from '../../packages/core/src/adapters/runner.js';
import { DefaultIngestionService } from '../../packages/core/src/services/ingestion-service.js';
import type { CompilationPipeline } from '../../packages/core/src/layers/pipeline.js';
import type { JobRecord } from '../../packages/core/src/domain/types.js';

let tmpDir: string;
let dataDir: string;
let adaptersDir: string;
let dbPath: string;
let cas: LocalCASStorage;
let registry: SQLiteRegistry;
let builder: DefaultNodeBuilder;
let service: DefaultIngestionService;

beforeEach(async () => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'retineo-ingest-'));
  dataDir = path.join(tmpDir, 'data');
  adaptersDir = path.join(tmpDir, 'adapters');
  dbPath = path.join(dataDir, 'registry.sqlite');
  mkdirSync(dataDir);
  mkdirSync(adaptersDir);

  cas = new LocalCASStorage(dataDir);
  registry = new SQLiteRegistry(dbPath);
  builder = new DefaultNodeBuilder();

  setupAdapters();

  const runner = new DefaultAdapterProcessRunner(tmpDir);
  const manager = new DefaultAdapterManager(adaptersDir, runner);
  const pipeline = makeRecordingPipeline(registry);
  service = new DefaultIngestionService(cas, registry, builder, manager, pipeline, computeHash);

  // Must load adapters before use
  await manager.loadBuiltIn();
});

afterEach(() => {
  registry.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeRecordingPipeline(registry: SQLiteRegistry): CompilationPipeline {
  const makeJob = (nodeHash: string, type: 'GENERATE_L1' | 'GENERATE_L2' | 'GENERATE_L3'): JobRecord => ({
    id: randomUUID(),
    type,
    payload: JSON.stringify({ nodeId: nodeHash }),
    priority: 0,
    attempts: 0,
    maxAttempts: 3,
    status: 'PENDING',
    leaseUntil: null,
    workerId: null,
    heartbeatAt: null,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
  });

  return {
    enqueueL1(nodeHash: string) {
      registry.insertJob(makeJob(nodeHash, 'GENERATE_L1'));
    },
    enqueueL2(nodeHash: string) {
      registry.insertJob(makeJob(nodeHash, 'GENERATE_L2'));
    },
    enqueueL3(nodeHash: string) {
      registry.insertJob(makeJob(nodeHash, 'GENERATE_L3'));
    },
    processJob: async () => {},
  } as unknown as CompilationPipeline;
}

function setupAdapters(): void {
  // Text adapter
  const textDir = path.join(adaptersDir, 'text');
  mkdirSync(textDir);
  writeFileSync(
    path.join(textDir, 'manifest.json'),
    JSON.stringify({ id: 'text', version: '1.0.0', mimeTypes: ['text/plain'], extensions: ['.txt'], entry: 'adapter.cjs' })
  );
  writeFileSync(
    path.join(textDir, 'adapter.cjs'),
    `
const readline = require('readline');
const fs = require('fs').promises;
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  const req = JSON.parse(line);
  let result;
  switch (req.method) {
    case 'initialize': result = { adapterId: 'text', version: '1.0.0' }; break;
    case 'capabilities': result = { mimeTypes: ['text/plain'], extensions: ['.txt'] }; break;
    case 'ingest': {
      const content = await fs.readFile(req.params.uri, 'utf-8');
      result = { content, metadata: { blocks: [{ type: 'heading', offset: 0, length: content.length }] } };
      break;
    }
    case 'shutdown': process.exit(0);
  }
  console.log(JSON.stringify({ jsonrpc: '2.0', id: req.id, result }));
});
`
  );

  // Markdown adapter
  const mdDir = path.join(adaptersDir, 'markdown');
  mkdirSync(mdDir);
  writeFileSync(
    path.join(mdDir, 'manifest.json'),
    JSON.stringify({ id: 'markdown', version: '1.0.0', mimeTypes: ['text/markdown'], extensions: ['.md'], entry: 'adapter.cjs' })
  );
  writeFileSync(
    path.join(mdDir, 'adapter.cjs'),
    `
const readline = require('readline');
const fs = require('fs').promises;
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  const req = JSON.parse(line);
  let result;
  switch (req.method) {
    case 'initialize': result = { adapterId: 'markdown', version: '1.0.0' }; break;
    case 'capabilities': result = { mimeTypes: ['text/markdown'], extensions: ['.md'] }; break;
    case 'ingest': {
      const content = await fs.readFile(req.params.uri, 'utf-8');
      const blocks = [];
      const lines = content.split('\\n');
      let offset = 0;
      for (const l of lines) {
        if (l.match(/^(#{1,6})\\s/)) {
          blocks.push({ type: 'heading', offset, length: l.length });
        }
        offset += l.length + 1;
      }
      if (blocks.length === 0) blocks.push({ type: 'heading', offset: 0, length: content.length });
      result = { content, metadata: { blocks } };
      break;
    }
    case 'shutdown': process.exit(0);
  }
  console.log(JSON.stringify({ jsonrpc: '2.0', id: req.id, result }));
});
`
  );
}

describe('DefaultIngestionService', () => {
  it('ingests a text file through full pipeline', async () => {
    const filePath = path.join(tmpDir, 'hello.txt');
    writeFileSync(filePath, 'Hello RETINEO');

    const result = await service.ingestFile(filePath);
    const contentHash = result.contentHash;

    expect(contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.action).toBe('created');

    // CAS has object (readObject verifies content.md + node.json)
    const obj = await cas.readObject(contentHash);
    expect(obj.artifacts.content).toBe('Hello RETINEO');

    // Registry has source
    const sourceId = `filesystem:${path.dirname(filePath)}`;
    const source = registry.get(sourceId, filePath);
    expect(source).not.toBeNull();
    expect(source!.externalId).toBe(filePath);
    expect(source!.contentHash).toBe(contentHash);

    // Job queued
    const jobs = registry.getPendingJobs(10);
    const job = jobs.find((j) => j.payload.includes(contentHash));
    expect(job).toBeDefined();
    expect(job!.type).toBe('GENERATE_L1');
  });

  it('ingests a markdown file', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    writeFileSync(filePath, '# Title\n\nBody text here.\n');

    const result = await service.ingestFile(filePath);
    expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
    const obj = await cas.readObject(result.contentHash);
    expect(obj.artifacts.content).toContain('# Title');
  });

  it('is idempotent — same file twice returns same hash', async () => {
    const filePath = path.join(tmpDir, 'dup.txt');
    writeFileSync(filePath, 'Same content');

    const result1 = await service.ingestFile(filePath);
    const result2 = await service.ingestFile(filePath);

    expect(result1.contentHash).toBe(result2.contentHash);
    expect(result2.action).toBe('unchanged');

    // Only one source record
    const sourceId = `filesystem:${path.dirname(filePath)}`;
    const source = registry.get(sourceId, filePath);
    expect(source).not.toBeNull();
    expect(source!.contentHash).toBe(result1.contentHash);
  });

  it('ingests batch of files', async () => {
    const f1 = path.join(tmpDir, 'a.txt');
    const f2 = path.join(tmpDir, 'b.txt');
    writeFileSync(f1, 'File A');
    writeFileSync(f2, 'File B');

    const results = await service.ingestBatch([f1, f2]);
    expect(results.length).toBe(2);
    expect(results[0].contentHash).not.toBe(results[1].contentHash);
  });

  it('queues GENERATE_L1 job for each ingested file', async () => {
    const filePath = path.join(tmpDir, 'job.txt');
    writeFileSync(filePath, 'Queue me');

    const result = await service.ingestFile(filePath);
    const jobs = registry.getPendingJobs(10);
    const matching = jobs.filter((j) => j.payload.includes(result.contentHash));
    expect(matching.length).toBe(1);
    expect(matching[0].type).toBe('GENERATE_L1');
  });
});
