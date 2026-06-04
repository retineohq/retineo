#!/usr/bin/env node
import { createCLI } from '../packages/core/src/cli/index.js';

// MVP: wire with mock deps for standalone execution
// Real deployments should inject actual services via a bootstrap module

const mockDeps = {
  version: '0.1.0',
  ingestionService: {
    async ingestFile(filePath: string) {
      return {
        id: 'mock-hash',
        sourceRef: { protocol: 'file' as const, uri: filePath, mimeType: 'text/plain' },
        childrenIds: [],
        depth: 0,
        artifacts: {},
        build: { schemaVersion: 1, nodeVersion: 1, rawHash: 'mock', contentHash: 'mock', generators: { l1: { id: '', version: '' }, l2: { id: '', version: '' }, embedding: { id: '', version: '' } }, buildTimestamp: new Date().toISOString() },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
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
  registry: {
    listSources: () => [],
    getPendingJobs: () => [],
    recoverOrphan: () => {},
    getOrphan: () => null,
    getSource: () => null,
  },
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
  },
  pipeline: {
    processJob: async () => {},
    enqueueL1: () => {},
    enqueueL2: () => {},
    enqueueL3: () => {},
  },
};

const program = createCLI(mockDeps as any);
program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
