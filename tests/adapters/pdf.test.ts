/**
 * PDF Adapter Tests
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
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'retineo-pdf-'));
  adaptersDir = path.join(tmpDir, 'adapters');
  mkdirSync(adaptersDir);

  const srcDir = path.join(process.cwd(), 'packages/core/adapters/pdf');
  const destDir = path.join(adaptersDir, 'pdf');
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

describe('pdf adapter', () => {
  it('loads from manifest', async () => {
    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();
    expect(manager.list()).toContain('pdf');
  });

  it('resolves .pdf by extension', async () => {
    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();
    const id = await manager.resolve('/tmp/doc.pdf');
    expect(id).toBe('pdf');
  });

  it('resolves by mimeType application/pdf', async () => {
    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();
    const id = await manager.resolve('/tmp/doc', 'application/pdf');
    expect(id).toBe('pdf');
  });

  it('extracts text from a valid PDF', async () => {
    const filePath = path.join(tmpDir, 'sample.pdf');
    // Minimal valid PDF with text
    const pdfContent = `%PDF-1.4
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
<< /Length 68 >>
stream
BT
/F1 12 Tf
100 700 Td
(Hello PDF World) Tj
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
0000000384 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
473
%%EOF`;
    writeFileSync(filePath, pdfContent);

    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();

    const result = await manager.ingest(filePath);
    expect(result.content).toContain('Hello PDF World');
    expect(result.metadata.blocks.length).toBeGreaterThanOrEqual(0);
  });

  it('detects headings by heuristics', async () => {
    const filePath = path.join(tmpDir, 'headings.pdf');
    const pdfContent = `%PDF-1.4
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
<< /Length 120 >>
stream
BT
/F1 12 Tf
100 700 Td
(INTRODUCTION) Tj
ET
BT
/F1 12 Tf
100 680 Td
(Some body text here.) Tj
ET
BT
/F1 12 Tf
100 660 Td
(1. First Section) Tj
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
0000000486 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
575
%%EOF`;
    writeFileSync(filePath, pdfContent);

    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();

    const result = await manager.ingest(filePath);
    const headingBlocks = result.metadata.blocks.filter((b) => b.type === 'heading');
    expect(headingBlocks.length).toBeGreaterThanOrEqual(1);
  });

  it('returns error for encrypted PDF', async () => {
    const filePath = path.join(tmpDir, 'encrypted.pdf');
    // PDF with encryption dictionary
    const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
4 0 obj
<< /Filter /Standard /V 1 /R 2 /O <1234> /U <5678> /P -3904 >>
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000190 00000 n 
trailer
<< /Size 5 /Root 1 0 R /Encrypt 4 0 R >>
startxref
300
%%EOF`;
    writeFileSync(filePath, pdfContent);

    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();

    await expect(manager.ingest(filePath)).rejects.toThrow('Encrypted PDF');
  });

  it('returns error for image-only PDF (no text layer)', async () => {
    const filePath = path.join(tmpDir, 'imageonly.pdf');
    // Valid PDF structure but no text content
    const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 20 >>
stream
q 612 0 0 792 0 0 cm Q
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000220 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
340
%%EOF`;
    writeFileSync(filePath, pdfContent);

    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();

    await expect(manager.ingest(filePath)).rejects.toThrow('No text layer');
  });

  it('manifest has status: stable', () => {
    const { readFileSync } = require('fs');
    const manifest = JSON.parse(
      readFileSync(path.join(adaptersDir, 'pdf', 'manifest.json'), 'utf-8')
    );
    expect(manifest.status).toBe('stable');
  });
});
