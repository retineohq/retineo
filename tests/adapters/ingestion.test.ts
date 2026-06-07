/**
 * Ingestion Service Tests
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
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'echo-ingest-'));
  dataDir = path.join(tmpDir, 'data');
  adaptersDir = path.join(tmpDir, 'adapters');
  dbPath = path.join(dataDir, 'registry.sqlite');
  mkdirSync(dataDir);
  mkdirSync(adaptersDir);

  cas = new LocalCASStorage(dataDir);
  registry = new SQLiteRegistry(dbPath);
  builder = new DefaultNodeBuilder();

  setupAdapters();

  const runner = new DefaultAdapterProcessRunner(tmpDir);
  const manager = new DefaultAdapterManager(adaptersDir, runner);
  service = new DefaultIngestionService(cas, registry, builder, manager, computeHash);

  // Must load adapters before use
  await manager.loadBuiltIn();
});

afterEach(() => {
  registry.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function setupAdapters(): void {
  // Text adapter
  const textDir = path.join(adaptersDir, 'text');
  mkdirSync(textDir);
  writeFileSync(
    path.join(textDir, 'manifest.json'),
    JSON.stringify({ id: 'text', version: '1.0.0', mimeTypes: ['text/plain'], extensions: ['.txt'], entry: 'adapter.cjs' })
  );
  writeFileSync(
    path.join(textDir, 'adapter.cjs'),
    `
const readline = require('readline');
const fs = require('fs').promises;
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  const req = JSON.parse(line);
  let result;
  switch (req.method) {
    case 'initialize': result = { adapterId: 'text', version: '1.0.0' }; break;
    case 'capabilities': result = { mimeTypes: ['text/plain'], extensions: ['.txt'] }; break;
    case 'ingest': {
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

  // Markdown adapter
  const mdDir = path.join(adaptersDir, 'markdown');
  mkdirSync(mdDir);
  writeFileSync(
    path.join(mdDir, 'manifest.json'),
    JSON.stringify({ id: 'markdown', version: '1.0.0', mimeTypes: ['text/markdown'], extensions: ['.md'], entry: 'adapter.cjs' })
  );
  writeFileSync(
    path.join(mdDir, 'adapter.cjs'),
    `
const readline = require('readline');
const fs = require('fs').promises;
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  const req = JSON.parse(line);
  let result;
  switch (req.method) {
    case 'initialize': result = { adapterId: 'markdown', version: '1.0.0' }; break;
    case 'capabilities': result = { mimeTypes: ['text/markdown'], extensions: ['.md'] }; break;
    case 'ingest': {
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

describe('DefaultIngestionService', () => {
  it('ingests a text file through full pipeline', async () => {
    const filePath = path.join(tmpDir, 'hello.txt');
    writeFileSync(filePath, 'Hello ECHO');

    const node = await service.ingestFile(filePath);

    expect(node.id).toMatch(/^[a-f0-9]{64}$/);
    expect(node.depth).toBe(0);
    expect(node.artifacts.l0).toBeDefined();
    expect(node.artifacts.l0!.wordCount).toBe(2);

    // CAS has object (readObject verifies content.md + node.json)
    const obj = await cas.readObject(node.id);
    expect(obj.artifacts.content).toBe('Hello ECHO');

    // Registry has source
    const rawHash = computeHash(Buffer.from('Hello ECHO'));
    const source = registry.getSourceByRawHash(rawHash);
    expect(source).not.toBeNull();
    expect(source!.uri).toBe(filePath);

    // Job queued
    const jobs = registry.getPendingJobs(10);
    const job = jobs.find((j) => j.payload.includes(node.id));
    expect(job).toBeDefined();
    expect(job!.type).toBe('GENERATE_L1');
  });

  it('ingests a markdown file', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    writeFileSync(filePath, '# Title\n\nBody text here.\n');

    const node = await service.ingestFile(filePath);
    expect(node.id).toMatch(/^[a-f0-9]{64}$/);
    const obj = await cas.readObject(node.id);
    expect(obj.artifacts.content).toContain('# Title');
  });

  it('is idempotent — same file twice returns existing node', async () => {
    const filePath = path.join(tmpDir, 'dup.txt');
    writeFileSync(filePath, 'Same content');

    const node1 = await service.ingestFile(filePath);
    const node2 = await service.ingestFile(filePath);

    expect(node1.id).toBe(node2.id);

    // Only one source record
    const rawHash = computeHash(Buffer.from('Same content'));
    const source = registry.getSourceByRawHash(rawHash);
    expect(source).not.toBeNull();
  });

  it('ingests batch of files', async () => {
    const f1 = path.join(tmpDir, 'a.txt');
    const f2 = path.join(tmpDir, 'b.txt');
    writeFileSync(f1, 'File A');
    writeFileSync(f2, 'File B');

    const nodes = await service.ingestBatch([f1, f2]);
    expect(nodes.length).toBe(2);
    expect(nodes[0].id).not.toBe(nodes[1].id);
  });

  it('queues GENERATE_L1 job for each ingested file', async () => {
    const filePath = path.join(tmpDir, 'job.txt');
    writeFileSync(filePath, 'Queue me');

    const node = await service.ingestFile(filePath);
    const jobs = registry.getPendingJobs(10);
    const matching = jobs.filter((j) => j.payload.includes(node.id));
    expect(matching.length).toBe(1);
    expect(matching[0].type).toBe('GENERATE_L1');
  });
});
