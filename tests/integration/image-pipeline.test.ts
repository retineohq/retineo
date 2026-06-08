/**
 * Image Pipeline Integration Test
 * ingest image → compile L1/L2/L3 → search
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import os from 'os';
import { LocalCASStorage, computeHash } from '../../packages/core/src/storage/cas.js';
import { SQLiteRegistry } from '../../packages/core/src/storage/registry.js';
import { DefaultNodeBuilder } from '../../packages/core/src/storage/node-builder.js';
import { DefaultAdapterManager } from '../../packages/core/src/adapters/manager.js';
import { DefaultAdapterProcessRunner } from '../../packages/core/src/adapters/runner.js';
import { DefaultIngestionService } from '../../packages/core/src/adapters/ingestion.js';
import { DefaultCompilationPipeline } from '../../packages/core/src/layers/pipeline.js';
import { DefaultL1Generator } from '../../packages/core/src/layers/l1-generator.js';
import { DefaultL2Generator } from '../../packages/core/src/layers/l2-generator.js';
import { DefaultL3Generator } from '../../packages/core/src/layers/l3-generator.js';
import { MockLLMProvider } from '../../packages/core/src/llm/providers/mock.js';

let tmpDir: string;
let dataDir: string;
let adaptersDir: string;
let dbPath: string;
let cas: LocalCASStorage;
let registry: SQLiteRegistry;
let builder: DefaultNodeBuilder;
let service: DefaultIngestionService;
let pipeline: DefaultCompilationPipeline;

beforeEach(async () => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'echo-img-int-'));
  dataDir = path.join(tmpDir, 'data');
  adaptersDir = path.join(tmpDir, 'adapters');
  dbPath = path.join(dataDir, 'registry.sqlite');
  mkdirSync(dataDir);
  mkdirSync(adaptersDir);

  cas = new LocalCASStorage(dataDir);
  registry = new SQLiteRegistry(dbPath);
  builder = new DefaultNodeBuilder();

  // Copy real image adapter
  const imgSrc = path.join(process.cwd(), 'packages/core/adapters/image');
  const imgDest = path.join(adaptersDir, 'image');
  mkdirSync(imgDest);
  const { readFileSync } = require('fs');
  writeFileSync(path.join(imgDest, 'manifest.json'), readFileSync(path.join(imgSrc, 'manifest.json')));
  writeFileSync(path.join(imgDest, 'adapter.cjs'), readFileSync(path.join(imgSrc, 'adapter.cjs')));

  const runner = new DefaultAdapterProcessRunner(tmpDir);
  const manager = new DefaultAdapterManager(adaptersDir, runner);
  service = new DefaultIngestionService(cas, registry, builder, manager, computeHash);
  await manager.loadBuiltIn();

  const llm = new MockLLMProvider({ id: 'mock', model: 'mock', apiKey: '' });
  const embedder = new MockLLMProvider({ id: 'mock', model: 'mock', apiKey: '' });
  pipeline = new DefaultCompilationPipeline({
    cas,
    registry,
    l1Generator: new DefaultL1Generator(),
    l2Generator: new DefaultL2Generator(),
    l3Generator: new DefaultL3Generator(),
    llmProvider: llm,
    embeddingProvider: embedder,
    dataDir,
  });
});

afterEach(() => {
  registry.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function createMinimalPNG(): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.from([0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00]);
  const ihdrLen = Buffer.alloc(4);
  ihdrLen.writeUInt32BE(ihdrData.length, 0);
  const ihdrType = Buffer.from('IHDR');
  function crc32(buf: Buffer): number {
    let c = ~0;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let j = 0; j < 8; j++) {
        c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
      }
    }
    return ~c >>> 0;
  }
  const ihdrCrc = Buffer.alloc(4);
  ihdrCrc.writeUInt32BE(crc32(Buffer.concat([ihdrType, ihdrData])), 0);
  const ihdr = Buffer.concat([ihdrLen, ihdrType, ihdrData, ihdrCrc]);

  const zlib = require('zlib');
  const raw = Buffer.from([0x00, 0xff, 0x00, 0x00]);
  const compressed = zlib.deflateSync(raw);
  const idatLen = Buffer.alloc(4);
  idatLen.writeUInt32BE(compressed.length, 0);
  const idatType = Buffer.from('IDAT');
  const idatCrc = Buffer.alloc(4);
  idatCrc.writeUInt32BE(crc32(Buffer.concat([idatType, compressed])), 0);
  const idat = Buffer.concat([idatLen, idatType, compressed, idatCrc]);

  const iendLen = Buffer.alloc(4, 0);
  const iendType = Buffer.from('IEND');
  const iendCrc = Buffer.alloc(4);
  iendCrc.writeUInt32BE(crc32(iendType), 0);
  const iend = Buffer.concat([iendLen, iendType, iendCrc]);

  return Buffer.concat([signature, ihdr, idat, iend]);
}

describe('Image Pipeline', () => {
  it('ingests blank PNG and queues GENERATE_L1 job', async () => {
    const filePath = path.join(tmpDir, 'blank.png');
    writeFileSync(filePath, createMinimalPNG());

    const result = await service.ingestFile(filePath);
    const node = result.node;
    expect(node.id).toMatch(/^[a-f0-9]{64}$/);
    expect(node.depth).toBe(0);
    expect(node.childrenIds.length).toBe(0); // atomic

    const obj = await cas.readObject(node.id);
    expect(obj.artifacts.content).toBe('');
    expect(obj.artifacts.meta.blocks.length).toBe(0);

    const jobs = registry.getPendingJobs(10);
    const job = jobs.find((j) => j.payload.includes(node.id));
    expect(job).toBeDefined();
    expect(job!.type).toBe('GENERATE_L1');
  });

  it('processes GENERATE_L1 → L2 → L3 for blank image', async () => {
    const filePath = path.join(tmpDir, 'blank.png');
    writeFileSync(filePath, createMinimalPNG());

    const result = await service.ingestFile(filePath);
    const node = result.node;

    // L1
    const l1Job = registry.acquireLease('worker-1', 60000)!;
    await pipeline.processJob(l1Job);
    registry.completeJob(l1Job.id);

    // L2
    const l2Lease = registry.acquireLease('worker-1', 60000)!;
    await pipeline.processJob(l2Lease);
    registry.completeJob(l2Lease.id);

    // L3
    const l3Lease = registry.acquireLease('worker-1', 60000)!;
    await pipeline.processJob(l3Lease);
    registry.completeJob(l3Lease.id);

    const objPath = cas.getObjectPath(node.id);
    const { existsSync } = require('fs');
    expect(existsSync(path.join(objPath, 'L1.md'))).toBe(true);
    expect(existsSync(path.join(objPath, 'L2.json'))).toBe(true);
  });
});
