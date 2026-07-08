# RETINEO Core Architecture

RETINEO Core is a **Content Compilation Engine** that transforms raw files into structured, queryable context nodes through a layered pipeline (L0–L3).

## Core Concepts

### Content-Addressable Storage (CAS)
Every artifact is stored by the SHA-256 hash of its content. Once written, an object is immutable. New versions receive new hashes. This enables automatic deduplication, verifiable integrity, and trivial caching.

### Fractal ContextNode
A `ContextNode` is the atomic unit of context. It contains:
- `id` — content hash (SHA-256)
- `sourceRef` — where the data came from (`sourceId`, `externalId`)
- `parentId` / `childrenIds` — tree linkage by content hash
- `depth` — level in the tree (0 = root)
- `artifacts` — L0 (raw text), L1 (structured), L2 (semantic)
- `semanticLinks` — optional `SemanticLink[]` placeholder for future Pro/Plugin L4 features
- `build` — manifest of generators and versions

`sourcePath` is not stored inside the node; it is resolved post-search from the Registry (`externalId`) for UI display.

Nodes are fractal: a 10-minute video becomes a root node with child segments, each its own node. A 500-page PDF becomes a root with chapter children. Any node can stand alone or participate in a tree.

### Adapter IPC + SourceAdapter
Document adapters are external child processes that speak JSON-RPC 2.0 over stdin/stdout. They convert any file format into normalized text + metadata blocks. RETINEO Core does not parse PDFs, transcribe audio, or OCR images itself — it delegates to adapters.

`SourceAdapter` is a separate abstraction for *sources* of documents (filesystem, S3, API, etc.). A `SourceAdapter` exposes `sync()` and `fetch(externalId)`; Core only sees `(sourceId, externalId, body, etag)`. The CLI `retineo ingest` uses `FileSystemSourceAdapter`, one of many possible implementations.

## L0–L3 Pipeline

```
┌─────────┐    ┌──────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│  File   │───→│  Adapter │───→│   L0    │───→│   L1    │───→│   L2    │───→│   L3    │
│ (.mp3)  │    │ (mock)   │    │  Raw    │    │Structure│    │ Semantic│    │  Index  │
└─────────┘    └──────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────┘
                                    │               │               │               │
                                    ▼               ▼               ▼               ▼
                              ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
                              │content.md│    │  L1.md  │    │ summary │    │embeddings│
                              │content.  │    │L1.index.│    │concepts │    │.jsonl   │
                              │meta.json │    │  json   │    │entities │    │bm25.json│
                              └─────────┘    └─────────┘    └─────────┘    └─────────┘
                                                                                │
                                                                                ▼
                                                                         ┌─────────┐
                                                                         │hnsw.    │
                                                                         │manifest.│
                                                                         │json     │
                                                                         └─────────┘
```

## Retrieval Pipeline (Phase 4)

```
User Query
  ↓
QueryAnalyzer        (language detection → intent classification → enrichment)
  ↓
RetrievalService     (L3 semantic search → L2 rerank → L1/L0 cascade)
  ↓
ContextAssembler     (token budgets → citations → drill-down tree)
  ↓
AssembledContext     (ready for LLM consumption)
```

| Stage | What it does | Key config |
|-------|-------------|------------|
| **QueryAnalyzer** | Detects language, classifies intent, resolves pronouns, extracts entities | `search.languageDetection`, `search.prompts` |
| **L3 Search** | HNSW approximate nearest neighbors (or brute-force cosine) + BM25 hybrid | `search.semantic.topK`, `search.semantic.hybridWeight` |
| **L2 Rerank** | Scores by concept/claim/summary/language overlap | `search.rerank.weights` |
| **L1/L0 Cascade** | Loads deeper artifacts based on intent | `search.cascade.budgets` |
| **ContextAssembler** | Allocates tokens, formats citations, builds drill-down | `search.citations.format`, `maxTokens` |

| Layer | Input | Output | Stored In |
|-------|-------|--------|-----------|
| **L0** | Adapter output | Normalized text + metadata blocks | `objects/{hash}/content.md` + `content.meta.json` |
| **L1** | L0 content | Structured markdown (headings, sections) + index | `objects/{hash}/L1.md` + `L1.index.json` |
| **L2** | L0 + L1 | Summary, concepts, entities, claims, relations | `objects/{hash}/L2.json` |
| **L3** | L0 body + embeddings | Search index, candidate ranking | `index/embeddings.jsonl` + `bm25.json` + `hnsw.manifest.json` + `hnsw.bin` |

## Queue Model
Background compilation (L1, L2, embedding) is handled by a SQLite-backed job queue with lease-based workers:
- `PENDING` → worker acquires lease → `RUNNING`
- Heartbeats prevent stale leases
- Failed jobs retry up to `maxAttempts`

## Structured Logging (Phase 6)

All subsystems emit structured JSON logs via Pino:
- **Trace IDs** propagate across HTTP (`X-Trace-Id`), CLI, and MCP boundaries
- **Redaction** auto-masks `apiKey`, `password`, `secret`, `token`
- **Child loggers** bind context (`layer`, `nodeHash`, `jobId`) per subsystem

See [`LOGGING.md`](LOGGING.md) for configuration and event reference.

## Graceful Shutdown (Phase 6)

On `SIGTERM` / `SIGINT`:
1. HTTP server returns 503 for new requests
2. Worker finishes current job, stops acquiring new ones
3. Running jobs are released back to `PENDING` (crash recovery)
4. Adapters killed, SQLite closed, logs flushed

See [`OPERATIONS.md`](OPERATIONS.md) for deployment notes and health checks.
- Dead jobs are archived for inspection

## Production Hardening (Phase 7)

### Standardized Errors

All errors extend `BaseRetineoError` with a stable `code`, `statusCode`, and `details`:

| Code | Status | Meaning |
|------|--------|---------|
| `ADAPTER_SPAWN_FAILED` | 500 | Adapter process could not start |
| `INGEST_CAS_WRITE_FAILED` | 500 | CAS filesystem error |
| `LLM_TIMEOUT` | 504 | LLM provider did not respond |
| `LLM_CIRCUIT_OPEN` | 503 | Circuit breaker is open |
| `SEARCH_EMPTY` | 404 | No search results |
| `CONFIG_SECRET_NOT_FOUND` | 400 | Required secret missing |
| `BRIDGE_SHUTDOWN` | 503 | Service is shutting down |

HTTP responses include structured JSON. CLI uses `formatCLIError()` for human-readable or `--json` output.

### Circuit Breaker

Each LLM provider has an independent circuit breaker (`DefaultCircuitBreaker`):
- **Closed** — normal operation; failures counted
- **Open** — after `failureThreshold` failures (default 5); all calls fast-fail
- **Half-open** — after `recoveryTimeoutMs` (default 30s); a single success closes the circuit

If a provider opens, the factory automatically routes to a configured `fallback` provider. If none exists, `LLMCircuitOpen` is thrown.

### Secrets Management

Sensitive config values (`${ENV_VAR}`) resolve in order:
1. Environment variable
2. `SecretsManager` (`~/.retineo/secrets.json`, AES-256-GCM encrypted)
3. Throw `CONFIG_SECRET_NOT_FOUND`

CLI: `retineo key set <provider> <key>`, `retineo key get <provider>`, `retineo key delete <provider>`, `retineo key list`.

### Health & Metrics

| Endpoint | Purpose |
|----------|---------|
| `GET /v1/health` | Liveness probe (SQLite, CAS, LLM, worker) |
| `GET /v1/ready` | Readiness probe (index loaded, queue healthy, not shutting down) |
| `GET /v1/metrics` | JSON operational snapshot |
| `GET /v1/metrics/prometheus` | Prometheus text format |

See [`HEALTH.md`](HEALTH.md) for health probe config and alerting rules.
See [`SECURITY.md`](SECURITY.md) for secrets and error handling details.

## ContextNode Repository (v0.2.0)

`ContextNodeRepository` is the single point of truth for loading and saving `ContextNode` objects. Business logic (pipeline, retrieval) works with `ContextNode`, never with raw CAS paths.

```typescript
interface ContextNodeRepository {
  loadByHash(hash: Hash): Promise<ContextNode | null>;
  loadBySourcePath(path: string): Promise<ContextNode | null>;
  loadChildren(parentHash: Hash): Promise<ContextNode[]>;
  save(node: ContextNode): Promise<void>;
  buildManifest(node: ContextNode): BuildManifest;
  loadL2(hash: Hash): Promise<L2Artifact | null>;
}
```

`cas.ts` now persists `parentId` and `sourceRef` alongside the `BuildManifest` in `node.json`, enabling full `ContextNode` reconstruction without registry lookups.

## Okapi BM25 (v0.2.0)

Keyword search uses proper Okapi BM25 with IDF and document length normalization:

```
BM25(q, d) = Σ IDF(qi) · TF(qi,d) · (k1+1) / (TF(qi,d) + k1 · (1 - b + b · |d|/avgdl))
```

| Parameter | Default | Purpose |
|-----------|---------|--------|
| `k1` | 1.2 | Term saturation — higher = slower TF growth |
| `b` | 0.75 | Length normalization — 0 = no normalization, 1 = full |

- `bm25.json` format: `{ invertedIndex: {term: hash[]}, docLengths: {hash: num} }`
- Backward compatible with old `Record<string, string[]>` format
- Keyword search uses raw BM25 scores (no threshold filtering)
- Hybrid mode: BM25 + semantic weighted by `search.semantic.hybridWeight`

## Ghost System (v0.2.0)

Orphan detection, recovery, and garbage collection for deleted/modified source files:

| Component | Responsibility |
|-----------|---------------|
| `DefaultOrphanDetector` | Scans registered sources, detects deleted files, registers orphans |
| `DefaultGhostRecoveryService` | Lists orphans, recovers from CAS, purges old entries |
| CLI `ghost list` | Shows all orphaned objects |
| CLI `ghost recover <hash>` | Restores content from CAS to original or custom path |
| CLI `ghost purge <days>` | Removes orphans older than N days |

Orphan detection runs at graceful shutdown to catch files deleted while the daemon was running.

## Document Hit + L1 Navigation (v0.2.0)

Search results aggregate chunk-level hits into document-level `DocumentHit` objects with navigation trees:

```
ChunkHit[] → aggregateDocumentHits() → DocumentHit[]
  ├── documentScore = maxChunkScore + coverageBonus + densityBonus
  ├── chunks: ChunkHit[] (with sectionId, lineRange)
  └── navigationTree: NavigationNode[] (from L1 sections)
```

| Bonus | Condition | Value |
|-------|-----------|-------|
| Coverage | Chunks from >1 section | `uniqueSections × 0.05` |
| Density | 2+ chunks in same section | `0.1` |

`buildNavigationTree(chunks, l1Index)` maps `ChunkHit[]` to a tree of `NavigationNode` objects, one per L1 section, with chunk hits attached.

## Performance Optimization (Phase 7)

### HNSW Vector Index

Approximate nearest neighbor search via `hnswlib-node` (native, required dependency):
- `createHNSWIndex(dimension, metric)` returns the best available implementation
- `NativeHNSWWrapper` maintains label→hash mapping (persisted as `.labels.json` alongside `hnsw.bin`)
- `BruteForceHNSW` is available as a test/debug fallback
- `loadOrBuildHNSW(indexDir, dimension, model)` loads an existing index or rebuilds from `embeddings.jsonl` on manifest mismatch
- `DefaultRetrievalService` loads the HNSW index at startup and uses it for semantic/hybrid search
- Manifest tracks `dimension`, `metric`, `model`, `count`, `version`

### Parquet Embedding Store

`ParquetEmbeddingStore` interface with JSONL fallback (`JSONLEmbeddingStore`). Future migration to `apache-arrow` is stubbed without consumer changes.

### Batch Embedding

`DefaultL3Generator.batchEmbed(items, provider)` groups texts into configurable batches (default 100) to reduce API round-trips.

### LRU Cache

Three caches in `DefaultRetrievalService`:

| Cache | Key | Max | TTL |
|-------|-----|-----|-----|
| Embedding | query string → vector | 1,000 | none |
| L2 Artifact | hash → `L2Artifact` | 500 | none |
| Search Result | query+options → `RetrievalResult` | 100 | 5 min |

`SimpleLRUCache` supports TTL eviction and MRU reordering on `get()`.

See [`PERFORMANCE.md`](PERFORMANCE.md) for benchmarks and tuning.

## Storage Layout

```
data/
├── objects/
│   └── ab/
│       └── cdef.../
│           ├── content.md          # L0 normalized text
│           ├── content.meta.json   # L0 metadata blocks
│           ├── node.json           # BuildManifest + sourceRef/parentId/semanticLinks (no sourcePath)
│           ├── L1.md               # L1 structured markdown
│           ├── L1.index.json       # L1 heading index
│           └── L2.json             # L2 semantic artifact
├── index/
│   ├── embeddings.jsonl            # One JSON line per vector
│   ├── bm25.json                   # Okapi BM25 inverted index + doc lengths
│   ├── hnsw.bin                    # HNSW approximate nearest neighbor index
│   ├── hnsw.manifest.json          # Index metadata
│   └── hnsw.labels.json            # label → hash mapping
└── retineo.sqlite                  # Registry: sources, segments, jobs, orphans
```

## Module Map

| Module | Responsibility |
|--------|---------------|
| `domain/` | Types, Zod schemas, shared language |
| `adapters/` | JSON-RPC protocol, transport, runner, manager, `SourceAdapter` interface, `FileSystemSourceAdapter` |
| `services/` | `IngestionService` — source-agnostic ingestion orchestrator |
| `storage/` | CAS (filesystem), Registry (SQLite), AuditLog, NodeBuilder, Config, SecretsManager, ContextNodeRepository |
| `embeddings/` | HNSW index, Parquet/JSONL embedding store, vector I/O |
| `search/` | Query analysis, Okapi BM25, semantic/keyword/hybrid retrieval, L2 rerank, L1/L0 cascade, DocumentHit aggregation, context assembly |
| `llm/` | Provider abstraction, rate limiting, circuit breaker, factory (Ollama, OpenAI-compatible, Mock) |
| `layers/` | L1/L2/L3 generators, compilation pipeline, queue worker, batch embedding |
| `context/` | `(planned)` Context assembly, window management |
| `i18n/` | Language packs, detection (franc/cld3/heuristic), cross-lingual search |
| `ghost/` | Orphan detection, recovery service, garbage collection |
| `bridge/` | HTTP REST API + SSE streaming + health/metrics (Fastify, localhost-only) |
| `mcp/` | Model Context Protocol server (stdio transport) |
| `utils/` | Shared helpers, logger, shutdown manager, errors, error handler, LRU cache |

## User Interface Layer (Phase 5)

```
User / External Agent
  ↓
┌─────────────────────────────────────────┐
│  CLI          │  HTTP API    │  MCP      │
│  retineo ingest  │  POST /v1/   │  retineo_    │
│  retineo search  │  ingest      │  search   │
│  retineo status  │  POST /v1/   │  retineo_    │
│  retineo compile │  search      │  ingest   │
│  retineo config  │  GET /v1/    │  retineo_    │
│               │  status      │  status   │
│               │  SSE /v1/    │           │
│               │  jobs/:id    │           │
└─────────────────────────────────────────┘
  ↓
IngestionService / RetrievalService / CompilationPipeline
```

| Interface | Transport | Default | Auth |
|-----------|-----------|---------|------|
| **CLI** | `stdio` | `retineo` command | none (local process) |
| **HTTP API** | Fastify | `127.0.0.1:37891` | none in MVP (future: API keys) |
| **MCP** | stdio (JSON-RPC) | Claude Desktop, Cursor | none |

### CLI Commands (Phase 7)

```
retineo ingest <file>          # Ingest a file via FileSystemSourceAdapter
retineo search <query>         # Search with --language, --mode, --top-k, --json
retineo status                 # Engine status
retineo compile [file]         # Compile pending jobs or specific file
retineo rebuild [--force]      # Full rebuild: delete index + reset L1/L2 + re-sync adapters; --force wipes data dir
retineo config [key] [value]   # Read/write config
retineo jobs                   # List recent jobs
retineo recover <hash>         # Recover ghost node
retineo ghost list             # List ghost objects
retineo ghost recover <hash>   # Recover ghost from CAS
retineo ghost purge <days>     # Remove old ghosts
retineo key set <p> <key>      # Store encrypted API key
retineo key get <p>            # Show masked key
retineo key delete <p>         # Remove key
retineo key list               # List all keys (masked)
```

See [`structure.md`](../structure.md) for the complete file listing and cross-reference index.
