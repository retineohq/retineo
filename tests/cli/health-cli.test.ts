/**
 * Health CLI command tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { CLICommands } from '../../packages/core/src/cli/commands.js';
import type { CLICommandsDeps } from '../../packages/core/src/cli/commands.js';

describe('CLI health command', () => {
  let exitCode: number | undefined;
  let logs: string[] = [];
  const testDir = '/tmp/test-vault';

  beforeEach(() => {
    exitCode = undefined;
    logs = [];
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
    vi.spyOn(console, 'log').mockImplementation((msg: string) => logs.push(msg));
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeDeps(): CLICommandsDeps {
    return {
      version: '0.1.0',
      ingestionService: {
        async syncDirectory(dirPath: string) {
          return { processed: 2, ghosts: 0, sourceId: `filesystem:${dirPath}` };
        },
      } as any,
      healthAnalyzer: {
        async analyze() {
          return {
            score: 76,
            strong: ['good connectivity'],
            attention: [],
            recommendations: ['No action required'],
            advancedMetrics: [{ metric: 'fragmentation', availableIn: 'pro' }],
          };
        },
      },
      retrievalService: { search: async () => ({ candidates: [], selected: [], citations: [], trace: { steps: [], durationMs: 0 } }) } as any,
      queryAnalyzer: { analyze: async (q: string) => ({ originalQuery: q, language: 'en', confidence: 1, intent: 'vague', enrichedQuery: q, entities: [], signals: [] }) } as any,
      contextAssembler: { assemble: async () => ({ segments: [], totalTokens: 0, trace: { steps: [], budgetUsed: 0, budgetTotal: 0 }, citations: [], language: 'en' }) } as any,
      registry: {
        getJobCounts: () => ({ pending: 0, running: 0, completed: 0, failed: 0, dead: 0 }),
      } as any,
      configManager: { load: async () => ({ dataDir: '', defaultAdapter: '', llmProvider: '', embeddingModel: '', search: {}, i18n: {} }) } as any,
      pipeline: { processJob: async () => {}, enqueueL1: () => {}, enqueueL2: () => {}, enqueueL3: () => {} } as any,
      secretsManager: { set: async () => {}, get: async () => undefined, delete: async () => {}, list: async () => [], listMasked: async () => ({}) } as any,
      cas: { getObjectPath: () => '', exists: () => false } as any,
      auditService: { log: vi.fn() },
    };
  }

  it('prints JSON report and exits 0 for score >= 50', async () => {
    const deps = makeDeps();
    const cmds = new CLICommands(deps);
    await cmds.health('/tmp/test-vault');

    expect(logs.some((l) => typeof l === 'string' && l.includes('"score": 76'))).toBe(true);
    expect(process.exitCode).toBe(0);
  });
});
