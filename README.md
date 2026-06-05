# ECHO Core — Content Compilation Engine

[![npm version](https://img.shields.io/npm/v/echo-core)](https://www.npmjs.com/package/echo-core)
[![CI](https://github.com/your-org/echo-core/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/echo-core/actions)

**Version:** 0.1.0 MVP  
**License:** Apache 2.0  
**Status:** Phases 0–7 complete — 277 tests passing

## What is ECHO Core?

ECHO Core is a **Content Compilation Engine** that transforms any information source (text, PDF, audio, video, chats) into a hierarchical fractal structure of artifacts (L0-L3).

**Metaphor:** Not a RAG system, but a compiler. Like `gcc` turns `.c` into `.o` → `.elf`, ECHO turns raw source into a chain of artifacts: **L0 → L1 → L2 → L3**.

| Level | Artifact | Description |
|-------|----------|-------------|
| **L0** | `content.md` + `content.meta.json` | Normalized text + multimodal offsets (timestamps, speakers, OCR bbox) |
| **L1** | `L1.md` + `L1.index.json` | Structural outline: headings, sections, chunk anchors, line ranges |
| **L2** | `L2.json` | Semantic object: summary, concepts[], claims[], relations[] |
| **L3** | `embeddings.parquet` + `hnsw.bin` + `bm25.json` | Vector index + keyword index |

## Install

```bash
npm install -g echo-core
```

Or try without installing:

```bash
npx echo-core status
```

See [docs/INSTALL.md](docs/INSTALL.md) for binary and source install options.

## Quick start

```bash
echoc init      # create ~/.echo/ config
echoc status    # check engine status
echoc ingest ./my-document.pdf
echoc search "semantic search query"
```

> `echo-core` is also available as an alias for the `echoc` command.

## Architecture Principles

- **Content-Addressable Storage (CAS):** `objects/{hash}/` where `hash = SHA-256(normalized text)`
- **Immutable artifacts:** Once compiled, never modified. New version = new hash.
- **Build Manifest:** Every node carries `build.json` with generator versions, models, timestamps — enabling reproducible builds and selective rebuilds.
- **Fractal nodes:** Parent (source reference) + children (segments). Each child is a self-similar `ContextNode` with full L0-L3 pipeline.
- **SQLite Registry:** Mutable source metadata, segments linkage, job queue, audit logs.
- **Adapter IPC:** Built-in adapters run as `child_process` with JSON-RPC 2.0 over stdin/stdout.

## Documentation

- [Installation](docs/INSTALL.md)
- [Getting Started](docs/GETTING_STARTED.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Adapter Guide](docs/ADAPTER_GUIDE.md)
- [Distribution](docs/DISTRIBUTION.md)

## License

Apache 2.0 — see LICENSE file.
