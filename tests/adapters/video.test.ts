/**
 * Real Video Adapter Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import os from 'os';
import { DefaultAdapterManager } from '../../packages/core/src/adapters/manager.js';
import { DefaultAdapterProcessRunner } from '../../packages/core/src/adapters/runner.js';

let tmpDir: string;
let adaptersDir: string;

function setupAdapterDir() {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'echo-video-real-'));
  adaptersDir = path.join(tmpDir, 'adapters');
  mkdirSync(adaptersDir);

  const srcDir = path.join(process.cwd(), 'packages/core/adapters/video');
  const destDir = path.join(adaptersDir, 'video');
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
}

beforeEach(() => {
  setupAdapterDir();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function mockWhisperResponse(segments: Array<{ id: number; start: number; end: number; text: string }>) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ segments }),
  } as unknown as Response);
}

describe('video adapter', () => {
  it('loads from manifest', async () => {
    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();
    expect(manager.list()).toContain('video');
  });

  it('resolves .mp4 by extension', async () => {
    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();
    const id = await manager.resolve('/tmp/movie.mp4');
    expect(id).toBe('video');
  });

  it('returns empty content for invalid video (ffmpeg present but cannot parse)', async () => {
    const filePath = path.join(tmpDir, 'clip.mp4');
    writeFileSync(filePath, Buffer.alloc(1024)); // not a real video

    process.env.WHISPER_API_KEY = 'test-key';

    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();

    const result = await manager.ingest(filePath);
    // ffmpeg may be installed but cannot parse dummy bytes → graceful empty
    expect(result.content).toBe('');
    expect(result.metadata.blocks).toEqual([]);
  });

  it('returns graceful empty when no transcription engine available', async () => {
    const filePath = path.join(tmpDir, 'clip.mp4');
    writeFileSync(filePath, Buffer.alloc(1024));

    const oldKey = process.env.WHISPER_API_KEY;
    const oldOpenAi = process.env.OPENAI_API_KEY;
    delete process.env.WHISPER_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();

    const result = await manager.ingest(filePath);
    // No API key and no whisper.cpp → graceful empty
    expect(result.content).toBe('');
    expect(result.metadata.blocks).toEqual([]);

    if (oldKey) process.env.WHISPER_API_KEY = oldKey;
    if (oldOpenAi) process.env.OPENAI_API_KEY = oldOpenAi;
  });

  it('manifest has status: stable', () => {
    const { readFileSync } = require('fs');
    const manifest = JSON.parse(
      readFileSync(path.join(adaptersDir, 'video', 'manifest.json'), 'utf-8')
    );
    expect(manifest.status).toBe('stable');
  });
});
