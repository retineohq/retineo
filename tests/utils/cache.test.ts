/**
 * ECHO Core — LRU Cache Tests
 * Phase 7
 */

import { describe, it, expect } from 'vitest';
import { SimpleLRUCache } from '../../packages/core/src/utils/cache.js';

describe('SimpleLRUCache', () => {
  it('get/set basic', () => {
    const cache = new SimpleLRUCache<string, number>(3);
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
    expect(cache.has('a')).toBe(true);
  });

  it('evicts oldest when over maxSize', () => {
    const cache = new SimpleLRUCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
    expect(cache.size()).toBe(2);
  });

  it('reordering on get prevents eviction', () => {
    const cache = new SimpleLRUCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a'); // a becomes most recent
    cache.set('c', 3);
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe(3);
  });

  it('TTL eviction', async () => {
    const cache = new SimpleLRUCache<string, number>(10, 50);
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
    await new Promise((r) => setTimeout(r, 60));
    expect(cache.get('a')).toBeUndefined();
    expect(cache.has('a')).toBe(false);
  });

  it('delete removes key', () => {
    const cache = new SimpleLRUCache<string, number>(10);
    cache.set('a', 1);
    expect(cache.delete('a')).toBe(true);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.delete('a')).toBe(false);
  });

  it('keys returns current keys', () => {
    const cache = new SimpleLRUCache<string, number>(10);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.keys()).toEqual(['a', 'b']);
  });
});
