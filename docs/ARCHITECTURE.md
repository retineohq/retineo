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
┌─────────┐    ┌──────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│  File   │───→│  Adapter │───→│   L0    │───→│   L1    │───→│   L2    │
│ (.mp3)  │    │ (mock)   │    │  Raw    │    │Structure│    │ Semantic│
└─────────┘    └──────────┘    └─────────┘    └─────────┘    └─────────┘
                                    │               │               │
                                    ▼               ▼               ▼
                              ┌─────────┐    ┌─────────┐    ┌─────────┐
                              │content.md│    │  L1.md  │    │ summary │
                              │content.  │    │L1.index.│    │concepts │
                              │meta.json │    │  json   │    │entities │
                              └─────────┘    └─────────┘    └─────────┘
```

| Layer | Input | Output | Stored In |
|-------|-------|--------|-----------|
| **L0** | Adapter output | Normalized text + metadata blocks | `objects/{hash}/content.md` + `content.meta.json` |
| **L1** | L0 content | Structured markdown (headings, sections) + index | `objects/{hash}/L1.md` + `L1.index.json` |
| **L2** | L0 + L1 | Summary, concepts, entities, claims, relations | `objects/{hash}/L2.json` |
| **L3** | L2 + embeddings | Search index, candidate ranking | `(planned)` HNSW index |

## Queue Model
Background compilation (L1, L2, embedding) is handled by a SQLite-backed job queue with lease-based workers:
- `PENDING` → worker acquires lease → `RUNNING`
- Heartbeats prevent stale leases
- Failed jobs retry up to `maxAttempts`
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
│   └── (planned) HNSW vector indices
└── echo.sqlite                     # Registry: sources, segments, jobs, orphans
```

## Module Map

| Module | Responsibility |
|--------|---------------|
| `domain/` | Types, Zod schemas, shared language |
| `adapters/` | JSON-RPC protocol, transport, runner, manager, ingestion service |
| `storage/` | CAS (filesystem), Registry (SQLite), NodeBuilder, Config |
| `embeddings/` | `(planned)` Vector generation & caching |
| `search/` | `(planned)` HNSW, hybrid retrieval, ranking |
| `llm/` | `(planned)` Provider abstraction, prompt templates |
| `layers/` | `(planned)` L1/L2/L3 compilation pipelines |
| `context/` | `(planned)` Context assembly, window management |
| `ghost/` | `(planned)` Orphan recovery, garbage collection |
| `bridge/` | `(planned)` HTTP/gRPC API, WebSocket streaming |
| `mcp/` | `(planned)` Model Context Protocol server |

See [`structure.md`](../structure.md) for the complete file listing and cross-reference index.
