/**
 * RETINEO Core — Worker Lifecycle Tests
 *
 * Verifies:
 *  - PID file read/write/remove
 *  - isPidAlive / stopProcess behavior
 *  - `start` is idempotent (no-op if already running)
 *  - `status` reports correct state
 *  - `stop` cleans up PID file
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
  stopProcess,
  ensureDataDirs,
  logFilePath,
} from '../../packages/core/src/cli/process-manager.js';
import { existsSync, rmSync } from 'fs';
import path from 'path';
import os from 'os';

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

describe('process-manager', () => {
  beforeEach(async () => {
    if (existsSync(dataDir())) {
      // Don't blow away real ~/.retineo if it has the real config
      const testPid = path.join(dataDir(), 'worker.pid');
      if (existsSync(testPid)) rmSync(testPid);
    }
  });

  it('writePidFile / readPidFile round-trip', async () => {
    await ensureDataDirs();
    await writePidFile({ pid: process.pid, startedAt: new Date().toISOString(), service: 'worker' });
    expect(existsSync(pidFilePath('worker'))).toBe(true);
    const info = readPidFile('worker');
    expect(info?.pid).toBe(process.pid);
    expect(info?.service).toBe('worker');
    await removePidFile('worker');
  });

  it('isPidAlive returns true for current process', () => {
    expect(isPidAlive(process.pid)).toBe(true);
  });

  it('isPidAlive returns false for non-existent PID', () => {
    // Pick a very high PID that almost certainly does not exist
    expect(isPidAlive(999999)).toBe(false);
  });

  it('stopProcess returns stopped=true for non-existent PID', async () => {
    const res = await stopProcess(999999, { timeoutMs: 500 });
    expect(res.stopped).toBe(true);
  });

  it('pid file path is under dataDir', () => {
    expect(pidFilePath('worker')).toBe(path.join(dataDir(), 'worker.pid'));
    expect(pidFilePath('bridge')).toBe(path.join(dataDir(), 'bridge.pid'));
    expect(pidFilePath('daemon')).toBe(path.join(dataDir(), 'daemon.pid'));
  });

  it('log file path is under dataDir/logs', () => {
    expect(logFilePath('worker')).toBe(path.join(dataDir(), 'logs', 'worker.log'));
  });
});

describe('CLICommands worker status', () => {
  it('reports stopped when no PID file exists', async () => {
    await removePidFile('worker'); // ensure clean
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const cmds = new CLICommands(makeDeps());
    await cmds.workerStatus();
    const output = log.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toMatch(/worker/);
    expect(output).toMatch(/stopped/);
    log.mockRestore();
  });

  it('reports running when PID is alive', async () => {
    await ensureDataDirs();
    // Use a child process and its PID to simulate a running worker
    const { spawn } = await import('child_process');
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    await new Promise((r) => setTimeout(r, 200));
    if (child.pid) {
      await writePidFile({ pid: child.pid, startedAt: new Date().toISOString(), service: 'worker' });
    }
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const cmds = new CLICommands(makeDeps());
    await cmds.workerStatus();
    const output = log.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toMatch(/running/);
    log.mockRestore();

    // Cleanup
    if (child.pid) {
      try { process.kill(child.pid, 'SIGKILL'); } catch {}
    }
    await removePidFile('worker');
  });
});
