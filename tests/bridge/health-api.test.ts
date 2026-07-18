/**
 * Health API endpoint tests
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
      async syncDirectory(dirPath: string) {
        return { processed: 1, ghosts: 0, sourceId: `filesystem:${dirPath}` };
      },
      async syncSource() {
        return { processed: 0, ghosts: 0 };
      },
    } as any,
    registry: { listSources: () => [], getPendingJobs: () => [] } as any,
    cas: { getObjectPath: () => '', exists: () => false } as any,
    configManager: { load: async () => ({} as any), save: async () => {} } as any,
    auditService: { log: async () => {} } as any,
    healthAnalyzer: {
      async analyze() {
        return {
          score: 76,
          strong: ['good connectivity'],
          attention: [],
          recommendations: ['No action required'],
          advancedMetrics: [{ metric: 'fragmentation', availableIn: 'pro' }],
        };
      },
    },
    version: '0.1.0',
    indexDir: '/tmp/index',
  };
}

describe('Health API', () => {
  let server: FastifyBridgeServer;

  beforeAll(async () => {
    server = new FastifyBridgeServer({ port: 0, deps: makeDeps() });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it('POST /v1/health returns jobId', async () => {
    const port = server.getPort();
    const res = await fetch(`http://127.0.0.1:${port}/v1/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: '/tmp/test-vault' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobId).toBeDefined();
    expect(body.status).toBe('pending');
  });

  it('GET /v1/report/{jobId} returns report when completed', async () => {
    const port = server.getPort();
    const create = await fetch(`http://127.0.0.1:${port}/v1/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: '/tmp/test-vault' }),
    });
    const { jobId } = (await create.json()) as { jobId: string };

    // Give async handler time to finish
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const statusRes = await fetch(`http://127.0.0.1:${port}/v1/health/${jobId}`);
      const statusBody = await statusRes.json();
      if (statusBody.status === 'completed') break;
    }

    const reportRes = await fetch(`http://127.0.0.1:${port}/v1/report/${jobId}`);
    expect(reportRes.status).toBe(200);
    const reportBody = await reportRes.json();
    expect(reportBody.status).toBe('completed');
    expect(reportBody.report.score).toBe(76);
  });
});
