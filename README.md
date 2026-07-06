# Retineo Core

[![npm version](https://img.shields.io/npm/v/@retineo/core)](https://www.npmjs.com/package/@retineo/core)
[![CI](https://github.com/retineohq/retineo/actions/workflows/ci.yml/badge.svg)](https://github.com/retineohq/retineo/actions)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

**Version:** 0.5.0  
**License:** Apache 2.0  
**Status:** Production-ready — 413 tests passing

## What is Retineo Core?

Retineo Core is a **fractal knowledge management engine** (L0–L3) that transforms any information source (text, PDF, audio, video, chats) into a hierarchical structure of compiled artifacts.

**Metaphor:** Not a RAG system, but a compiler. Like `gcc` turns `.c` into `.o` → `.elf`, Retineo turns raw source into a chain of artifacts: **L0 → L1 → L2 → L3**.

| Level | Artifact | Description |
|-------|----------|-------------|
| **L0** | `content.md` + `content.meta.json` | Normalized text + multimodal offsets (timestamps, speakers, OCR bbox) |
| **L1** | `L1.md` + `L1.index.json` | Structural outline: headings, sections, chunk anchors, line ranges |
| **L2** | `L2.json` | Semantic object: summary, concepts[], claims[], relations[] |
| **L3** | `embeddings.jsonl` + `hnsw.bin` + `bm25.json` | Vector index + keyword index |

## Install

```bash
npm install -g @retineo/core
```

Or try without installing:

```bash
npx @retineo/core status
```

See [docs/INSTALL.md](docs/INSTALL.md) for binary and source install options.

## Quick start

```bash
retineo init      # create ~/.retineo/ config
retineo status    # check engine status
retineo ingest ./my-document.pdf
retineo search "semantic search query"
```

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
- [CLI Guide](docs/CLI.md)
- [Adapter Guide](docs/ADAPTER_GUIDE.md)
- [Distribution](docs/DISTRIBUTION.md)

## Ecosystem

- **Organization:** [github.com/retineohq](https://github.com/retineohq)
- **Landing page:** [retineo.dev](https://retineo.dev) *(coming soon)*

## License

Apache 2.0 — see [LICENSE](LICENSE) file.

Copyright © 2026 Valery Kot
