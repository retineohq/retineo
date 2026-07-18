/**
 * RETINEO Core — CLI Commands Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { CLICommands } from '../../packages/core/src/cli/commands.js';
import type { CLICommandsDeps } from '../../packages/core/src/cli/commands.js';

function makeDeps(): CLICommandsDeps {
  return {
    version: '0.1.0',
    ingestionService: {
      async ingestFile(filePath: string) {
        return { contentHash: 'hash123', action: 'created' as const };
      },
      async syncSource(sourceId: string) {
        return { processed: 0, ghosts: 0, sourceId };
      },
      async syncDirectory(dirPath: string) {
        return { processed: 0, ghosts: 0, sourceId: `filesystem:${dirPath}` };
      },
      registerAdapter: vi.fn(),
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
      listByContentHash: () => [],
      get: () => null,
      getPendingJobs: () => [],
      getJobsBySource: () => [],
      getJob: () => null,
      getJobCounts: () => ({ pending: 0, running: 0, completed: 0, failed: 0, dead: 0 }),
      getLastHeartbeat: () => null,
      getRunningWorkerIds: () => [],
      recoverOrphan: vi.fn(),
      updateSource: vi.fn(),
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
    auditService: { log: vi.fn() },
    cas: { getObjectPath: () => '/tmp/retineo/objects/ab/cdef', read: async () => Buffer.from(''), exists: () => false, write: async () => '', delete: async () => {}, writeObject: async () => {}, readObject: async () => ({ node: {} as any, artifacts: { content: '', meta: {} as any } }) },
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
    expect(output).toContain('RETINEO Core 0.1.0');
    log.mockRestore();
  });

  it('config get prints value', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const cmds = new CLICommands(makeDeps());
    await cmds.configGet('search.defaultLanguage');
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it('recover prints not found when hash missing', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const deps = makeDeps();
    const cmds = new CLICommands(deps);
    await cmds.recover('deadbeef');
    expect(log).toHaveBeenCalledWith('Recover failed: deadbeef — not found in registry');
    log.mockRestore();
  });

  it('rebuild syncs filesystem sources and deletes index', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const deps = makeDeps();
    deps.configManager.load = async () => ({
      dataDir: '/tmp/retineo-rebuild-test',
      defaultAdapter: '',
      llmProvider: '',
      embeddingModel: '',
      search: {} as any,
      i18n: {} as any,
    });
    const syncSource = vi.fn(async () => ({ processed: 1, ghosts: 0 }));
    deps.ingestionService.syncSource = syncSource;
    deps.registry.listSources = () => [
      {
        sourceId: 'filesystem:/tmp',
        externalId: '/tmp/a.md',
        contentHash: 'hash1',
        etag: 'etag',
        status: 'active',
        deletedAt: null,
        lastSeenAt: Date.now(),
      },
    ];

    const cmds = new CLICommands(deps);
    await cmds.rebuild({});
    expect(syncSource).toHaveBeenCalledWith('filesystem:/tmp');
    const output = log.mock.calls.find((c) => typeof c[0] === 'string' && c[0].includes('Rebuilt'))?.[0] as string;
    expect(output).toContain('Rebuilt 1 source(s)');
    log.mockRestore();
  });

  it('recover marks source active and logs audit', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256').update('hello world').digest('hex');
    const tmpFile = '/tmp/retineo-recover-test-' + Date.now() + '.md';

    const deps = makeDeps();
    deps.registry.listByContentHash = () => [{
      sourceId: 'src1',
      externalId: tmpFile,
      contentHash: hash,
      etag: 'etag',
      status: 'ghost',
      deletedAt: Date.now(),
      lastSeenAt: Date.now(),
    }];
    deps.registry.recoverOrphan = vi.fn();
    deps.registry.updateSource = vi.fn();

    const cmds = new CLICommands(deps);
    await cmds.recover(hash);
    expect(deps.registry.updateSource).toHaveBeenCalledWith('src1', tmpFile, { status: 'active', deletedAt: null });
    expect(log).toHaveBeenCalledWith(`Recovered: ${hash} → src1:${tmpFile}`);

    log.mockRestore();
  });
});
