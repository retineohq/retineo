/**
 * Multimodal Pipeline End-to-End Test
 * file → adapter → CAS → registry → verify content.meta.json
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

let tmpDir: string;
let dataDir: string;
let adaptersDir: string;
let dbPath: string;
let cas: LocalCASStorage;
let registry: SQLiteRegistry;
let builder: DefaultNodeBuilder;
let service: DefaultIngestionService;

beforeEach(async () => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'echo-mm-'));
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
  const manager = new DefaultAdapterManager(adaptersDir, runner);
  service = new DefaultIngestionService(cas, registry, builder, manager, computeHash);

  await manager.loadBuiltIn();
});

afterEach(() => {
  registry.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

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
      path.join(destDir, 'adapter.js'),
      readFileSync(path.join(srcDir, 'adapter.js'))
    );
  }
}

describe('Multimodal Pipeline', () => {
  it('audio: full pipeline creates root node, segments, and CAS meta', async () => {
    const filePath = path.join(tmpDir, 'podcast.mp3');
    writeFileSync(filePath, Buffer.alloc(1024 * 600)); // 600 KB ≈ 10 min

    const node = await service.ingestFile(filePath);

    expect(node.id).toMatch(/^[a-f0-9]{64}$/);
    expect(node.depth).toBe(0);
    expect(node.childrenIds.length).toBeGreaterThanOrEqual(2);

    // CAS root object has content + meta
    const rootObj = await cas.readObject(node.id);
    expect(rootObj.artifacts.content.length).toBeGreaterThan(0);
    expect(rootObj.artifacts.meta.blocks.length).toBeGreaterThan(0);

    // Meta blocks contain speech
    const speechBlocks = rootObj.artifacts.meta.blocks.filter((b: any) => b.type === 'speech');
    expect(speechBlocks.length).toBeGreaterThan(0);
    expect(speechBlocks[0].timestamp).toBeDefined();
    expect(speechBlocks[0].speaker).toBeDefined();

    // Registry has segments with span in ms
    const rawHash = computeHash(Buffer.alloc(1024 * 600));
    const source = registry.getSourceByRawHash(rawHash);
    expect(source).not.toBeNull();
    expect(source!.adapterId).toBe('audio-mock');

    // Children segments registered
    for (const childId of node.childrenIds) {
      const seg = registry.getSegment(childId);
      expect(seg).not.toBeNull();
      expect(seg!.spanStart).toBeGreaterThanOrEqual(0);
      expect(seg!.spanEnd).toBeGreaterThan(seg!.spanStart);
      expect(seg!.parentHash).toBe(node.id);
    }

    // Jobs queued for root + each segment
    const jobs = registry.getPendingJobs(100);
    const matching = jobs.filter((j) => j.payload.includes(node.id) || node.childrenIds.some((c) => j.payload.includes(c)));
    expect(matching.length).toBe(1 + node.childrenIds.length);
  });

  it('video: full pipeline creates frame + speech blocks in CAS meta', async () => {
    const filePath = path.join(tmpDir, 'lecture.mp4');
    writeFileSync(filePath, Buffer.alloc(1024 * 1024 * 4)); // 4 MB ≈ 400s = 2 segments

    const node = await service.ingestFile(filePath);

    expect(node.id).toMatch(/^[a-f0-9]{64}$/);
    expect(node.depth).toBe(0);

    const rootObj = await cas.readObject(node.id);
    const blocks = rootObj.artifacts.meta.blocks;

    const frameBlocks = blocks.filter((b: any) => b.type === 'frame');
    const speechBlocks = blocks.filter((b: any) => b.type === 'speech');

    expect(frameBlocks.length).toBeGreaterThan(0);
    expect(speechBlocks.length).toBeGreaterThan(0);

    // Frame has bbox
    expect(frameBlocks[0].bbox).toEqual([0, 0, 1920, 1080]);

    // Source registered
    const rawHash = computeHash(Buffer.alloc(1024 * 1024 * 4));
    const source = registry.getSourceByRawHash(rawHash);
    expect(source).not.toBeNull();
    expect(source!.adapterId).toBe('video-mock');
  });

  it('image: full pipeline creates ocr blocks, no segments', async () => {
    const filePath = path.join(tmpDir, 'scan.png');
    writeFileSync(filePath, Buffer.alloc(1024));

    const node = await service.ingestFile(filePath);

    expect(node.id).toMatch(/^[a-f0-9]{64}$/);
    expect(node.depth).toBe(0);
    expect(node.childrenIds.length).toBe(0); // atomic

    const rootObj = await cas.readObject(node.id);
    const blocks = rootObj.artifacts.meta.blocks;

    const ocrBlocks = blocks.filter((b: any) => b.type === 'ocr');
    expect(ocrBlocks.length).toBeGreaterThan(0);

    for (const b of ocrBlocks) {
      expect(b.bbox).toBeDefined();
      expect(b.bbox.length).toBe(4);
      expect(b.confidence).toBeGreaterThanOrEqual(0);
      expect(b.confidence).toBeLessThanOrEqual(1);
    }

    const rawHash = computeHash(Buffer.alloc(1024));
    const source = registry.getSourceByRawHash(rawHash);
    expect(source).not.toBeNull();
    expect(source!.adapterId).toBe('image-mock');
  });

  it('batch ingest of mixed media types', async () => {
    const audioPath = path.join(tmpDir, 'song.mp3');
    const imagePath = path.join(tmpDir, 'doc.jpg');
    writeFileSync(audioPath, Buffer.alloc(1024 * 300));
    writeFileSync(imagePath, Buffer.alloc(1024));

    const nodes = await service.ingestBatch([audioPath, imagePath]);
    expect(nodes.length).toBe(2);
    expect(nodes[0].id).not.toBe(nodes[1].id);

    // Audio has segments, image does not
    expect(nodes[0].childrenIds.length).toBeGreaterThan(0);
    expect(nodes[1].childrenIds.length).toBe(0);
  });
});
