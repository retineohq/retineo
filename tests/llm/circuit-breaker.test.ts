/**
 * ECHO Core — Circuit Breaker Tests
 * Phase 7
 */

import { describe, it, expect } from 'vitest';
import { DefaultCircuitBreaker } from '../../packages/core/src/llm/circuit-breaker.js';

describe('DefaultCircuitBreaker', () => {
  it('starts closed', () => {
    const cb = new DefaultCircuitBreaker();
    expect(cb.getState()).toBe('closed');
  });

  it('allows calls when closed', async () => {
    const cb = new DefaultCircuitBreaker();
    const result = await cb.call(() => Promise.resolve(42));
    expect(result).toBe(42);
    expect(cb.getState()).toBe('closed');
  });

  it('opens after failure threshold', async () => {
    const cb = new DefaultCircuitBreaker({ failureThreshold: 3, recoveryTimeoutMs: 10000 });
    for (let i = 0; i < 3; i++) {
      try { await cb.call(() => Promise.reject(new Error('fail'))); } catch { /* ignore */ }
    }
    expect(cb.getState()).toBe('open');
    expect(cb.getFailureCount()).toBe(3);
  });

  it('rejects calls when open', async () => {
    const cb = new DefaultCircuitBreaker({ failureThreshold: 1, recoveryTimeoutMs: 10000 });
    try { await cb.call(() => Promise.reject(new Error('fail'))); } catch { /* ignore */ }
    expect(cb.getState()).toBe('open');
    await expect(cb.call(() => Promise.resolve(42))).rejects.toThrow('Circuit breaker is OPEN');
  });

  it('transitions to half-open after recovery timeout', async () => {
    const cb = new DefaultCircuitBreaker({ failureThreshold: 1, recoveryTimeoutMs: 50 });
    try { await cb.call(() => Promise.reject(new Error('fail'))); } catch { /* ignore */ }
    expect(cb.getState()).toBe('open');
    await new Promise((r) => setTimeout(r, 60));
    expect(cb.getState()).toBe('half-open');
  });

  it('closes after success in half-open', async () => {
    const cb = new DefaultCircuitBreaker({ failureThreshold: 1, recoveryTimeoutMs: 50, halfOpenMaxCalls: 1 });
    try { await cb.call(() => Promise.reject(new Error('fail'))); } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 60));
    expect(cb.getState()).toBe('half-open');
    await cb.call(() => Promise.resolve(42));
    expect(cb.getState()).toBe('closed');
  });

  it('reopens after failure in half-open', async () => {
    const cb = new DefaultCircuitBreaker({ failureThreshold: 1, recoveryTimeoutMs: 50, halfOpenMaxCalls: 1 });
    try { await cb.call(() => Promise.reject(new Error('fail'))); } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 60));
    expect(cb.getState()).toBe('half-open');
    try { await cb.call(() => Promise.reject(new Error('fail'))); } catch { /* ignore */ }
    expect(cb.getState()).toBe('open');
  });

  it('resets failure count on success', async () => {
    const cb = new DefaultCircuitBreaker({ failureThreshold: 3 });
    try { await cb.call(() => Promise.reject(new Error('fail'))); } catch { /* ignore */ }
    expect(cb.getFailureCount()).toBe(1);
    await cb.call(() => Promise.resolve(1));
    expect(cb.getFailureCount()).toBe(0);
  });
});
