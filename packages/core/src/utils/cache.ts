/**
 * ECHO Core — LRU Cache
 * Phase 7: In-memory caching for embeddings, L2 artifacts, and search results.
 */

export interface LRUCache<K, V> {
  get(key: K): V | undefined;
  set(key: K, value: V): void;
  has(key: K): boolean;
  delete(key: K): boolean;
  size(): number;
  keys(): K[];
}

interface CacheEntry<V> {
  value: V;
  expiresAt?: number;
}

export class SimpleLRUCache<K, V> implements LRUCache<K, V> {
  private cache = new Map<K, CacheEntry<V>>();
  private maxSize: number;
  private defaultTtlMs?: number;

  constructor(maxSize: number, defaultTtlMs?: number) {
    this.maxSize = maxSize;
    this.defaultTtlMs = defaultTtlMs;
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== undefined && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V, ttlMs?: number): void {
    const effectiveTtl = ttlMs ?? this.defaultTtlMs;
    const entry: CacheEntry<V> = {
      value,
      expiresAt: effectiveTtl !== undefined ? Date.now() + effectiveTtl : undefined,
    };
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value as K;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, entry);
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  size(): number {
    // Clean expired entries first
    const now = Date.now();
    for (const [k, entry] of this.cache) {
      if (entry.expiresAt !== undefined && now > entry.expiresAt) {
        this.cache.delete(k);
      }
    }
    return this.cache.size;
  }

  keys(): K[] {
    return Array.from(this.cache.keys());
  }
}
