/**
 * Adapter Manager Tests
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
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'echo-mgr-'));
  adaptersDir = path.join(tmpDir, 'adapters');
  mkdirSync(adaptersDir);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeTextAdapter(): void {
  const dir = path.join(adaptersDir, 'text');
  mkdirSync(dir);
  writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({
      id: 'text',
      version: '1.0.0',
      mimeTypes: ['text/plain'],
      extensions: ['.txt'],
      entry: 'adapter.js',
    })
  );
  writeFileSync(
    path.join(dir, 'adapter.js'),
    `
const rl = require('readline').createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  const req = JSON.parse(line);
  let result;
  switch (req.method) {
    case 'initialize': result = { adapterId: 'text', version: '1.0.0' }; break;
    case 'capabilities': result = { mimeTypes: ['text/plain'], extensions: ['.txt'] }; break;
    case 'ingest': {
      const fs = require('fs').promises;
      const content = await fs.readFile(req.params.uri, 'utf-8');
      result = { content, metadata: { blocks: [{ type: 'heading', offset: 0, length: content.length }] } };
      break;
    }
    case 'shutdown': process.exit(0);
  }
  console.log(JSON.stringify({ jsonrpc: '2.0', id: req.id, result }));
});
`
  );
}

function writeMarkdownAdapter(): void {
  const dir = path.join(adaptersDir, 'markdown');
  mkdirSync(dir);
  writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({
      id: 'markdown',
      version: '1.0.0',
      mimeTypes: ['text/markdown'],
      extensions: ['.md'],
      entry: 'adapter.js',
    })
  );
  writeFileSync(
    path.join(dir, 'adapter.js'),
    `
const rl = require('readline').createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  const req = JSON.parse(line);
  let result;
  switch (req.method) {
    case 'initialize': result = { adapterId: 'markdown', version: '1.0.0' }; break;
    case 'capabilities': result = { mimeTypes: ['text/markdown'], extensions: ['.md'] }; break;
    case 'ingest': {
      const fs = require('fs').promises;
      const content = await fs.readFile(req.params.uri, 'utf-8');
      const blocks = [];
      const lines = content.split('\\n');
      let offset = 0;
      for (const l of lines) {
        if (l.match(/^(#{1,6})\\s/)) {
          blocks.push({ type: 'heading', offset, length: l.length });
        }
        offset += l.length + 1;
      }
      if (blocks.length === 0) blocks.push({ type: 'heading', offset: 0, length: content.length });
      result = { content, metadata: { blocks } };
      break;
    }
    case 'shutdown': process.exit(0);
  }
  console.log(JSON.stringify({ jsonrpc: '2.0', id: req.id, result }));
});
`
  );
}

describe('DefaultAdapterManager', () => {
  it('loads built-in adapters from directory', async () => {
    writeTextAdapter();
    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();
    expect(manager.list()).toContain('text');
  });

  it('resolves .txt by extension', async () => {
    writeTextAdapter();
    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();
    const id = await manager.resolve('/tmp/hello.txt');
    expect(id).toBe('text');
  });

  it('resolves by mimeType', async () => {
    writeTextAdapter();
    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();
    const id = await manager.resolve('/tmp/hello', 'text/plain');
    expect(id).toBe('text');
  });

  it('resolves .md to markdown adapter', async () => {
    writeTextAdapter();
    writeMarkdownAdapter();
    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();
    const id = await manager.resolve('/tmp/hello.md');
    expect(id).toBe('markdown');
  });

  it('throws when no adapter matches', async () => {
    writeTextAdapter();
    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();
    await expect(manager.resolve('/tmp/hello.pdf')).rejects.toThrow('No adapter found');
  });

  it('ingests a text file', async () => {
    writeTextAdapter();
    const filePath = path.join(tmpDir, 'test.txt');
    writeFileSync(filePath, 'Hello world');

    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();

    const result = await manager.ingest(filePath);
    expect(result.content).toBe('Hello world');
    expect(result.metadata.blocks.length).toBeGreaterThanOrEqual(1);
    expect(result.metadata.blocks[0].type).toBe('heading');
  });

  it('ingests a markdown file with heading blocks', async () => {
    writeMarkdownAdapter();
    const filePath = path.join(tmpDir, 'test.md');
    writeFileSync(filePath, '# Title\n\nSome body\n\n## Section');

    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();

    const result = await manager.ingest(filePath);
    expect(result.content).toContain('# Title');
    const headings = result.metadata.blocks.filter((b) => b.type === 'heading');
    expect(headings.length).toBe(2);
  });

  it('returns capabilities', async () => {
    writeTextAdapter();
    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();

    const caps = await manager.capabilities('text');
    expect(caps.mimeTypes).toContain('text/plain');
    expect(caps.extensions).toContain('.txt');
  });
});
