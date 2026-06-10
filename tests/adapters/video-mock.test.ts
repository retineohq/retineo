/**
 * Video Mock Adapter Tests
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
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'retineo-video-'));
  adaptersDir = path.join(tmpDir, 'adapters');
  mkdirSync(adaptersDir);

  const srcDir = path.join(process.cwd(), 'packages/core/adapters/video-mock');
  const destDir = path.join(adaptersDir, 'video-mock');
  mkdirSync(destDir);
  const { readFileSync } = require('fs');
  writeFileSync(
    path.join(destDir, 'manifest.json'),
    readFileSync(path.join(srcDir, 'manifest.json'))
  );
  writeFileSync(
    path.join(destDir, 'adapter.cjs'),
    readFileSync(path.join(srcDir, 'adapter.cjs'))
  );
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('video-mock adapter', () => {
  it('loads from manifest', async () => {
    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();
    expect(manager.list()).toContain('video-mock');
  });

  it('resolves .mp4 by extension', async () => {
    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();
    const id = await manager.resolve('/tmp/movie.mp4');
    expect(id).toBe('video-mock');
  });

  it('returns both frame and speech blocks', async () => {
    const filePath = path.join(tmpDir, 'clip.mp4');
    writeFileSync(filePath, Buffer.alloc(1024 * 100)); // 100 KB ≈ 10s video

    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();

    const result = await manager.ingest(filePath);
    expect(result.content.length).toBeGreaterThan(0);

    const frameBlocks = result.metadata.blocks.filter((b) => b.type === 'frame');
    const speechBlocks = result.metadata.blocks.filter((b) => b.type === 'speech');

    expect(frameBlocks.length).toBeGreaterThan(0);
    expect(speechBlocks.length).toBeGreaterThan(0);
  });

  it('frame blocks have bbox and timestamp', async () => {
    const filePath = path.join(tmpDir, 'clip.mp4');
    writeFileSync(filePath, Buffer.alloc(1024 * 100));

    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();

    const result = await manager.ingest(filePath);
    const frame = result.metadata.blocks.find((b) => b.type === 'frame');
    expect(frame).toBeDefined();
    expect(frame!.bbox).toBeDefined();
    expect(frame!.bbox).toEqual([0, 0, 1920, 1080]);
    expect(typeof frame!.timestamp).toBe('number');
  });

  it('creates segments for long video', async () => {
    const filePath = path.join(tmpDir, 'long.mp4');
    writeFileSync(filePath, Buffer.alloc(1024 * 1024 * 2)); // 2 MB ≈ 200s

    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();

    const result = await manager.ingest(filePath);
    expect(result.segments).toBeDefined();
    expect(result.segments!.length).toBeGreaterThanOrEqual(1);

    // Each segment should have at least one frame block
    for (const seg of result.segments!) {
      expect(seg.metadata.blocks.some((b) => b.type === 'frame')).toBe(true);
    }
  });

  it('manifest has status: mock', () => {
    const { readFileSync } = require('fs');
    const manifest = JSON.parse(
      readFileSync(path.join(adaptersDir, 'video-mock', 'manifest.json'), 'utf-8')
    );
    expect(manifest.status).toBe('mock');
  });
});
