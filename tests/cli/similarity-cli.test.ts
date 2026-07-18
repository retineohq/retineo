/**
 * RETINEO Core — CLI similar command tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import os from 'os';
import { CLICommands } from '../../packages/core/src/cli/commands.js';
import type { CLICommandsDeps, SimilarityService } from '../../packages/core/src/cli/commands.js';

function makeDeps(dataDir: string, similarityService?: SimilarityService): CLICommandsDeps {
  return {
    version: '0.6.1',
    ingestionService: {
      async ingestFile() {
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
        dataDir,
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
    cas: {
      getObjectPath: () => path.join(dataDir, 'objects', 'ab', 'cdef'),
      read: async () => Buffer.from(''),
      exists: () => false,
      write: async () => '',
      delete: async () => {},
      writeObject: async () => '',
      readObject: async () => ({ node: {} as any, artifacts: { content: '', meta: {} as any } }),
    },
    similarityService,
  };
}

describe('CLI similar command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'retineo-similar-cli-'));
    process.exitCode = 0;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    process.exitCode = 0;
  });

  it('prints table output for similar documents', async () => {
    const indexDir = path.join(tmpDir, 'index');
    mkdirSync(indexDir, { recursive: true });
    writeFileSync(path.join(indexDir, 'embeddings.jsonl'), '{"hash":"a","vector":[1] }\n');

    const similarityService: SimilarityService = {
      async findSimilar() {
        return [
          {
            contentHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            sourcePath: '/docs/neighbor.md',
            similarity: 0.9123,
            matchedChunks: 2,
          },
        ];
      },
    };

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const cmds = new CLICommands(makeDeps(tmpDir, similarityService));
    await cmds.similar('queryhash');

    expect(process.exitCode).toBe(0);
    const output = log.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('contentHash');
    expect(output).toContain('similarity');
    expect(output).toContain('sourcePath');
    expect(output).toContain('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(output).toContain('0.9123');
    expect(output).toContain('/docs/neighbor.md');

    log.mockRestore();
  });

  it('prints raw JSON with --json', async () => {
    const indexDir = path.join(tmpDir, 'index');
    mkdirSync(indexDir, { recursive: true });
    writeFileSync(path.join(indexDir, 'embeddings.jsonl'), '{"hash":"a","vector":[1] }\n');

    const similarityService: SimilarityService = {
      async findSimilar() {
        return [
          {
            contentHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            sourcePath: '/docs/other.md',
            similarity: 0.85,
            matchedChunks: 1,
          },
        ];
      },
    };

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const cmds = new CLICommands(makeDeps(tmpDir, similarityService));
    await cmds.similar('queryhash', { json: true, topK: 3, threshold: 0.8 });

    expect(process.exitCode).toBe(0);
    const output = log.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      contentHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      sourcePath: '/docs/other.md',
      similarity: 0.85,
      matchedChunks: 1,
    });

    log.mockRestore();
  });

  it('reports empty index and advises ingest', async () => {
    // No embeddings.jsonl in tmpDir
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const similarityService: SimilarityService = {
      async findSimilar() {
        return [];
      },
    };

    const cmds = new CLICommands(makeDeps(tmpDir, similarityService));
    await cmds.similar('queryhash');

    expect(process.exitCode).toBe(1);
    expect(err).toHaveBeenCalledWith('Index is empty. Run `retineo ingest <path>` first.');
    expect(log).not.toHaveBeenCalled();

    err.mockRestore();
    log.mockRestore();
  });

  it('prints no results message for empty similar list', async () => {
    const indexDir = path.join(tmpDir, 'index');
    mkdirSync(indexDir, { recursive: true });
    writeFileSync(path.join(indexDir, 'embeddings.jsonl'), '{"hash":"a","vector":[1] }\n');

    const similarityService: SimilarityService = {
      async findSimilar() {
        return [];
      },
    };

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const cmds = new CLICommands(makeDeps(tmpDir, similarityService));
    await cmds.similar('unknownhash');

    expect(process.exitCode).toBe(0);
    expect(log).toHaveBeenCalledWith('No similar documents found.');

    log.mockRestore();
  });
});
