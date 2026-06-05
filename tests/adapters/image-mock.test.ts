/**
 * Image Mock Adapter Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import os from 'os';
import { DefaultAdapterManager } from '../../packages/core/src/adapters/manager.js';
import { DefaultAdapterProcessRunner } from '../../packages/core/src/adapters/runner.js';

let tmpDir: string;
let adaptersDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'echo-image-'));
  adaptersDir = path.join(tmpDir, 'adapters');
  mkdirSync(adaptersDir);

  const srcDir = path.join(process.cwd(), 'packages/core/adapters/image-mock');
  const destDir = path.join(adaptersDir, 'image-mock');
  mkdirSync(destDir);
  const { readFileSync } = require('fs');
  writeFileSync(
    path.join(destDir, 'manifest.json'),
    readFileSync(path.join(srcDir, 'manifest.json'))
  );
  writeFileSync(
    path.join(destDir, 'adapter.js'),
    readFileSync(path.join(srcDir, 'adapter.js'))
  );
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('image-mock adapter', () => {
  it('loads from manifest', async () => {
    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();
    expect(manager.list()).toContain('image-mock');
  });

  it('resolves .png by extension', async () => {
    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();
    const id = await manager.resolve('/tmp/photo.png');
    expect(id).toBe('image-mock');
  });

  it('resolves .jpg by extension', async () => {
    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();
    const id = await manager.resolve('/tmp/photo.jpg');
    expect(id).toBe('image-mock');
  });

  it('returns ocr blocks with bbox and confidence', async () => {
    const filePath = path.join(tmpDir, 'invoice.png');
    writeFileSync(filePath, Buffer.alloc(1024));

    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();

    const result = await manager.ingest(filePath);
    expect(result.content.length).toBeGreaterThan(0);

    const ocrBlocks = result.metadata.blocks.filter((b) => b.type === 'ocr');
    expect(ocrBlocks.length).toBeGreaterThan(0);

    for (const block of ocrBlocks) {
      expect(block.bbox).toBeDefined();
      expect(block.bbox!.length).toBe(4);
      expect(block.confidence).toBeDefined();
      expect(block.confidence).toBeGreaterThanOrEqual(0);
      expect(block.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('has no segments (images are atomic)', async () => {
    const filePath = path.join(tmpDir, 'photo.png');
    writeFileSync(filePath, Buffer.alloc(1024));

    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();

    const result = await manager.ingest(filePath);
    expect(result.segments).toBeUndefined();
  });

  it('is deterministic', async () => {
    const filePath = path.join(tmpDir, 'same.png');
    writeFileSync(filePath, Buffer.alloc(1024));

    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();

    const r1 = await manager.ingest(filePath);
    const r2 = await manager.ingest(filePath);
    expect(r1.content).toBe(r2.content);
    expect(r1.metadata.blocks.length).toBe(r2.metadata.blocks.length);
  });

  it('manifest has status: mock', () => {
    const { readFileSync } = require('fs');
    const manifest = JSON.parse(
      readFileSync(path.join(adaptersDir, 'image-mock', 'manifest.json'), 'utf-8')
    );
    expect(manifest.status).toBe('mock');
  });
});
