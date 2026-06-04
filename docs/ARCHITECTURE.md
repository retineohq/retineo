# ECHO Core Architecture

ECHO Core is a **Content Compilation Engine** that transforms raw files into structured, queryable context nodes through a layered pipeline (L0–L3).

## Core Concepts

### Content-Addressable Storage (CAS)
Every artifact is stored by the SHA-256 hash of its content. Once written, an object is immutable. New versions receive new hashes. This enables automatic deduplication, verifiable integrity, and trivial caching.

### Fractal ContextNode
A `ContextNode` is the atomic unit of context. It contains:
- `id` — content hash (SHA-256)
- `sourceRef` — where the data came from
- `parentId` / `childrenIds` — tree linkage
- `depth` — level in the tree (0 = root)
- `artifacts` — L0 (raw text), L1 (structured), L2 (semantic)
- `build` — manifest of generators and versions

Nodes are fractal: a 10-minute video becomes a root node with child segments, each its own node. A 500-page PDF becomes a root with chapter children. Any node can stand alone or participate in a tree.

### Adapter IPC
Adapters are external child processes that speak JSON-RPC 2.0 over stdin/stdout. They convert any file format into normalized text + metadata blocks. ECHO Core does not parse PDFs, transcribe audio, or OCR images itself — it delegates to adapters. This keeps the core small and makes format support pluggable.

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
| **L3 Search** | Brute-force cosine over `embeddings.jsonl` + BM25 hybrid | `search.semantic.topK`, `search.semantic.hybridWeight` |
| **L2 Rerank** | Scores by concept/claim/summary/language overlap | `search.rerank.weights` |
| **L1/L0 Cascade** | Loads deeper artifacts based on intent | `search.cascade.budgets` |
| **ContextAssembler** | Allocates tokens, formats citations, builds drill-down | `search.citations.format`, `maxTokens` |

| Layer | Input | Output | Stored In |
|-------|-------|--------|-----------|
| **L0** | Adapter output | Normalized text + metadata blocks | `objects/{hash}/content.md` + `content.meta.json` |
| **L1** | L0 content | Structured markdown (headings, sections) + index | `objects/{hash}/L1.md` + `L1.index.json` |
| **L2** | L0 + L1 | Summary, concepts, entities, claims, relations | `objects/{hash}/L2.json` |
| **L3** | L2 + embeddings | Search index, candidate ranking | `index/embeddings.jsonl` + `bm25.json` + `hnsw.manifest.json` |

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

## Storage Layout

```
data/
├── objects/
│   └── ab/
│       └── cdef.../
│           ├── content.md          # L0 normalized text
│           ├── content.meta.json   # L0 metadata blocks
│           ├── L1.md               # L1 structured markdown
│           ├── L1.index.json       # L1 heading index
│           └── L2.json             # L2 semantic artifact
├── index/
│   ├── embeddings.jsonl            # MVP: one JSON line per vector (Phase 4: parquet)
│   ├── bm25.json                   # Inverted keyword index
│   └── hnsw.manifest.json          # Index metadata (Phase 4: hnsw.bin)
└── echo.sqlite                     # Registry: sources, segments, jobs, orphans
```

## Module Map

| Module | Responsibility |
|--------|---------------|
| `domain/` | Types, Zod schemas, shared language |
| `adapters/` | JSON-RPC protocol, transport, runner, manager, ingestion service |
| `storage/` | CAS (filesystem), Registry (SQLite), NodeBuilder, Config |
| `embeddings/` | `(planned)` Vector generation & caching |
| `search/` | Query analysis, semantic/keyword/hybrid retrieval, L2 rerank, L1/L0 cascade, context assembly |
| `llm/` | Provider abstraction, rate limiting, factory (Ollama, OpenAI-compatible, Mock) |
| `layers/` | L1/L2/L3 generators, compilation pipeline, queue worker |
| `context/` | `(planned)` Context assembly, window management |
| `i18n/` | Language packs, detection (franc/cld3/heuristic), cross-lingual search |
| `ghost/` | `(planned)` Orphan recovery, garbage collection |
| `bridge/` | HTTP REST API + SSE streaming (Fastify, localhost-only) |
| `mcp/` | Model Context Protocol server (stdio transport) |

## User Interface Layer (Phase 5)

```
User / External Agent
  ↓
┌─────────────────────────────────────────┐
│  CLI          │  HTTP API    │  MCP      │
│  echo ingest  │  POST /v1/   │  echo_    │
│  echo search  │  ingest      │  search   │
│  echo status  │  POST /v1/   │  echo_    │
│  echo compile │  search      │  ingest   │
│  echo config  │  GET /v1/    │  echo_    │
│               │  status      │  status   │
│               │  SSE /v1/    │           │
│               │  jobs/:id    │           │
└─────────────────────────────────────────┘
  ↓
IngestionService / RetrievalService / CompilationPipeline
```

| Interface | Transport | Default | Auth |
|-----------|-----------|---------|------|
| **CLI** | `stdio` | `echo` command | none (local process) |
| **HTTP API** | Fastify | `127.0.0.1:37891` | none in MVP (future: API keys) |
| **MCP** | stdio (JSON-RPC) | Claude Desktop, Cursor | none |

See [`structure.md`](../structure.md) for the complete file listing and cross-reference index.
