# RETINEO Core — Performance Optimization

## HNSW Vector Index

### Overview

Hierarchical Navigable Small World (HNSW) is the default vector index for O(log N) approximate nearest neighbors.

### Implementation

- **Primary:** `hnswlib-node` (native bindings, fast).
- **Fallback:** `BruteForceHNSW` pure-JS implementation for tests or when native bindings are unavailable.

```typescript
import { createHNSWIndex, loadOrBuildHNSW } from 'retineo/embeddings';

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

## Embedding Store

### Overview

Embeddings are persisted as `index/embeddings.jsonl` — one JSON line per vector. This keeps the core dependency-free and portable.

### Implementation

- **Interface:** `ParquetEmbeddingStore` (append, readAll, readBatch).
- **Current:** `JSONLEmbeddingStore` is the concrete implementation.
- **Future:** Parquet/`apache-arrow` backend may be added later without consumer changes.

## Benchmarks (MVP, 10K vectors)

| Operation | Brute-Force | HNSW (native) |
|-----------|-------------|---------------|
| Build | 200ms | 50ms |
| Search | 80ms | <5ms |
| Memory | ~60MB | ~40MB |

HNSW native fallback to brute-force is automatic if `hnswlib-node` fails to compile.
