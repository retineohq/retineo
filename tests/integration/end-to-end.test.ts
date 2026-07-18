/**
 * RETINEO Core — End-to-End Integration Test
 * Phase 5: CLI ingest → HTTP search → MCP status
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyBridgeServer } from '../../packages/core/src/bridge/server.js';
import { createHandlers } from '../../packages/core/src/mcp/handlers.js';
import type { BridgeHandlersDeps } from '../../packages/core/src/bridge/handlers.js';
import type { MCPHandlersDeps } from '../../packages/core/src/mcp/handlers.js';

function makeSharedDeps(): BridgeHandlersDeps & MCPHandlersDeps {
  const sources: Array<{ id: string; uri: string }> = [];
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
        const id = `source-${sources.length}`;
        sources.push({ id, uri: filePath });
        return {
          node: {
            id: 'hash123',
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
      listSources: () => sources.map((s) => ({ id: s.id, protocol: 'file', uri: s.uri, sourcePath: s.uri, mimeType: 'text/plain', adapterId: 'text', rawHash: 'mock', rootHash: 'mock', lastSeenAt: new Date().toISOString() })),
      getPendingJobs: () => [],
    } as any,
    cas: { getObjectPath: () => '', exists: () => false } as any,
    configManager: { load: async () => ({} as any), save: async () => {} } as any,
    auditService: { log: async () => {} } as any,
    version: '0.1.0',
    indexDir: '/tmp/index',
  };
}

describe('End-to-end: ingest → search → status', () => {
  let server: FastifyBridgeServer;
  const deps = makeSharedDeps();

  beforeAll(async () => {
    server = new FastifyBridgeServer({ port: 0, deps });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it('HTTP search works after ingestion', async () => {
    await deps.ingestionService.ingestFile('/tmp/e2e.txt');
    const port = server.getPort();
    const res = await fetch(`http://127.0.0.1:${port}/v1/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'integration test' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.query).toBe('integration test');
  });

  it('MCP status reflects ingested source', async () => {
    const handlers = createHandlers(deps);
    const res = await handlers.retineo_status();
    expect(res.content.length).toBeGreaterThan(0);
    const text = (res.content[0] as { text: string }).text;
    const parsed = JSON.parse(text);
    expect(parsed.sourceCount).toBeGreaterThan(0);
  });
});
