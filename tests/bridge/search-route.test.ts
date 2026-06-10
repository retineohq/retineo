/**
 * RETINEO Core — Search Route Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyBridgeServer } from '../../packages/core/src/bridge/server.js';
import type { BridgeHandlersDeps } from '../../packages/core/src/bridge/handlers.js';

function makeDeps(): BridgeHandlersDeps {
  return {
    queryAnalyzer: {
      async analyze(query: string) {
        return {
          originalQuery: query,
          language: 'en',
          confidence: 1,
          intent: 'vague' as const,
          enrichedQuery: query,
          entities: [],
          signals: [],
        };
      },
    },
    retrievalService: {
      async search() {
        return {
          query: '',
          candidates: [],
          selected: [],
          citations: [],
          trace: { steps: [], durationMs: 12 },
        };
      },
    },
    contextAssembler: {
      async assemble() {
        return {
          segments: [],
          totalTokens: 0,
          trace: { steps: [], budgetUsed: 0, budgetTotal: 0 },
          citations: [],
          language: 'en',
        };
      },
    },
    ingestionService: { ingestFile: async () => { throw new Error('not implemented'); } } as any,
    registry: { listSources: () => [], getPendingJobs: () => [] } as any,
    cas: { getObjectPath: () => '', exists: () => false } as any,
    configManager: { load: async () => ({} as any), save: async () => {} } as any,
    version: '0.1.0',
    indexDir: '/tmp/index',
  };
}

describe('POST /v1/search', () => {
  let server: FastifyBridgeServer;

  beforeAll(async () => {
    server = new FastifyBridgeServer({ port: 0, deps: makeDeps() });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it('returns 400 for missing query', async () => {
    const port = server.getPort();
    const res = await fetch(`http://127.0.0.1:${port}/v1/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_REQUEST');
  });

  it('returns search response for valid query', async () => {
    const port = server.getPort();
    const res = await fetch(`http://127.0.0.1:${port}/v1/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'hello world' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.query).toBe('hello world');
    expect(body.language).toBe('en');
  });

  it('returns empty results gracefully', async () => {
    const port = server.getPort();
    const res = await fetch(`http://127.0.0.1:${port}/v1/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'xyz' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results.selected).toEqual([]);
  });
});
