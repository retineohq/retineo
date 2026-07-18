/**
 * Multimodal Pipeline End-to-End Test
 * file → adapter → CAS → registry → verify content.meta.json
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
let manager: DefaultAdapterManager;
let service: DefaultIngestionService;

beforeEach(async () => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'retineo-mm-'));
  dataDir = path.join(tmpDir, 'data');
  adaptersDir = path.join(tmpDir, 'adapters');
  dbPath = path.join(dataDir, 'registry.sqlite');
  mkdirSync(dataDir);
  mkdirSync(adaptersDir);

  cas = new LocalCASStorage(dataDir);
  registry = new SQLiteRegistry(dbPath);
  builder = new DefaultNodeBuilder();

  setupMockAdapters();

  const runner = new DefaultAdapterProcessRunner(tmpDir);
  manager = new DefaultAdapterManager(adaptersDir, runner);
  const pipeline = makeRecordingPipeline(registry);
  service = new DefaultIngestionService(cas, registry, builder, manager, pipeline, computeHash);

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

function setupMockAdapters(): void {
  const { readFileSync } = require('fs');
  const mockNames = ['audio-mock', 'video-mock', 'image-mock'];
  for (const name of mockNames) {
    const srcDir = path.join(process.cwd(), 'packages/core/adapters', name);
    const destDir = path.join(adaptersDir, name);
    mkdirSync(destDir);
    writeFileSync(
      path.join(destDir, 'manifest.json'),
      readFileSync(path.join(srcDir, 'manifest.json'))
    );
    writeFileSync(
      path.join(destDir, 'adapter.cjs'),
      readFileSync(path.join(srcDir, 'adapter.cjs'))
    );
  }
}

describe('Multimodal Pipeline', () => {
  it('audio: full pipeline creates root node, segments, and CAS meta', async () => {
    const filePath = path.join(tmpDir, 'podcast.mp3');
    writeFileSync(filePath, Buffer.alloc(1024 * 600)); // 600 KB ≈ 10 min

    const result = await service.ingestFile(filePath);
    const contentHash = result.contentHash;

    expect(contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.action).toBe('created');

    // CAS root object has content + meta
    const rootObj = await cas.readObject(contentHash);
    expect(rootObj.artifacts.content.length).toBeGreaterThan(0);
    expect(rootObj.artifacts.meta.blocks.length).toBeGreaterThan(0);

    // Meta blocks contain speech
    const speechBlocks = rootObj.artifacts.meta.blocks.filter((b: any) => b.type === 'speech');
    expect(speechBlocks.length).toBeGreaterThan(0);
    expect(speechBlocks[0].timestamp).toBeDefined();
    expect(speechBlocks[0].speaker).toBeDefined();

    // Registry has source
    const sourceId = `filesystem:${path.dirname(filePath)}`;
    const source = registry.get(sourceId, filePath);
    expect(source).not.toBeNull();
    expect(source!.contentHash).toBe(contentHash);
    expect(await manager.resolve(filePath)).toBe('audio-mock');

    // Jobs queued for root
    const jobs = registry.getPendingJobs(100);
    const matching = jobs.filter((j) => j.payload.includes(contentHash));
    expect(matching.length).toBeGreaterThanOrEqual(1);
  });

  it('video: full pipeline creates frame + speech blocks in CAS meta', async () => {
    const filePath = path.join(tmpDir, 'lecture.mp4');
    writeFileSync(filePath, Buffer.alloc(1024 * 1024 * 4)); // 4 MB ≈ 400s = 2 segments

    const result = await service.ingestFile(filePath);
    const contentHash = result.contentHash;

    expect(contentHash).toMatch(/^[a-f0-9]{64}$/);

    const rootObj = await cas.readObject(contentHash);
    const blocks = rootObj.artifacts.meta.blocks;

    const frameBlocks = blocks.filter((b: any) => b.type === 'frame');
    const speechBlocks = blocks.filter((b: any) => b.type === 'speech');

    expect(frameBlocks.length).toBeGreaterThan(0);
    expect(speechBlocks.length).toBeGreaterThan(0);

    // Frame has bbox
    expect(frameBlocks[0].bbox).toEqual([0, 0, 1920, 1080]);

    // Source registered
    const sourceId = `filesystem:${path.dirname(filePath)}`;
    const source = registry.get(sourceId, filePath);
    expect(source).not.toBeNull();
    expect(source!.contentHash).toBe(contentHash);
    expect(await manager.resolve(filePath)).toBe('video-mock');
  });

  it('image: full pipeline creates ocr blocks, no segments', async () => {
    const filePath = path.join(tmpDir, 'scan.png');
    writeFileSync(filePath, Buffer.alloc(1024));

    const result = await service.ingestFile(filePath);
    const contentHash = result.contentHash;

    expect(contentHash).toMatch(/^[a-f0-9]{64}$/);

    const rootObj = await cas.readObject(contentHash);
    const blocks = rootObj.artifacts.meta.blocks;

    const ocrBlocks = blocks.filter((b: any) => b.type === 'ocr');
    expect(ocrBlocks.length).toBeGreaterThan(0);

    for (const b of ocrBlocks) {
      expect(b.bbox).toBeDefined();
      expect(b.bbox.length).toBe(4);
      expect(b.confidence).toBeGreaterThanOrEqual(0);
      expect(b.confidence).toBeLessThanOrEqual(1);
    }

    const sourceId = `filesystem:${path.dirname(filePath)}`;
    const source = registry.get(sourceId, filePath);
    expect(source).not.toBeNull();
    expect(source!.contentHash).toBe(contentHash);
    expect(await manager.resolve(filePath)).toBe('image-mock');
  });

  it('batch ingest of mixed media types', async () => {
    const audioPath = path.join(tmpDir, 'song.mp3');
    const imagePath = path.join(tmpDir, 'doc.jpg');
    writeFileSync(audioPath, Buffer.alloc(1024 * 300));
    writeFileSync(imagePath, Buffer.alloc(1024));

    const results = await service.ingestBatch([audioPath, imagePath]);
    expect(results.length).toBe(2);
    expect(results[0].contentHash).not.toBe(results[1].contentHash);
  });
});
