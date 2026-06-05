/**
 * ECHO Core — Graceful Shutdown Manager
 * Phase 6: SIGTERM/SIGINT handling with 12-step clean shutdown
 */

import type { Logger } from './logger.js';

export type ShutdownHandler = (signal: string) => Promise<void>;

export interface ShutdownManager {
  register(handler: ShutdownHandler): void;
  initiate(signal: string): Promise<void>;
  isShuttingDown(): boolean;
}

export interface ShutdownManagerDeps {
  logger: Logger;
  timeoutMs?: number;
}

export class DefaultShutdownManager implements ShutdownManager {
  private handlers: ShutdownHandler[] = [];
  private shuttingDown = false;
  private logger: Logger;
  private timeoutMs: number;

  constructor(deps: ShutdownManagerDeps) {
    this.logger = deps.logger;
    this.timeoutMs = deps.timeoutMs ?? 30000;
  }

  register(handler: ShutdownHandler): void {
    this.handlers.push(handler);
  }

  isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  async initiate(signal: string): Promise<void> {
    if (this.shuttingDown) {
      this.logger.warn('shutdown.duplicate', { signal });
      return;
    }
    this.shuttingDown = true;
    this.logger.info('shutdown.initiate', { signal });

    let exitCode = 0;

    for (let i = 0; i < this.handlers.length; i++) {
      const handler = this.handlers[i];
      try {
        await Promise.race([
          handler(signal),
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error('Shutdown step timeout')), this.timeoutMs)
          ),
        ]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error('shutdown.step.failed', { step: i, error: msg });
        exitCode = 1;
      }
    }

    this.logger.info('shutdown.complete', { signal, exitCode });
    process.exit(exitCode);
  }
}

export function installSignalHandlers(manager: ShutdownManager): void {
  process.on('SIGTERM', () => manager.initiate('SIGTERM'));
  process.on('SIGINT', () => manager.initiate('SIGINT'));
}
