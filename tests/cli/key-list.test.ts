/**
 * RETINEO Core — CLI Key List Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { CLICommands } from '../../packages/core/src/cli/commands.js';

function makeDeps(masked: Record<string, string> = {}) {
  return {
    version: '0.1.0',
    ingestionService: { async ingestFile() { return {} as any; } },
    retrievalService: { async search() { return {} as any; } },
    queryAnalyzer: { async analyze() { return {} as any; } },
    contextAssembler: { async assemble() { return {} as any; } },
    registry: { listSources: () => [], getPendingJobs: () => [], recoverOrphan: () => {}, getOrphan: () => null } as any,
    configManager: { load: async () => ({ dataDir: '', defaultAdapter: '', llmProvider: '', embeddingModel: '', search: {} as any, i18n: {} as any }), save: async () => {} } as any,
    pipeline: { processJob: async () => {}, enqueueL1: () => {}, enqueueL2: () => {}, enqueueL3: () => {} },
    cas: { getObjectPath: () => '/tmp/retineo/objects/ab/cdef', read: async () => Buffer.from(''), exists: () => false, write: async () => '', delete: async () => {}, writeObject: async () => {}, readObject: async () => ({ node: {} as any, artifacts: { content: '', meta: {} as any } }) },
    secretsManager: {
      set: async () => {},
      get: async () => undefined,
      delete: async () => {},
      list: async () => Object.keys(masked),
      listMasked: async () => masked,
    },
  };
}

describe('CLI key list', () => {
  it('shows no keys when empty', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const cmds = new CLICommands(makeDeps());
    await cmds.keyList();
    expect(log).toHaveBeenCalledWith('No keys stored');
    log.mockRestore();
  });

  it('shows masked keys', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const cmds = new CLICommands(makeDeps({ openai: 'sk...cdef' }));
    await cmds.keyList();
    expect(log).toHaveBeenCalledWith('openai: sk...cdef');
    log.mockRestore();
  });
});
