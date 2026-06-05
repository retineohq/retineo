/**
 * Real Audio Adapter Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import os from 'os';
import { createServer } from 'http';
import { DefaultAdapterManager } from '../../packages/core/src/adapters/manager.js';
import { DefaultAdapterProcessRunner } from '../../packages/core/src/adapters/runner.js';

let tmpDir: string;
let adaptersDir: string;
let mockServer: ReturnType<typeof createServer> | null = null;
let mockUrl: string = '';

function setupAdapterDir() {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'echo-audio-real-'));
  adaptersDir = path.join(tmpDir, 'adapters');
  mkdirSync(adaptersDir);

  const srcDir = path.join(process.cwd(), 'packages/core/adapters/audio');
  const destDir = path.join(adaptersDir, 'audio');
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

async function startMockServer(responseBody: unknown) {
  return new Promise<string>((resolve) => {
    const server = createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(responseBody));
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      mockServer = server;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

beforeEach(() => {
  setupAdapterDir();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  if (mockServer) {
    mockServer.close();
    mockServer = null;
  }
});

describe('audio adapter', () => {
  it('loads from manifest', async () => {
    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();
    expect(manager.list()).toContain('audio');
  });

  it('resolves .mp3 by extension', async () => {
    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();
    const id = await manager.resolve('/tmp/song.mp3');
    expect(id).toBe('audio');
  });

  it('resolves by mimeType audio/wav', async () => {
    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();
    const id = await manager.resolve('/tmp/song', 'audio/wav');
    expect(id).toBe('audio');
  });

  it('returns speech blocks with timestamps', async () => {
    const filePath = path.join(tmpDir, 'small.mp3');
    writeFileSync(filePath, Buffer.alloc(1024 * 2));

    mockUrl = await startMockServer({
      segments: [
        { id: 0, start: 0, end: 5.32, text: 'Hello world' },
        { id: 1, start: 5.32, end: 12.1, text: 'This is a test' },
      ],
    });
    process.env.WHISPER_API_KEY = 'test-key';
    process.env.WHISPER_API_URL = mockUrl;

    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();

    const result = await manager.ingest(filePath);
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.metadata.blocks.length).toBeGreaterThan(0);

    const speechBlocks = result.metadata.blocks.filter((b) => b.type === 'speech');
    expect(speechBlocks.length).toBeGreaterThan(0);
    expect(speechBlocks[0].timestamp).toBeDefined();
    expect(typeof speechBlocks[0].timestamp).toBe('number');
    expect(speechBlocks[0].speaker).toBeDefined();
  });

  it('returns ADAPTER_CONFIG_ERROR when API key missing', async () => {
    const filePath = path.join(tmpDir, 'small.mp3');
    writeFileSync(filePath, Buffer.alloc(1024 * 2));

    const oldKey = process.env.WHISPER_API_KEY;
    const oldOpenAi = process.env.OPENAI_API_KEY;
    delete process.env.WHISPER_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.WHISPER_API_URL;

    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();

    await expect(manager.ingest(filePath)).rejects.toThrow(/WHISPER_API_KEY not set/);

    if (oldKey) process.env.WHISPER_API_KEY = oldKey;
    if (oldOpenAi) process.env.OPENAI_API_KEY = oldOpenAi;
  });

  it('returns error when file too large', async () => {
    const filePath = path.join(tmpDir, 'huge.mp3');
    writeFileSync(filePath, Buffer.alloc(26 * 1024 * 1024)); // 26 MB

    process.env.WHISPER_API_KEY = 'test-key';
    delete process.env.WHISPER_API_URL;

    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();

    await expect(manager.ingest(filePath)).rejects.toThrow(/too large/);
  });

  it('creates segments for long audio', async () => {
    const filePath = path.join(tmpDir, 'long.mp3');
    writeFileSync(filePath, Buffer.alloc(1024 * 2));

    // Simulate 12 minutes of audio
    const segments = [];
    for (let i = 0; i < 12; i++) {
      segments.push({ id: i, start: i * 60, end: (i + 1) * 60, text: `Minute ${i}` });
    }
    mockUrl = await startMockServer({ segments });
    process.env.WHISPER_API_KEY = 'test-key';
    process.env.WHISPER_API_URL = mockUrl;

    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();

    const result = await manager.ingest(filePath);
    expect(result.segments).toBeDefined();
    expect(result.segments!.length).toBeGreaterThanOrEqual(2);
    expect(result.segments![0].spanStart).toBe(0);
    expect(result.segments![0].spanEnd).toBe(300000);
  });

  it('manifest has status: stable', () => {
    const { readFileSync } = require('fs');
    const manifest = JSON.parse(
      readFileSync(path.join(adaptersDir, 'audio', 'manifest.json'), 'utf-8')
    );
    expect(manifest.status).toBe('stable');
  });
});
