/**
 * ECHO Core — Queue Worker
 * Phase 3: Lease-based job processor with heartbeat and crash recovery.
 */

import type { Registry } from '../storage/registry.js';
import type { CompilationPipeline } from './pipeline.js';

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
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class DefaultQueueWorker implements QueueWorker {
  private opts: Required<QueueWorkerOptions>;
  private running = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private currentJobId: string | null = null;

  constructor(opts: QueueWorkerOptions) {
    this.opts = {
      leaseDurationMs: 60000,
      heartbeatIntervalMs: 15000,
      pollIntervalMs: 1000,
      ...opts,
    };
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.opts.heartbeatIntervalMs);

    while (this.running) {
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
  }

  async processNext(): Promise<boolean> {
    // Release expired leases before acquiring (crash recovery)
    this.opts.registry.releaseExpiredLeases();

    const job = this.opts.registry.acquireLease(this.opts.workerId, this.opts.leaseDurationMs);
    if (!job) return false;

    this.currentJobId = job.id;

    try {
      await this.opts.pipeline.processJob(job);
      this.opts.registry.completeJob(job.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.opts.registry.failJob(job.id, msg);
    } finally {
      this.currentJobId = null;
    }

    return true;
  }

  private sendHeartbeat(): void {
    if (!this.currentJobId) return;
    try {
      this.opts.registry.heartbeatJob(this.currentJobId, this.opts.workerId, this.opts.leaseDurationMs);
    } catch {
      // ignore heartbeat failures; lease will expire and job will retry
    }
  }
}
