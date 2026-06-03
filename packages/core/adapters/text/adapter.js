/**
 * ECHO Built-in Text Adapter
 * Handles .txt files — reads UTF-8, returns NormalizedContent
 */

const readline = require('readline');
const fs = require('fs').promises;
const path = require('path');

const rl = readline.createInterface({ input: process.stdin });

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
      result = { adapterId: 'text', version: '1.0.0' };
      break;
    case 'capabilities':
      result = { mimeTypes: ['text/plain'], extensions: ['.txt'] };
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

async function ingestFile(uri) {
  const content = await fs.readFile(uri, 'utf-8');

  // Heuristic: split by blank lines for blocks
  const blocks = [];
  const lines = content.split('\n');
  let offset = 0;
  let inBlock = false;
  let blockStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().length === 0) {
      if (inBlock) {
        blocks.push({
          type: 'heading',
          offset: blockStart,
          length: offset - blockStart,
        });
        inBlock = false;
      }
    } else {
      if (!inBlock) {
        inBlock = true;
        blockStart = offset;
      }
    }
    offset += line.length + 1; // +1 for newline
  }

  if (inBlock) {
    blocks.push({
      type: 'heading',
      offset: blockStart,
      length: offset - blockStart,
    });
  }

  if (blocks.length === 0) {
    blocks.push({ type: 'heading', offset: 0, length: content.length });
  }

  return {
    content,
    metadata: { blocks },
  };
}
