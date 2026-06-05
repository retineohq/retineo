/**
 * Shutdown Manager Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DefaultShutdownManager, installSignalHandlers } from '../../packages/core/src/utils/shutdown.js';
import { createLogger } from '../../packages/core/src/utils/logger.js';

describe('DefaultShutdownManager', () => {
  it('registers and runs handlers in order', async () => {
    const order: number[] = [];
    const logger = createLogger({ level: 'silent' });
    const mgr = new DefaultShutdownManager({ logger });

    mgr.register(async () => { order.push(1); });
    mgr.register(async () => { order.push(2); });

    // Override exit to avoid killing test process
    const originalExit = process.exit;
    let exitCode: number | undefined;
    (process as any).exit = (code: number) => { exitCode = code; };

    await mgr.initiate('SIGTERM');

    expect(order).toEqual([1, 2]);
    expect(exitCode).toBe(0);

    (process as any).exit = originalExit;
  });

  it('sets shuttingDown flag', () => {
    const logger = createLogger({ level: 'silent' });
    const mgr = new DefaultShutdownManager({ logger });
    expect(mgr.isShuttingDown()).toBe(false);

    const originalExit = process.exit;
    (process as any).exit = () => {};
    mgr.initiate('SIGTERM').catch(() => {});
    expect(mgr.isShuttingDown()).toBe(true);
    (process as any).exit = originalExit;
  });

  it('continues on handler failure with exit code 1', async () => {
    const order: number[] = [];
    const logger = createLogger({ level: 'silent' });
    const mgr = new DefaultShutdownManager({ logger, timeoutMs: 100 });

    mgr.register(async () => { throw new Error('fail'); });
    mgr.register(async () => { order.push(2); });

    const originalExit = process.exit;
    let exitCode: number | undefined;
    (process as any).exit = (code: number) => { exitCode = code; };

    await mgr.initiate('SIGTERM');

    expect(order).toEqual([2]);
    expect(exitCode).toBe(1);

    (process as any).exit = originalExit;
  });

  it('times out slow handlers', async () => {
    const logger = createLogger({ level: 'silent' });
    const mgr = new DefaultShutdownManager({ logger, timeoutMs: 50 });

    mgr.register(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    const originalExit = process.exit;
    let exitCode: number | undefined;
    (process as any).exit = (code: number) => { exitCode = code; };

    await mgr.initiate('SIGTERM');

    expect(exitCode).toBe(1);

    (process as any).exit = originalExit;
  });
});

describe('installSignalHandlers', () => {
  it('installs SIGTERM and SIGINT listeners', () => {
    const logger = createLogger({ level: 'silent' });
    const mgr = new DefaultShutdownManager({ logger });

    const beforeTerm = process.listenerCount('SIGTERM');
    const beforeInt = process.listenerCount('SIGINT');

    installSignalHandlers(mgr);

    expect(process.listenerCount('SIGTERM')).toBe(beforeTerm + 1);
    expect(process.listenerCount('SIGINT')).toBe(beforeInt + 1);
  });
});
