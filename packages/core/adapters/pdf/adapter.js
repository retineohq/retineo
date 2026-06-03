/**
 * ECHO Built-in PDF Adapter (Placeholder)
 * Handles .pdf files — returns UNSUPPORTED_MIME error for MVP
 */

const readline = require('readline');

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
      result = { adapterId: 'pdf', version: '1.0.0' };
      break;
    case 'capabilities':
      result = { mimeTypes: ['application/pdf'], extensions: ['.pdf'] };
      break;
    case 'ingest':
      console.log(JSON.stringify({
        jsonrpc: '2.0',
        id: req.id,
        error: { code: 1001, message: 'PDF ingestion not implemented in MVP' }
      }));
      return;
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
