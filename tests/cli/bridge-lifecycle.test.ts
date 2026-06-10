/**
 * RETINEO Core — Bridge Lifecycle Tests
 *
 * Verifies the bridge command paths are wired through the same process manager.
 * Bridge is just another service that uses PID files — these tests cover
 * the status/logs paths and the no-op behaviour when nothing is running.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CLICommands } from '../../packages/core/src/cli/commands.js';
import {
  dataDir,
  pidFilePath,
  writePidFile,
  removePidFile,
  readPidFile,
  isPidAlive,
} from '../../packages/core/src/cli/process-manager.js';
import { existsSync, rmSync } from 'fs';
import path from 'path';

function makeDeps() {
  return {
    version: '0.1.0',
    ingestionService: { async ingestFile() { return {} as any; } },
    retrievalService: { async search() { return {} as any; } },
    queryAnalyzer: { async analyze() { return {} as any; } },
    contextAssembler: { async assemble() { return {} as any; } },
    registry: {
      listSources: () => [],
      getPendingJobs: () => [],
      getJobsBySource: () => [],
      getJob: () => null,
      getJobCounts: () => ({ pending: 0, running: 0, completed: 0, failed: 0, dead: 0 }),
      getLastHeartbeat: () => null,
      getRunningWorkerIds: () => [],
      recoverOrphan: () => {},
      getOrphan: () => null,
    } as any,
    configManager: { load: async () => ({ dataDir: dataDir() }), save: async () => {} } as any,
    pipeline: { processJob: async () => {}, enqueueL1: () => {}, enqueueL2: () => {}, enqueueL3: () => {} },
    secretsManager: { set: async () => {}, get: async () => undefined, delete: async () => {}, list: async () => [], listMasked: async () => ({}) },
    cas: { getObjectPath: () => '/tmp/retineo/objects/ab/cdef', read: async () => Buffer.from(''), exists: () => false, write: async () => '', delete: async () => {}, writeObject: async () => {}, readObject: async () => ({ node: {} as any, artifacts: { content: '', meta: {} as any } }) },
  };
}

describe('bridge lifecycle', () => {
  beforeEach(() => {
    if (existsSync(pidFilePath('bridge'))) rmSync(pidFilePath('bridge'));
  });

  afterEach(() => {
    if (existsSync(pidFilePath('bridge'))) rmSync(pidFilePath('bridge'));
  });

  it('status reports stopped when no PID file', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const cmds = new CLICommands(makeDeps());
    await cmds.bridgeStatus();
    const output = log.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toMatch(/bridge/);
    expect(output).toMatch(/stopped/);
    log.mockRestore();
  });

  it('stop is a no-op when no PID file exists', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const cmds = new CLICommands(makeDeps());
    await cmds.bridgeStop();
    const output = log.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toMatch(/not running/);
    log.mockRestore();
  });

  it('status reports running when PID is alive', async () => {
    const { spawn } = await import('child_process');
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    await new Promise((r) => setTimeout(r, 200));
    if (child.pid) {
      await writePidFile({ pid: child.pid, startedAt: new Date().toISOString(), service: 'bridge' });
    }
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const cmds = new CLICommands(makeDeps());
    await cmds.bridgeStatus();
    const output = log.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toMatch(/running/);
    log.mockRestore();

    if (child.pid) {
      try { process.kill(child.pid, 'SIGKILL'); } catch {}
    }
  });

  it('logs command handles missing log file gracefully', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const cmds = new CLICommands(makeDeps());
    await cmds.bridgeLogs({ lines: 10 });
    const output = log.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toMatch(/no log file/);
    log.mockRestore();
  });
});
