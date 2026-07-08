/**
 * RETINEO Core — Ingest Route Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyBridgeServer } from '../../packages/core/src/bridge/server.js';
import type { BridgeHandlersDeps } from '../../packages/core/src/bridge/handlers.js';

function makeDeps(): BridgeHandlersDeps {
  return {
    queryAnalyzer: { analyze: async () => { throw new Error('not implemented'); } } as any,
    retrievalService: { search: async () => { throw new Error('not implemented'); } } as any,
    contextAssembler: { assemble: async () => { throw new Error('not implemented'); } } as any,
    ingestionService: {
      async ingestFile() {
        return { contentHash: 'abc123', action: 'created' as const };
      },
    },
    registry: { listSources: () => [], getPendingJobs: () => [] } as any,
    cas: { getObjectPath: () => '', exists: () => false } as any,
    configManager: { load: async () => ({} as any), save: async () => {} } as any,
    auditService: { log: async () => {} } as any,
    version: '0.1.0',
    indexDir: '/tmp/index',
  };
}

describe('POST /v1/ingest', () => {
  let server: FastifyBridgeServer;

  beforeAll(async () => {
    server = new FastifyBridgeServer({ port: 0, deps: makeDeps() });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it('returns 400 for missing sourcePath', async () => {
    const port = server.getPort();
    const res = await fetch(`http://127.0.0.1:${port}/v1/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_REQUEST');
  });

  it('returns ingest response for valid path', async () => {
    const port = server.getPort();
    const res = await fetch(`http://127.0.0.1:${port}/v1/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourcePath: '/tmp/test.txt' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.contentHash).toBe('abc123');
    expect(body.action).toBe('created');
  });
});
