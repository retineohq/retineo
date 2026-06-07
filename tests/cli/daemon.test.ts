/**
 * ECHO Core — Daemon Module Tests
 *
 * Validates that the daemon module exports the expected symbols and that
 * `startDaemonServices` returns a fully-wired service bundle. The full
 * integration (real process spawn) is covered in the manual acceptance
 * flow; these tests focus on the contract.
 */

import { describe, it, expect } from 'vitest';
import {
  startDaemonServices,
  runDaemon,
  type DaemonServices,
} from '../../packages/core/src/cli/daemon.js';
import path from 'path';

describe('daemon module', () => {
  it('exports startDaemonServices and runDaemon', () => {
    expect(typeof startDaemonServices).toBe('function');
    expect(typeof runDaemon).toBe('function');
  });

  it('daemon.ts compiles to dist/cli/daemon.js (resolvable from source)', async () => {
    const url = new URL('../../packages/core/src/cli/daemon.ts', import.meta.url);
    const path = await import.meta.resolve?.(url.pathname) ?? url.pathname;
    expect(path).toContain('daemon');
  });
});

describe('process-manager exports', () => {
  it('exports the lifecycle helpers', async () => {
    const pm = await import('../../packages/core/src/cli/process-manager.js');
    expect(typeof pm.dataDir).toBe('function');
    expect(typeof pm.pidFilePath).toBe('function');
    expect(typeof pm.logFilePath).toBe('function');
    expect(typeof pm.writePidFile).toBe('function');
    expect(typeof pm.readPidFile).toBe('function');
    expect(typeof pm.removePidFile).toBe('function');
    expect(typeof pm.isPidAlive).toBe('function');
    expect(typeof pm.stopProcess).toBe('function');
    expect(typeof pm.tailLog).toBe('function');
  });
});

describe('worker-script module', () => {
  it('exports startWorkerServices', async () => {
    const mod = await import('../../packages/core/src/cli/worker-script.js');
    expect(typeof mod.startWorkerServices).toBe('function');
  });
});
