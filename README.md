# ECHO Core — Content Compilation Engine

**Version:** 0.1.0 MVP  
**License:** Apache 2.0  
**Status:** Phase 0 — Domain & Schemas

## What is ECHO Core?

ECHO Core is a **Content Compilation Engine** that transforms any information source (text, PDF, audio, video, chats) into a hierarchical fractal structure of artifacts (L0-L3).

**Metaphor:** Not a RAG system, but a compiler. Like `gcc` turns `.c` into `.o` → `.elf`, ECHO turns raw source into a chain of artifacts: **L0 → L1 → L2 → L3**.

| Level | Artifact | Description |
|-------|----------|-------------|
| **L0** | `content.md` + `content.meta.json` | Normalized text + multimodal offsets (timestamps, speakers, OCR bbox) |
| **L1** | `L1.md` + `L1.index.json` | Structural outline: headings, sections, chunk anchors, line ranges |
| **L2** | `L2.json` | Semantic object: summary, concepts[], claims[], relations[] |
| **L3** | `embeddings.parquet` + `hnsw.bin` + `bm25.json` | Vector index + keyword index |

## Architecture Principles

- **Content-Addressable Storage (CAS):** `objects/{hash}/` where `hash = SHA-256(normalized text)`
- **Immutable artifacts:** Once compiled, never modified. New version = new hash.
- **Build Manifest:** Every node carries `build.json` with generator versions, models, timestamps — enabling reproducible builds and selective rebuilds.
- **Fractal nodes:** Parent (source reference) + children (segments). Each child is a self-similar `ContextNode` with full L0-L3 pipeline.
- **SQLite Registry:** Mutable source metadata, segments linkage, job queue, audit logs.
- **Adapter IPC:** Built-in adapters run as `child_process` with JSON-RPC 2.0 over stdin/stdout.

## Storage Layout

```
{dataDir}/
├── objects/                          # CAS: immutable artifacts L0-L2
│   └── ab/cd/{contentHash}/
│       ├── node.json                 # Build manifest + metadata
│       ├── content.md                # L0: normalized text
│       ├── content.meta.json         # L0: multimodal offsets
│       ├── L1.md                     # L1: structure (Markdown)
│       ├── L1.index.json             # L1: derived machine index
│       └── L2.json                   # L2: essence (JSON)
│
├── index/                            # Global L3 indices
│   ├── embeddings.parquet            # CANONICAL: all vectors
│   ├── hnsw.bin                      # REBUILDABLE CACHE
│   ├── hnsw.manifest.json            # model, dimension, version
│   └── bm25.json                     # global keyword index
│
├── adapters/                         # child_process scripts
│   └── {adapterId}/
│       ├── adapter.js
│       └── manifest.json
│
├── echo.sqlite                       # Registry: sources, segments, jobs, audit
└── config.yaml
```

## SQLite Registry Schema

See `packages/core/src/storage/schema.sql` for full DDL.

Key tables:
- `sources` — mutable source registry (uri, mimeType, rawHash, rootHash)
- `segments` — fractal node linkage (hash, sourceId, span, parentHash)
- `jobs` — background compilation queue with lease model (PENDING → RUNNING → COMPLETED/FAILED)
- `orphaned_objects` — Ghost System: L2 survival after source deletion
- `encryption_keys` — master key versions for at-rest encryption
- `audit_logs` — append-only operation log

## Queue Lease Model

SQLite-backed job queue with crash recovery:

```sql
UPDATE jobs
SET status='RUNNING', worker_id=?, lease_until=?
WHERE id = (SELECT id FROM jobs WHERE status='PENDING' ORDER BY priority DESC LIMIT 1);
```

If worker crashes, lease expires → job becomes `PENDING` again.

## Adapter IPC Protocol

JSON-RPC 2.0 over `child_process`:

| Method | Description |
|--------|-------------|
| `initialize` | Handshake, config exchange |
| `capabilities` | Returns supported mimeTypes/extensions |
| `ingest` | Transforms source → normalized content + optional segments |
| `shutdown` | Graceful termination |

## Phase 0 Deliverables

- [x] TypeScript domain interfaces (`types.ts`)
- [x] Zod runtime schemas (`schemas.ts`)
- [x] SQLite DDL (`schema.sql`)
- [x] Adapter IPC protocol (`protocol.ts`)
- [x] Build manifest schema
- [x] HNSW manifest schema

## MVP Roadmap

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| **0** | 3-5 days | Domain, schemas, interfaces |
| **1** | 5-7 days | CAS + SQLite registry |
| **2** | 5 days | Adapter IPC (text, markdown, PDF) |
| **3** | 7-10 days | Compilation pipeline L0→L1→L2 |
| **4** | 7 days | Retrieval: embeddings, HNSW, BM25 |
| **5** | 5-7 days | API + CLI + MCP |

## License

Apache 2.0 — see LICENSE file.
# echo-core
