/**
 * Rate Limiter Tests
 */

import { describe, it, expect } from 'vitest';
import { SemaphoreRateLimiter } from '../../packages/core/src/llm/rate-limiter.js';

describe('SemaphoreRateLimiter', () => {
  it('allows up to concurrency limit', async () => {
    const limiter = new SemaphoreRateLimiter();
    limiter.register('p1', 2);

    await limiter.acquire('p1');
    await limiter.acquire('p1');
    // Third should block until release
    let acquired = false;
    const pending = limiter.acquire('p1').then(() => { acquired = true; });

    // Small delay to ensure pending is queued
    await new Promise((r) => setTimeout(r, 10));
    expect(acquired).toBe(false);

    limiter.release('p1');
    await pending;
    expect(acquired).toBe(true);
  });

  it('release without pending increments permits', async () => {
    const limiter = new SemaphoreRateLimiter();
    limiter.register('p1', 1);

    await limiter.acquire('p1');
    limiter.release('p1');
    await limiter.acquire('p1'); // should not block
  });

  it('unknown provider resolves immediately', async () => {
    const limiter = new SemaphoreRateLimiter();
    await limiter.acquire('unknown');
  });
});
