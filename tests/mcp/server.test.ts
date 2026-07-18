/**
 * RETINEO Core — MCP Server Tests
 */

import { describe, it, expect } from 'vitest';
import { RetineoMCPServer } from '../../packages/core/src/mcp/server.js';
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
  };
}

describe('RetineoMCPServer', () => {
  it('constructs without error', () => {
    const server = new RetineoMCPServer({ deps: makeDeps() });
    expect(server).toBeDefined();
  });
});
