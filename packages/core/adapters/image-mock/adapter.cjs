/**
 * ECHO Mock Image Adapter
 * Generates synthetic OCR text with bbox blocks
 * No segments — images are atomic
 * Deterministic: same filename → same output
 */

const readline = require('readline');
const fs = require('fs').promises;
const crypto = require('crypto');
const path = require('path');

const rl = readline.createInterface({ input: process.stdin });

const LOREM = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua Ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur Excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum';
const WORDS = LOREM.split(/\s+/);

const LABELS = [
  'Invoice',
  'Receipt',
  'Report',
  'Certificate',
  'Form',
  'Diagram',
  'Screenshot',
  'Photo',
];

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
      result = { adapterId: 'image-mock', version: '1.0.0' };
      break;
    case 'capabilities':
      result = { mimeTypes: ['image/png', 'image/jpeg'], extensions: ['.png', '.jpg', '.jpeg'] };
      break;
    case 'ingest':
      result = await ingestFile(req.params.uri);
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

function hashString(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function seededRandom(seedHex) {
  let seed = parseInt(seedHex.slice(0, 8), 16);
  return () => {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function generateLine(wordCount, rng) {
  const out = [];
  for (let i = 0; i < wordCount; i++) {
    out.push(WORDS[Math.floor(rng() * WORDS.length)]);
  }
  return out.join(' ');
}

async function ingestFile(uri) {
  const fileName = path.basename(uri);
  const seed = hashString(fileName);
  const rng = seededRandom(seed);

  // Mock dimensions derived from filename hash
  const width = 1024;
  const height = 768;

  const label = LABELS[Math.floor(rng() * LABELS.length)];
  const docId = Math.floor(rng() * 90000) + 10000;
  const dateStr = new Date().toISOString().split('T')[0];

  const lines = [
    `${label} #${docId}`,
    `Date: ${dateStr}`,
    `Total: $${(rng() * 1000).toFixed(2)}`,
    generateLine(6 + Math.floor(rng() * 6), rng),
    generateLine(4 + Math.floor(rng() * 8), rng),
  ];

  const blocks = [];
  let offset = 0;
  let y = 20;

  for (const line of lines) {
    const lineHeight = 24 + Math.floor(rng() * 12);
    const lineWidth = Math.min(width - 20, 100 + Math.floor(rng() * 400));
    const x = 10 + Math.floor(rng() * 20);

    const confidence = 0.85 + rng() * 0.14;

    blocks.push({
      type: 'ocr',
      offset,
      length: line.length,
      bbox: [x, y, lineWidth, lineHeight],
      confidence: Math.round(confidence * 100) / 100,
    });

    offset += line.length + 1;
    y += lineHeight + 8;
  }

  const content = lines.join('\n');

  return {
    content,
    metadata: { blocks },
  };
}
