/**
 * Similarity MCP Tool Tests
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
    } as any,
    cas: {
      getObjectPath: (hash: string) => `/tmp/objects/${hash}`,
      exists: () => false,
    } as any,
    version: '0.1.0',
    similarityService: {
      async findSimilar(hash: string, options?: { topK?: number }) {
        return [
          {
            contentHash: 'neighbor-1',
            sourcePath: '/docs/neighbor-1.md',
            similarity: 0.91,
            matchedChunks: 2,
          },
        ].slice(0, options?.topK ?? 5);
      },
    },
  };
}

describe('retineo_find_similar', () => {
  it('returns parsed list of similar documents', async () => {
    const handlers = createHandlers(makeDeps());
    const res = await handlers.retineo_find_similar({ hash: 'doc-a', topK: 3 });
    expect(res.content.length).toBeGreaterThan(0);
    const text = (res.content[0] as { text: string }).text;
    const parsed = JSON.parse(text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].contentHash).toBe('neighbor-1');
  });

  it('returns error shape for missing hash', async () => {
    const handlers = createHandlers(makeDeps());
    const res = await handlers.retineo_find_similar({ hash: '' });
    expect((res as any).isError).toBe(true);
    expect((res.content[0] as { text: string }).text).toContain('hash is required');
  });
});
