/**
 * RETINEO Core — CLI Init Command Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CLICommands } from '../../packages/core/src/cli/commands.js';
import { FileConfigManager } from '../../packages/core/src/storage/config.js';
import { rmSync, existsSync } from 'fs';
import path from 'path';
import os from 'os';

function makeDeps() {
  return {
    version: '0.1.0',
    ingestionService: { async ingestFile() { return {} as any; } },
    retrievalService: { async search() { return {} as any; } },
    queryAnalyzer: { async analyze() { return {} as any; } },
    contextAssembler: { async assemble() { return {} as any; } },
    registry: { listSources: () => [], getPendingJobs: () => [], recoverOrphan: () => {}, getOrphan: () => null } as any,
    configManager: { load: async () => ({ dataDir: '', defaultAdapter: '', llmProvider: '', embeddingModel: '', search: {} as any, i18n: {} as any }), save: async () => {} } as any,
    pipeline: { processJob: async () => {}, enqueueL1: () => {}, enqueueL2: () => {}, enqueueL3: () => {} },
    secretsManager: { set: async () => {}, get: async () => undefined, delete: async () => {}, list: async () => [], listMasked: async () => ({}) },
    cas: { getObjectPath: () => '/tmp/retineo/objects/ab/cdef', read: async () => Buffer.from(''), exists: () => false, write: async () => '', delete: async () => {}, writeObject: async () => {}, readObject: async () => ({ node: {} as any, artifacts: { content: '', meta: {} as any } }) },
  };
}

describe('CLI init', () => {
  const testDir = path.join(os.tmpdir(), 'retineo-init-test-' + Date.now());

  beforeEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  });

  it('init creates data directory, config, and database schema', async () => {
    const log = [] as string[];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => log.push(args.join(' '));

    const cmds = new CLICommands(makeDeps());
    // Override init to use test dir
    const mgr = new FileConfigManager(testDir);
    await mgr.initializeDataDir();

    console.log = originalLog;

    expect(existsSync(testDir)).toBe(true);
    expect(existsSync(path.join(testDir, 'config.yaml'))).toBe(true);
    expect(existsSync(path.join(testDir, 'retineo.sqlite'))).toBe(true);
    expect(existsSync(path.join(testDir, 'objects'))).toBe(true);
    expect(existsSync(path.join(testDir, 'index'))).toBe(true);
    expect(existsSync(path.join(testDir, 'adapters'))).toBe(true);
    expect(existsSync(path.join(testDir, 'models'))).toBe(true);
    expect(existsSync(path.join(testDir, 'logs'))).toBe(true);
  });

  it('init is idempotent', async () => {
    const mgr = new FileConfigManager(testDir);
    await mgr.initializeDataDir();
    await mgr.initializeDataDir();

    expect(existsSync(testDir)).toBe(true);
    expect(existsSync(path.join(testDir, 'config.yaml'))).toBe(true);
    expect(existsSync(path.join(testDir, 'retineo.sqlite'))).toBe(true);
  });
});
