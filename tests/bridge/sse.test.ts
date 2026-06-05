/**
 * ECHO Core — SSE Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyBridgeServer } from '../../packages/core/src/bridge/server.js';
import type { BridgeHandlersDeps } from '../../packages/core/src/bridge/handlers.js';

function makeDeps(): BridgeHandlersDeps {
  return {
    queryAnalyzer: { analyze: async () => { throw new Error('not implemented'); } } as any,
    retrievalService: { search: async () => { throw new Error('not implemented'); } } as any,
    contextAssembler: { assemble: async () => { throw new Error('not implemented'); } } as any,
    ingestionService: { ingestFile: async () => { throw new Error('not implemented'); } } as any,
    registry: { listSources: () => [], getPendingJobs: () => [] } as any,
    cas: { getObjectPath: () => '', exists: () => false } as any,
    configManager: { load: async () => ({} as any), save: async () => {} } as any,
    version: '0.1.0',
    indexDir: '/tmp/index',
  };
}

describe('SSE /v1/jobs/:id/events', () => {
  let server: FastifyBridgeServer;

  beforeAll(async () => {
    server = new FastifyBridgeServer({ port: 0, deps: makeDeps() });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it('streams events with text/event-stream header', async () => {
    const port = server.getPort();
    const res = await fetch(`http://127.0.0.1:${port}/v1/jobs/abc/events`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const text = await res.text();
    expect(text).toContain('event: progress');
    expect(text).toContain('event: complete');
  });
});
