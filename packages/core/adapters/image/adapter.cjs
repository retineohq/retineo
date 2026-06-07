/**
 * ECHO Built-in Image OCR Adapter
 * Phase 6: Real OCR using tesseract.js
 */

const readline = require('readline');
const fs = require('fs').promises;
const path = require('path');

const rl = readline.createInterface({ input: process.stdin });

const SUPPORTED_MIMES = [
  'image/png',
  'image/jpeg',
  'image/tiff',
  'image/bmp',
  'image/webp',
];

const SUPPORTED_EXTS = ['.png', '.jpg', '.jpeg', '.tiff', '.bmp', '.webp'];

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
      result = { adapterId: 'image', version: '1.0.0' };
      break;
    case 'capabilities':
      result = { mimeTypes: SUPPORTED_MIMES, extensions: SUPPORTED_EXTS };
      break;
    case 'ingest':
      try {
        result = await ingestFile(req.params.uri, req.params.mimeType);
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

async function ingestFile(uri, mimeType) {
  const ext = path.extname(uri).toLowerCase();
  const detectedMime = mimeType || extToMime(ext);

  if (!detectedMime || !SUPPORTED_MIMES.includes(detectedMime)) {
    throw new Error(`Unsupported image format: ${detectedMime || ext}`);
  }

  try {
    await fs.access(uri);
  } catch {
    throw new Error('File not found');
  }

  const { createWorker } = require(require.resolve('tesseract.js', { paths: [process.cwd()] }));
  const worker = await createWorker('eng');

  let result;
  try {
    result = await worker.recognize(uri);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await worker.terminate();
    throw new Error(`OCR failed: ${msg}`);
  }

  await worker.terminate();

  const text = result.data.text || '';
  const words = result.data.words || [];

  if (!text.trim()) {
    return {
      content: '',
      metadata: { blocks: [] },
    };
  }

  const blocks = buildBlocks(text, words);

  return {
    content: text,
    metadata: { blocks },
  };
}

function extToMime(ext) {
  const map = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.tiff': 'image/tiff',
    '.bmp': 'image/bmp',
    '.webp': 'image/webp',
  };
  return map[ext] || null;
}

function buildBlocks(text, words) {
  const blocks = [];
  const lines = text.split('\n');
  let offset = 0;

  // Group words by line using y-coordinate proximity
  const wordGroups = groupWordsByLine(words);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineLength = line.length;
    const group = wordGroups[i] || [];

    if (group.length > 0) {
      const minX = Math.min(...group.map(w => w.bbox.x0));
      const minY = Math.min(...group.map(w => w.bbox.y0));
      const maxX = Math.max(...group.map(w => w.bbox.x1));
      const maxY = Math.max(...group.map(w => w.bbox.y1));
      const avgConfidence = group.reduce((s, w) => s + w.confidence, 0) / group.length;

      blocks.push({
        type: 'ocr',
        offset,
        length: lineLength,
        bbox: [minX, minY, maxX - minX, maxY - minY],
        confidence: Math.round((avgConfidence / 100) * 100) / 100,
      });
    }

    offset += lineLength + 1; // +1 for newline
  }

  return blocks;
}

function groupWordsByLine(words) {
  if (!words.length) return [];

  const sorted = [...words].sort((a, b) => a.bbox.y0 - b.bbox.y0);
  const groups = [];
  let current = [sorted[0]];
  let currentY = sorted[0].bbox.y0;

  for (let i = 1; i < sorted.length; i++) {
    const w = sorted[i];
    if (Math.abs(w.bbox.y0 - currentY) < 10) {
      current.push(w);
    } else {
      groups.push(current);
      current = [w];
      currentY = w.bbox.y0;
    }
  }
  groups.push(current);

  return groups;
}
