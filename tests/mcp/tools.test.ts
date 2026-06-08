/**
 * ECHO Core — MCP Tools Tests
 */

import { describe, it, expect } from 'vitest';
import { createHandlers } from '../../packages/core/src/mcp/handlers.js';
import type { MCPHandlersDeps } from '../../packages/core/src/mcp/handlers.js';

function makeDeps(): MCPHandlersDeps {
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
            id: 'hash123',
            sourceRef: { protocol: 'file' as const, uri: filePath, mimeType: 'text/plain' },
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
    } as any,
    cas: {
      getObjectPath: (hash: string) => `/tmp/objects/${hash}`,
      exists: () => false,
    } as any,
    version: '0.1.0',
  };
}

describe('MCP tool handlers', () => {
  it('echo_search returns assembled context', async () => {
    const handlers = createHandlers(makeDeps());
    const res = await handlers.echo_search({ query: 'test' });
    expect(res.content.length).toBeGreaterThan(0);
    const text = (res.content[0] as { text: string }).text;
    expect(text).toContain('assembled');
  });

  it('echo_ingest returns sourceId', async () => {
    const handlers = createHandlers(makeDeps());
    const res = await handlers.echo_ingest({ sourcePath: '/tmp/test.txt' });
    expect(res.content.length).toBeGreaterThan(0);
    const text = (res.content[0] as { text: string }).text;
    expect(text).toContain('sourceId');
  });

  it('echo_status returns version', async () => {
    const handlers = createHandlers(makeDeps());
    const res = await handlers.echo_status();
    expect(res.content.length).toBeGreaterThan(0);
    const text = (res.content[0] as { text: string }).text;
    expect(text).toContain('0.1.0');
  });

  it('echo_get_node returns error for missing node', async () => {
    const handlers = createHandlers(makeDeps());
    const res = await handlers.echo_get_node({ hash: 'missing' });
    expect((res as any).isError).toBe(true);
  });
});
