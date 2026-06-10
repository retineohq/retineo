/**
 * PDF Pipeline Integration Test
 * ingest PDF → compile L1/L2/L3 → search
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
import { DefaultCompilationPipeline } from '../../packages/core/src/layers/pipeline.js';
import { DefaultContextNodeRepository } from '../../packages/core/src/storage/context-node-repository.js';
import { DefaultL1Generator } from '../../packages/core/src/layers/l1-generator.js';
import { DefaultL2Generator } from '../../packages/core/src/layers/l2-generator.js';
import { DefaultL3Generator } from '../../packages/core/src/layers/l3-generator.js';
import { MockLLMProvider } from '../../packages/core/src/llm/providers/mock.js';

let tmpDir: string;
let dataDir: string;
let adaptersDir: string;
let dbPath: string;
let cas: LocalCASStorage;
let registry: SQLiteRegistry;
let builder: DefaultNodeBuilder;
let service: DefaultIngestionService;
let pipeline: DefaultCompilationPipeline;

beforeEach(async () => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'retineo-pdf-int-'));
  dataDir = path.join(tmpDir, 'data');
  adaptersDir = path.join(tmpDir, 'adapters');
  dbPath = path.join(dataDir, 'registry.sqlite');
  mkdirSync(dataDir);
  mkdirSync(adaptersDir);

  cas = new LocalCASStorage(dataDir);
  registry = new SQLiteRegistry(dbPath);
  builder = new DefaultNodeBuilder();

  // Copy real PDF adapter
  const pdfSrc = path.join(process.cwd(), 'packages/core/adapters/pdf');
  const pdfDest = path.join(adaptersDir, 'pdf');
  mkdirSync(pdfDest);
  const { readFileSync } = require('fs');
  writeFileSync(path.join(pdfDest, 'manifest.json'), readFileSync(path.join(pdfSrc, 'manifest.json')));
  writeFileSync(path.join(pdfDest, 'adapter.cjs'), readFileSync(path.join(pdfSrc, 'adapter.cjs')));

  const runner = new DefaultAdapterProcessRunner(tmpDir);
  const manager = new DefaultAdapterManager(adaptersDir, runner);
  service = new DefaultIngestionService(cas, registry, builder, manager, computeHash);
  await manager.loadBuiltIn();

  const llm = new MockLLMProvider({ id: 'mock', model: 'mock', apiKey: '' });
  const embedder = new MockLLMProvider({ id: 'mock', model: 'mock', apiKey: '' });
  const contextNodeRepository = new DefaultContextNodeRepository(cas, registry);
  pipeline = new DefaultCompilationPipeline({
    cas,
    registry,
    contextNodeRepository,
    l1Generator: new DefaultL1Generator(),
    l2Generator: new DefaultL2Generator(),
    l3Generator: new DefaultL3Generator(),
    llmProvider: llm,
    embeddingProvider: embedder,
    dataDir,
  });
});

afterEach(() => {
  registry.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function makePDFWithText(text: string): string {
  const filePath = path.join(tmpDir, 'doc.pdf');
  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${44 + text.length} >>
stream
BT
/F1 12 Tf
100 700 Td
(${text}) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
${350 + text.length}
%%EOF`;
  writeFileSync(filePath, pdf);
  return filePath;
}

describe('PDF Pipeline', () => {
  it('ingests PDF and queues GENERATE_L1 job', async () => {
    const filePath = makePDFWithText('RETINEO PDF Pipeline Test');

    const result = await service.ingestFile(filePath);
    const node = result.node;
    expect(node.id).toMatch(/^[a-f0-9]{64}$/);
    expect(node.depth).toBe(0);

    const obj = await cas.readObject(node.id);
    expect(obj.artifacts.content).toContain('RETINEO PDF Pipeline Test');

    const jobs = registry.getPendingJobs(10);
    const job = jobs.find((j) => j.payload.includes(node.id));
    expect(job).toBeDefined();
    expect(job!.type).toBe('GENERATE_L1');
  });

  it('processes GENERATE_L1 → L2 → L3 pipeline', async () => {
    const filePath = makePDFWithText('Machine learning is a subset of artificial intelligence.');

    const result = await service.ingestFile(filePath);
    const node = result.node;

    // Process L1
    const l1Job = registry.acquireLease('worker-1', 60000)!;
    expect(l1Job.payload).toContain(node.id);
    await pipeline.processJob(l1Job);
    registry.completeJob(l1Job.id);

    // L2 should be queued
    const l2Jobs = registry.getPendingJobs(10);
    const l2Job = l2Jobs.find((j) => j.type === 'GENERATE_L2' && j.payload.includes(node.id));
    expect(l2Job).toBeDefined();

    // Process L2
    const l2Lease = registry.acquireLease('worker-1', 60000)!;
    await pipeline.processJob(l2Lease);
    registry.completeJob(l2Lease.id);

    // L3 should be queued
    const l3Jobs = registry.getPendingJobs(10);
    const l3Job = l3Jobs.find((j) => j.type === 'GENERATE_L3' && j.payload.includes(node.id));
    expect(l3Job).toBeDefined();

    // Process L3
    const l3Lease = registry.acquireLease('worker-1', 60000)!;
    await pipeline.processJob(l3Lease);
    registry.completeJob(l3Lease.id);

    // Verify artifacts exist
    const objPath = cas.getObjectPath(node.id);
    const { existsSync } = require('fs');
    expect(existsSync(path.join(objPath, 'L1.md'))).toBe(true);
    expect(existsSync(path.join(objPath, 'L2.json'))).toBe(true);
  });
});
