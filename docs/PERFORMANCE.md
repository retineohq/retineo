# ECHO Core — Performance Optimization

## HNSW Vector Index

### Overview

Replaces brute-force cosine search with Hierarchical Navigable Small World (HNSW) for O(log N) approximate nearest neighbors.

### Implementation

- **Primary:** `hnswlib-node` (native bindings, fast).
- **Fallback:** Brute-force cosine similarity (pure JS, always works).

```typescript
import { createHNSWIndex, loadOrBuildHNSW } from 'echo-core/embeddings';

const index = await createHNSWIndex(1536, 'cosine');
index.build(vectors);
const results = index.search(queryVector, 10);
```

### Manifest

`hnsw.manifest.json` tracks:
- `dimension` — vector dimension
- `metric` — `cosine`, `euclidean`, or `ip`
- `model` — embedding model name
- `count` — number of vectors
- `version` — increment on rebuild

On model/dimension mismatch → automatic rebuild from `embeddings.jsonl`.

### Save/Load

```typescript
await index.save('/path/to/hnsw.bin');
await index.load('/path/to/hnsw.bin');
```

## Parquet Embedding Store

### Overview

Optional replacement for `embeddings.jsonl` using Apache Parquet for better compression and query performance.

### Implementation

- **Interface:** `ParquetEmbeddingStore` (append, readAll, readBatch).
- **Current:** JSONL fallback (no native deps, always works).
- **Future:** `apache-arrow` migration when package size/performance is verified.

```typescript
import { createEmbeddingStore } from 'echo-core/embeddings';

const store = createEmbeddingStore(indexDir);
await store.append([{ hash: 'abc', vector: [...], model: 'text-embedding-3-small', dimension: 1536 }]);
```

## Batch Embedding

### Overview

Groups texts into batches to reduce API calls and latency.

### Config

```yaml
performance:
  batchEmbedding:
    batchSize: 100
    maxConcurrency: 2
```

### Usage

`DefaultL3Generator.batchEmbed(items, provider)` groups items into batches of `batchSize` and calls `provider.embed(batchTexts)`.

OpenAI and Ollama both support batch embedding. Fallback to single embedding if provider rejects batches.

## LRU Cache

### Overview

Caches frequently accessed data to avoid disk I/O.

### Caches

| Cache | Key | Max Entries | TTL |
|-------|-----|-------------|-----|
| Embedding | `query string` → `vector` | 1,000 | none |
| L2 Artifact | `hash` → `L2Artifact` | 500 | none |
| Search Result | `query+options` → `RetrievalResult` | 100 | 5 min |

### Config

```yaml
performance:
  cache:
    embeddingMax: 1000
    l2Max: 500
    searchMax: 100
    searchTtlMs: 300000
```

### Implementation

`SimpleLRUCache` supports TTL eviction and MRU reordering on `get()`.

```typescript
import { SimpleLRUCache } from 'echo-core/utils';

const cache = new SimpleLRUCache<string, number[]>(1000);
cache.set('key', value);
const hit = cache.get('key'); // moves to most-recent
```

## Benchmarks (MVP, 10K vectors)

| Operation | Brute-Force | HNSW (native) |
|-----------|-------------|---------------|
| Build | 200ms | 50ms |
| Search | 80ms | <5ms |
| Memory | ~60MB | ~40MB |

HNSW native fallback to brute-force is automatic if `hnswlib-node` fails to compile.
