/**
 * RETINEO Core — Rate Limiter
 * Phase 3: Per-provider concurrency control via semaphore
 */

export interface RateLimiter {
  acquire(providerId: string): Promise<void>;
  release(providerId: string): void;
}

interface Semaphore {
  permits: number;
  queue: Array<() => void>;
}

export class SemaphoreRateLimiter implements RateLimiter {
  private semaphores = new Map<string, Semaphore>();

  register(providerId: string, concurrency: number): void {
    this.semaphores.set(providerId, { permits: concurrency, queue: [] });
  }

  acquire(providerId: string): Promise<void> {
    const sem = this.semaphores.get(providerId);
    if (!sem) return Promise.resolve();

    if (sem.permits > 0) {
      sem.permits--;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      sem.queue.push(resolve);
    });
  }

  release(providerId: string): void {
    const sem = this.semaphores.get(providerId);
    if (!sem) return;

    const next = sem.queue.shift();
    if (next) {
      next();
    } else {
      sem.permits++;
    }
  }
}
