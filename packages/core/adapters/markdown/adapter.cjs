/**
 * ECHO Built-in Markdown Adapter
 * Handles .md files — reads UTF-8, parses headings into blocks
 */

const readline = require('readline');
const fs = require('fs').promises;

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
      result = { adapterId: 'markdown', version: '1.0.0' };
      break;
    case 'capabilities':
      result = { mimeTypes: ['text/markdown'], extensions: ['.md'] };
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

  // Parse headings: lines starting with #
  const blocks = [];
  const lines = content.split('\n');
  let offset = 0;

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.*)$/);
    if (match) {
      blocks.push({
        type: 'heading',
        offset,
        length: line.length,
      });
    }
    offset += line.length + 1; // +1 for newline
  }

  if (blocks.length === 0) {
    blocks.push({ type: 'heading', offset: 0, length: content.length });
  }

  return {
    content,
    metadata: { blocks },
  };
}
