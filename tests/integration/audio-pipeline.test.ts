/**
 * Audio Pipeline Integration Test
 * End-to-end: ingest audio → verify adapter output structure
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

function setupAdapterDir() {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'echo-audio-pipe-'));
  adaptersDir = path.join(tmpDir, 'adapters');
  mkdirSync(adaptersDir);

  const srcDir = path.join(process.cwd(), 'packages/core/adapters/audio');
  const destDir = path.join(adaptersDir, 'audio');
  mkdirSync(destDir);
  const { readFileSync } = require('fs');
  writeFileSync(path.join(destDir, 'manifest.json'), readFileSync(path.join(srcDir, 'manifest.json')));
  writeFileSync(path.join(destDir, 'adapter.js'), readFileSync(path.join(srcDir, 'adapter.js')));
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

describe('audio pipeline integration', () => {
  it('ingests audio and produces searchable transcript structure', async () => {
    const filePath = path.join(tmpDir, 'sample.mp3');
    writeFileSync(filePath, Buffer.alloc(1024 * 2));

    const mockUrl = await startMockServer({
      segments: [
        { id: 0, start: 0, end: 3.5, text: 'Welcome to the meeting' },
        { id: 1, start: 3.5, end: 8.2, text: 'Today we discuss quarterly results' },
      ],
    });
    process.env.WHISPER_API_KEY = 'test-key';
    process.env.WHISPER_API_URL = mockUrl;

    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();

    const result = await manager.ingest(filePath);

    // Content is markdown-like with timestamps
    expect(result.content).toContain('Welcome to the meeting');
    expect(result.metadata.blocks.length).toBeGreaterThan(0);

    // Speech blocks have timestamps in ms
    const speech = result.metadata.blocks.filter((b) => b.type === 'speech');
    expect(speech.length).toBeGreaterThan(0);
    expect(speech[0].timestamp).toBe(0);

    // Speaker assigned
    expect(speech[0].speaker).toBeDefined();

    // No segments for short audio (< 5 min)
    expect(result.segments).toBeUndefined();
  });
});
