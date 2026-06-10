/**
 * Adapter Transport Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import os from 'os';
import { LineDelimitedJSONTransport } from '../../packages/core/src/adapters/transport.js';
import type { JSONRPCRequest } from '../../packages/core/src/adapters/protocol.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'retineo-transport-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeRetineoAdapter(responseDelay = 0): string {
  const script = `
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const req = JSON.parse(line);
  let result;
  switch (req.method) {
    case 'initialize': result = { adapterId: 'retineo', version: '1.0.0' }; break;
    case 'retineo': result = req.params; break;
    case 'error':
      console.log(JSON.stringify({ jsonrpc: '2.0', id: req.id, error: { code: 5000, message: 'boom' } }));
      return;
    case 'slow':
      setTimeout(() => {
        console.log(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: 'done' }));
      }, ${responseDelay});
      return;
    case 'shutdown': process.exit(0); break;
    default: result = null;
  }
  console.log(JSON.stringify({ jsonrpc: '2.0', id: req.id, result }));
});
`;
  const p = path.join(tmpDir, 'retineo-adapter.cjs');
  writeFileSync(p, script);
  return p;
}

describe('LineDelimitedJSONTransport', () => {
  it('sends request and receives response', async () => {
    const adapterPath = makeRetineoAdapter();
    const transport = new LineDelimitedJSONTransport(adapterPath);

    const req: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'retineo',
      params: { hello: 'world' },
    };

    const res = await transport.send(req);
    expect(res.jsonrpc).toBe('2.0');
    expect(res.id).toBe(1);
    expect(res.result).toEqual({ hello: 'world' });
    expect(res.error).toBeUndefined();

    await transport.close();
  });

  it('handles JSON-RPC error responses', async () => {
    const adapterPath = makeRetineoAdapter();
    const transport = new LineDelimitedJSONTransport(adapterPath);

    const req: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'error',
    };

    await expect(transport.send(req)).rejects.toThrow('JSON-RPC error 5000: boom');
    await transport.close();
  });

  it('times out on slow responses', async () => {
    const adapterPath = makeRetineoAdapter(100);
    const transport = new LineDelimitedJSONTransport(adapterPath, 10);

    const req: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: 3,
      method: 'slow',
    };

    await expect(transport.send(req)).rejects.toThrow('timeout');
    await transport.close();
  });

  it('rejects pending on process exit', async () => {
    const script = `
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', () => process.exit(1));
`;
    const adapterPath = path.join(tmpDir, 'exit-adapter.cjs');
    writeFileSync(adapterPath, script);

    const transport = new LineDelimitedJSONTransport(adapterPath);

    const req: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: 4,
      method: 'anything',
    };

    const promise = transport.send(req).catch((err) => err);
    // Give process time to start and receive line
    await new Promise((r) => setTimeout(r, 100));

    const err = await promise;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('exited unexpectedly');
    await transport.close().catch(() => {});
  });

  it('calls onExit handler when process exits', async () => {
    const script = `
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', () => process.exit(2));
`;
    const adapterPath = path.join(tmpDir, 'exit2-adapter.cjs');
    writeFileSync(adapterPath, script);

    const transport = new LineDelimitedJSONTransport(adapterPath);
    let exitCode = -999;
    transport.onExit((code) => { exitCode = code; });

    transport.send({ jsonrpc: '2.0', id: 5, method: 'x' }).catch(() => {});
    await new Promise((r) => setTimeout(r, 150));

    expect(exitCode).toBe(2);
    await transport.close().catch(() => {});
  });

  it('auto-assigns id if missing', async () => {
    const adapterPath = makeRetineoAdapter();
    const transport = new LineDelimitedJSONTransport(adapterPath);

    const req: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: undefined as any,
      method: 'retineo',
      params: { test: true },
    };

    const res = await transport.send(req);
    expect(res.id).toBeDefined();
    expect(res.result).toEqual({ test: true });
    await transport.close();
  });

  it('closes gracefully', async () => {
    const adapterPath = makeRetineoAdapter();
    const transport = new LineDelimitedJSONTransport(adapterPath);
    await transport.close();
    // Should not throw on second close
    await transport.close();
  });
});
