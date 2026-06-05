/**
 * Video Pipeline Integration Test
 * End-to-end: ingest video → verify adapter output structure
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import os from 'os';
import { DefaultAdapterManager } from '../../packages/core/src/adapters/manager.js';
import { DefaultAdapterProcessRunner } from '../../packages/core/src/adapters/runner.js';

let tmpDir: string;
let adaptersDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'echo-video-pipe-'));
  adaptersDir = path.join(tmpDir, 'adapters');
  mkdirSync(adaptersDir);

  const srcDir = path.join(process.cwd(), 'packages/core/adapters/video');
  const destDir = path.join(adaptersDir, 'video');
  mkdirSync(destDir);
  const { readFileSync } = require('fs');
  writeFileSync(path.join(destDir, 'manifest.json'), readFileSync(path.join(srcDir, 'manifest.json')));
  writeFileSync(path.join(destDir, 'adapter.js'), readFileSync(path.join(srcDir, 'adapter.js')));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('video pipeline integration', () => {
  it('ingests invalid video and returns empty content gracefully', async () => {
    const filePath = path.join(tmpDir, 'sample.mp4');
    writeFileSync(filePath, Buffer.alloc(1024 * 2)); // not a real video

    // Mock fetch for Whisper
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        segments: [
          { id: 0, start: 0, end: 5, text: 'Scene one dialogue' },
          { id: 1, start: 30, end: 35, text: 'Scene two dialogue' },
        ],
      }),
    } as unknown as Response));
    process.env.WHISPER_API_KEY = 'test-key';

    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();

    // Dummy file cannot be parsed by ffmpeg → graceful empty
    const result = await manager.ingest(filePath);
    expect(result.content).toBe('');
    expect(result.metadata.blocks).toEqual([]);
  });
});
