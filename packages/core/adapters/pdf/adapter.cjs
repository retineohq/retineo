/**
 * ECHO Built-in PDF Adapter
 * Phase 6: Real PDF text extraction using pdfjs-dist
 */

const readline = require('readline');
const fs = require('fs').promises;
const path = require('path');

const rl = readline.createInterface({ input: process.stdin });

const HEADING_RE = /^(?:[A-Z][A-Z\s]{3,}[A-Z]$|\d+(?:\.\d+)*\.?\s+\S.*|Chapter\s+\d+[:.]?\s*.*)/;

rl.on('line', async (line) => {
  let req;
  try {
    req = JSON.parse(line);
  } catch {
    console.log(JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: { code: 2000, message: 'Parse error' }
    }));
    return;
  }

  let result;
  switch (req.method) {
    case 'initialize':
      result = { adapterId: 'pdf', version: '1.0.0' };
      break;
    case 'capabilities':
      result = { mimeTypes: ['application/pdf'], extensions: ['.pdf'] };
      break;
    case 'ingest':
      try {
        result = await ingestFile(req.params.uri);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(JSON.stringify({
          jsonrpc: '2.0',
          id: req.id,
          error: { code: 5000, message: msg }
        }));
        return;
      }
      break;
    case 'shutdown':
      rl.close();
      process.exit(0);
      break;
    default:
      console.log(JSON.stringify({
        jsonrpc: '2.0',
        id: req.id,
        error: { code: 1000, message: `Method not found: ${req.method}` }
      }));
      return;
  }

  console.log(JSON.stringify({ jsonrpc: '2.0', id: req.id, result }));
});

async function ingestFile(uri) {
  const pdfjsLib = require(require.resolve('pdfjs-dist/legacy/build/pdf.mjs', { paths: [process.cwd()] }));
  const buffer = await fs.readFile(uri);
  const data = new Uint8Array(buffer);

  let pdfDocument;
  try {
    const loadingTask = pdfjsLib.getDocument({ data });
    pdfDocument = await loadingTask.promise;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('password') || msg.includes('Encrypted') || msg.includes('No password')) {
      throw new Error('Encrypted PDF');
    }
    throw new Error(`Parse error: ${msg}`);
  }
  const numpages = pdfDocument.numPages;

  const pageTexts = [];
  for (let i = 1; i <= numpages; i++) {
    const page = await pdfDocument.getPage(i);
    const textContent = await page.getTextContent();
    const lines = [];
    let currentLine = '';
    for (const item of textContent.items) {
      currentLine += item.str;
      if (item.hasEOL) {
        lines.push(currentLine);
        currentLine = '';
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
    pageTexts.push(lines.join('\n'));
    page.cleanup();
  }

  const rawText = pageTexts.join('\n');
  const text = normalizeText(rawText);

  if (!text.trim()) {
    throw new Error('No text layer found');
  }

  const blocks = detectHeadings(text);

  // Segment large PDFs (>50 pages or >100KB text)
  let segments = undefined;
  if (numpages > 50 || text.length > 100 * 1024) {
    segments = segmentByPages(text, numpages, blocks);
  }

  return {
    content: text,
    metadata: { blocks, numpages },
    segments,
  };
}

function normalizeText(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function detectHeadings(text) {
  const blocks = [];
  const lines = text.split('\n');
  let offset = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (HEADING_RE.test(trimmed)) {
      blocks.push({
        type: 'heading',
        offset,
        length: line.length,
      });
    }
    offset += line.length + 1; // +1 for newline
  }

  return blocks;
}

function segmentByPages(text, numpages, blocks) {
  const lines = text.split('\n');
  const linesPerPage = Math.max(1, Math.ceil(lines.length / numpages));
  const segments = [];

  for (let p = 0; p < numpages; p++) {
    const startLine = p * linesPerPage;
    const endLine = Math.min((p + 1) * linesPerPage, lines.length);
    const pageLines = lines.slice(startLine, endLine);
    const content = pageLines.join('\n');
    const spanStart = lines.slice(0, startLine).reduce((sum, l) => sum + l.length + 1, 0);
    const spanEnd = spanStart + content.length;

    const pageBlocks = blocks
      .filter(b => b.offset >= spanStart && b.offset < spanEnd)
      .map(b => ({ ...b, offset: b.offset - spanStart }));

    segments.push({
      spanStart,
      spanEnd,
      content,
      metadata: { blocks: pageBlocks },
    });
  }

  return segments;
}
