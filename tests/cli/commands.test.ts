/**
 * ECHO Core — CLI Commands Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { CLICommands } from '../../packages/core/src/cli/commands.js';
import type { CLICommandsDeps } from '../../packages/core/src/cli/commands.js';

function makeDeps(): CLICommandsDeps {
  return {
    version: '0.1.0',
    ingestionService: {
      async ingestFile(filePath: string) {
        return {
          id: 'hash123',
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
      getJobsBySource: () => [],
      getJob: () => null,
      getJobCounts: () => ({ pending: 0, running: 0, completed: 0, failed: 0, dead: 0 }),
      getLastHeartbeat: () => null,
      getRunningWorkerIds: () => [],
      recoverOrphan: vi.fn(),
      getOrphan: () => null,
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
    pipeline: {
      processJob: async () => {},
      enqueueL1: () => {},
      enqueueL2: () => {},
      enqueueL3: () => {},
    },
  };
}

describe('CLICommands', () => {
  it('ingest prints sourceId', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const cmds = new CLICommands(makeDeps());
    await cmds.ingest('/tmp/test.txt');
    expect(log).toHaveBeenCalled();
    const output = log.mock.calls[0][0] as string;
    expect(output).toContain('Source registered');
    log.mockRestore();
  });

  it('status prints version', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const cmds = new CLICommands(makeDeps());
    await cmds.status();
    expect(log).toHaveBeenCalled();
    const output = log.mock.calls[0][0] as string;
    expect(output).toContain('ECHO Core 0.1.0');
    log.mockRestore();
  });

  it('config get prints value', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const cmds = new CLICommands(makeDeps());
    await cmds.config('search.defaultLanguage');
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it('recover calls registry.recoverOrphan', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const deps = makeDeps();
    const cmds = new CLICommands(deps);
    await cmds.recover('deadbeef');
    expect(deps.registry.recoverOrphan).toHaveBeenCalledWith('deadbeef');
    log.mockRestore();
  });
});
