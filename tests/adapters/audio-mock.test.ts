/**
 * Audio Mock Adapter Tests
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
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'retineo-audio-'));
  adaptersDir = path.join(tmpDir, 'adapters');
  mkdirSync(adaptersDir);

  // Copy audio-mock adapter into temp dir
  const srcDir = path.join(process.cwd(), 'packages/core/adapters/audio-mock');
  const destDir = path.join(adaptersDir, 'audio-mock');
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

describe('audio-mock adapter', () => {
  it('loads from manifest', async () => {
    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();
    expect(manager.list()).toContain('audio-mock');
  });

  it('resolves .mp3 by extension', async () => {
    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();
    const id = await manager.resolve('/tmp/song.mp3');
    expect(id).toBe('audio-mock');
  });

  it('resolves by mimeType audio/wav', async () => {
    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();
    const id = await manager.resolve('/tmp/song', 'audio/wav');
    expect(id).toBe('audio-mock');
  });

  it('ingests a small mp3 and returns speech blocks', async () => {
    const filePath = path.join(tmpDir, 'small.mp3');
    writeFileSync(filePath, Buffer.alloc(1024 * 60)); // 60 KB ≈ 60s

    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();

    const result = await manager.ingest(filePath);
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.metadata.blocks.length).toBeGreaterThan(0);

    const speechBlocks = result.metadata.blocks.filter((b) => b.type === 'speech');
    expect(speechBlocks.length).toBeGreaterThan(0);

    // Timestamps in ms
    expect(speechBlocks[0].timestamp).toBeDefined();
    expect(typeof speechBlocks[0].timestamp).toBe('number');

    // Speaker present
    expect(speechBlocks[0].speaker).toBeDefined();
    expect(['Speaker A', 'Speaker B', 'Speaker C']).toContain(speechBlocks[0].speaker);
  });

  it('creates segments for long audio (>5min)', async () => {
    const filePath = path.join(tmpDir, 'long.mp3');
    writeFileSync(filePath, Buffer.alloc(1024 * 600)); // 600 KB ≈ 600s = 10min

    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();

    const result = await manager.ingest(filePath);
    expect(result.segments).toBeDefined();
    expect(result.segments!.length).toBeGreaterThanOrEqual(2);

    // First segment spans 0-300000ms
    expect(result.segments![0].spanStart).toBe(0);
    expect(result.segments![0].spanEnd).toBe(300000);

    // Each segment has its own blocks
    expect(result.segments![0].metadata.blocks.length).toBeGreaterThan(0);
  });

  it('is deterministic — same filename gives same content', async () => {
    const filePath = path.join(tmpDir, 'deterministic.mp3');
    writeFileSync(filePath, Buffer.alloc(1024 * 120));

    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();

    const r1 = await manager.ingest(filePath);
    const r2 = await manager.ingest(filePath);
    expect(r1.content).toBe(r2.content);
    expect(r1.metadata.blocks.length).toBe(r2.metadata.blocks.length);
  });

  it('manifest has status: mock', async () => {
    const { readFileSync } = require('fs');
    const manifest = JSON.parse(
      readFileSync(path.join(adaptersDir, 'audio-mock', 'manifest.json'), 'utf-8')
    );
    expect(manifest.status).toBe('mock');
  });
});
