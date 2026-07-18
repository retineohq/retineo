/**
 * RETINEO Core — Bridge Server Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyBridgeServer } from '../../packages/core/src/bridge/server.js';
import type { BridgeHandlersDeps } from '../../packages/core/src/bridge/handlers.js';

function makeMockDeps(): BridgeHandlersDeps {
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
          trace: { steps: [], durationMs: 0 },
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
    ingestionService: {
      async ingestFile(filePath: string) {
        return {
          node: {
            id: 'mock-hash',
            sourceRef: { protocol: 'file' as const, uri: filePath, mimeType: 'text/plain' },
            sourcePath: filePath,
            childrenIds: [],
            depth: 0,
            artifacts: {},
            build: { schemaVersion: 1, nodeVersion: 1, rawHash: 'mock', contentHash: 'mock', generators: { l1: { id: '', version: '' }, l2: { id: '', version: '' }, embedding: { id: '', version: '' } }, buildTimestamp: new Date().toISOString() },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        };
      },
    },
    registry: {
      listSources: () => [],
      getPendingJobs: () => [],
      recoverOrphan: () => {},
      getOrphan: () => null,
      getSource: () => null,
      insertSource: () => {},
      insertSegment: () => {},
      insertJob: () => {},
    } as any,
    cas: {
      getObjectPath: (hash: string) => `/tmp/objects/${hash}`,
      exists: () => false,
    } as any,
    configManager: {
      load: async () => ({
        dataDir: '',
        defaultAdapter: '',
        llmProvider: '',
        embeddingModel: '',
        search: {} as any,
        i18n: {} as any,
      }),
      save: async () => {},
    } as any,
    version: '0.1.0',
    indexDir: '/tmp/index',
  };
}

describe('FastifyBridgeServer', () => {
  let server: FastifyBridgeServer;

  beforeAll(async () => {
    server = new FastifyBridgeServer({ port: 0, deps: makeMockDeps() });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it('starts and returns a port', () => {
    const port = server.getPort();
    expect(port).toBeGreaterThan(0);
  });

  it('registers routes and responds to GET /v1/status', async () => {
    const port = server.getPort();
    const res = await fetch(`http://127.0.0.1:${port}/v1/status`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.version).toBe('0.1.0');
  });
});
