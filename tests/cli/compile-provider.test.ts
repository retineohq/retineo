/**
 * CLI compile --provider tests
 */

import { describe, it, expect, vi } from 'vitest';
import { CLICommands } from '../../packages/core/src/cli/commands.js';
import type { CLICommandsDeps, CompileCLIOptions } from '../../packages/core/src/cli/commands.js';

function makeDeps(configOverride?: { llm?: { defaultProvider: string; providers: Array<{ id: string; type: string; model: string }> } }): CLICommandsDeps {
  const defaultConfig = {
    dataDir: '/tmp/retineo',
    defaultAdapter: 'file',
    llmProvider: 'ollama',
    embeddingModel: 'nomic-embed-text',
    llm: {
      defaultProvider: 'ollama',
      providers: [
        { id: 'ollama', type: 'ollama', model: 'test-model' },
        { id: 'mock', type: 'mock', model: 'mock-llm' },
      ],
    },
    embedding: {
      defaultProvider: 'ollama-embed',
      providers: [
        { id: 'ollama-embed', type: 'ollama', model: 'nomic-embed-text' },
      ],
    },
    search: {} as any,
    i18n: {} as any,
    logging: { level: 'info', console: true, file: false, filePath: '', pretty: false },
  };

  const config = configOverride
    ? { ...defaultConfig, llm: { ...defaultConfig.llm, ...configOverride.llm } }
    : defaultConfig;

  return {
    version: '0.1.0',
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
    retrievalService: {
      async search() {
        return { query: '', candidates: [], selected: [], citations: [], trace: { steps: [], durationMs: 0 } };
      },
    },
    queryAnalyzer: {
      async analyze(query: string) {
        return { originalQuery: query, language: 'en', confidence: 1, intent: 'vague' as const, enrichedQuery: query, entities: [], signals: [] };
      },
    },
    contextAssembler: {
      async assemble() {
        return { segments: [], totalTokens: 0, trace: { steps: [], budgetUsed: 0, budgetTotal: 0 }, citations: [], language: 'en' };
      },
    },
    registry: {
      listSources: () => [],
      getPendingJobs: () => [],
      getJobsBySource: () => [],
      getJob: () => null,
      getJobCounts: () => ({ pending: 0, running: 0, completed: 0, failed: 0, dead: 0 }),
      getLastHeartbeat: () => null,
      getRunningWorkerIds: () => [],
      recoverOrphan: vi.fn(),
      getOrphan: () => null,
    } as any,
    configManager: {
      load: async () => config,
      save: async () => {},
      getDataDir: () => config.dataDir,
      getConfigPath: () => '/tmp/retineo/config.yaml',
      configExists: () => true,
    } as any,
    pipeline: {
      processJob: async () => {},
      enqueueL1: () => {},
      enqueueL2: () => {},
      enqueueL3: () => {},
    },
    secretsManager: {
      set: async () => {},
      get: async () => undefined,
      delete: async () => {},
      list: async () => [],
      listMasked: async () => ({}),
    } as any,
    cas: { getObjectPath: () => '/tmp/retineo/objects/ab/cdef', read: async () => Buffer.from(''), exists: () => false, write: async () => '', delete: async () => {}, writeObject: async () => {}, readObject: async () => ({ node: {} as any, artifacts: { content: '', meta: {} as any } }) },
  };
}

describe('CLICommands.compile provider', () => {
  it('accepts valid --provider override', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const cmds = new CLICommands(makeDeps());
    await cmds.compile('/tmp/test.md', { provider: 'mock', watch: false });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Using LLM provider override: mock'));
    log.mockRestore();
  });

  it('rejects invalid --provider with error', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cmds = new CLICommands(makeDeps());
    await cmds.compile('/tmp/test.md', { provider: 'nonexistent', watch: false });
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining("Provider 'nonexistent' not found"));
    errorLog.mockRestore();
  });

  it('lists available providers on invalid --provider', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cmds = new CLICommands(makeDeps());
    await cmds.compile('/tmp/test.md', { provider: 'bad', watch: false });
    const msg = errorLog.mock.calls[0][0] as string;
    expect(msg).toContain('ollama');
    expect(msg).toContain('mock');
    errorLog.mockRestore();
  });
});
