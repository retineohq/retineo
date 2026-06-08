/**
 * ECHO Core — Queue Worker
 * Phase 3: Lease-based job processor with heartbeat and crash recovery.
 */

import type { Registry } from '../storage/registry.js';
import type { CompilationPipeline } from './pipeline.js';
import type { Logger } from '../utils/logger.js';
import { getGlobalLogger } from '../utils/logger.js';

export interface QueueWorker {
  start(): Promise<void>;
  stop(): Promise<void>;
  processNext(): Promise<boolean>;
}

export interface QueueWorkerOptions {
  workerId: string;
  registry: Registry;
  pipeline: CompilationPipeline;
  leaseDurationMs?: number;
  heartbeatIntervalMs?: number;
  pollIntervalMs?: number;
  logger?: Logger;
  shutdownManager?: { isShuttingDown(): boolean } | undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class DefaultQueueWorker implements QueueWorker {
  private opts: Required<Omit<QueueWorkerOptions, 'shutdownManager'>> & { logger: Logger; shutdownManager?: { isShuttingDown(): boolean } };
  private running = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private currentJobId: string | null = null;

  constructor(opts: QueueWorkerOptions) {
    this.opts = {
      leaseDurationMs: 60000,
      heartbeatIntervalMs: 15000,
      pollIntervalMs: 1000,
      logger: opts.logger ?? getGlobalLogger().child({ layer: 'worker', workerId: opts.workerId }),
      shutdownManager: opts.shutdownManager,
      ...opts,
    };
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.opts.logger.info('job.acquire', { status: 'worker.start' });

    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.opts.heartbeatIntervalMs);

    while (this.running) {
      if (this.opts.shutdownManager?.isShuttingDown()) {
        this.opts.logger.info('job.acquire', { status: 'worker.shutdown' });
        break;
      }
      const processed = await this.processNext();
      if (!processed) {
        await sleep(this.opts.pollIntervalMs);
      }
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.opts.logger.info('job.complete', { status: 'worker.stop' });
  }

  async processNext(): Promise<boolean> {
    this.opts.registry.releaseExpiredLeases();

    const job = this.opts.registry.acquireLease(this.opts.workerId, this.opts.leaseDurationMs);
    if (!job) return false;

    this.currentJobId = job.id;
    this.opts.logger.info('job.acquire', { jobId: job.id, type: job.type });

    try {
      await this.opts.pipeline.processJob(job);
      this.opts.registry.completeJob(job.id);
      this.opts.logger.info('job.complete', { jobId: job.id, type: job.type });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.opts.logger.error('job.fail', { jobId: job.id, type: job.type, error: msg });
      this.opts.registry.failJob(job.id, msg);
      // Graceful retry delay for L3 to give embedding provider time to warm up
      if (job.type === 'GENERATE_L3') {
        await sleep(2000);
      }
    } finally {
      this.currentJobId = null;
    }

    return true;
  }

  private sendHeartbeat(): void {
    if (!this.currentJobId) return;
    try {
      this.opts.registry.heartbeatJob(this.currentJobId, this.opts.workerId, this.opts.leaseDurationMs);
      this.opts.logger.debug('job.heartbeat', { jobId: this.currentJobId });
    } catch {
      // ignore heartbeat failures; lease will expire and job will retry
    }
  }
}
