# Retineo

Retineo is a local-first knowledge compilation engine that converts documents
into normalized, structured, summarized, and searchable layers. It currently
implements an L0–L3 pipeline, content-addressed storage, retrieval APIs, and a
collection health analyzer.

## Why Retineo

Organizations accumulate documents, but lose the relationships between them. A
meeting note, a pricing analysis, and a support report may describe the same
underlying decision without referencing each other. Traditional search can find
similar words; it does not preserve or explain the chain that connects them.

Retineo is exploring how to represent and discover relationships between pieces
of knowledge. Its current Core focuses on making documents reliably structured
and searchable first.

## What Retineo does

Retineo is not merely a semantic search front end. It compiles each source into
layered artifacts with structural links between document segments:

| Area | Current implementation |
|---|---|
| Ingestion | Markdown, text, PDF, image, audio, and video adapters |
| L0 | Normalized text and metadata |
| L1 | Headings, sections, chunk anchors, and line ranges |
| L2 | LLM-generated summary, concepts, entities, claims, and concept relations |
| L3 | HNSW vector index and BM25 keyword index with hybrid retrieval |
| Storage | Immutable SHA-256 CAS, SQLite registry, job queue, and build manifests |
| Similarity | Document-level semantic and exact similarity modes |
| Health | Coverage, duplicates, orphans, ghosts, and knowledge-age findings |
| Interfaces | CLI, local HTTP bridge, MCP server, and Node.js runtime API |

The pipeline is dependency-light but not cloud-free by default: L1/L2/L3 use a
configured LLM and embedding provider, such as a local Ollama model. Audio and
video adapters have additional optional external dependencies.

## A small example

```text
report.pdf
  → L0 normalized text
  → L1 heading and chunk outline
  → L2 summary, concepts, claims
  → L3 vector + keyword index
  → searchable result with citation
```

The layers preserve structure and provenance instead of reducing the document
to a flat text blob. This makes chunk-level citations, navigation, similarity
search, and health analysis possible.

## Current implementation

- L0–L3 compilation and background queue processing
- Local-first CAS and SQLite persistence
- CLI, HTTP bridge, MCP, and programmatic Node.js runtime
- Semantic, keyword, hybrid, and document-similarity retrieval
- Ghost recovery for deleted or modified sources
- Health analysis for orphaned, duplicate, or aged documents

Automatic typed relationship discovery, graph traversal, and L4–L9 features are
not part of the current Core.

## Quick start

Requires Node.js 20+.

```bash
# Install
npm install -g @retineo/core

# Configure models and data directory
retineo init

# Optional: check local dependencies
retineo doctor

# Ingest and wait for compilation
retineo ingest ./notes --watch

# Search
retineo search "pricing objections"

# Find similar documents using a content hash
retineo similar <contentHash>

# Analyze collection health
retineo health ./notes

# Inspect jobs and status
retineo status
retineo jobs
```

For source checkout:

```bash
pnpm install
pnpm build
pnpm test
node bin/retineo.js --help
```

Detailed setup is in [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) and
[docs/INSTALL.md](docs/INSTALL.md).

## Architecture

The full pipeline, storage layout, retrieval design, and module map are in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Experiments / Research

Retineo also explores how relationships between documents can be represented,
analyzed, and eventually discovered. Some supporting data structures and
similarity/health tools exist today; typed cross-document relationship
discovery remains experimental research.

See [docs/EXPERIMENTS.md](docs/EXPERIMENTS.md) for the implemented foundations,
open questions, and non-goals.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Getting Started](docs/GETTING_STARTED.md)
- [Installation](docs/INSTALL.md)
- [CLI](docs/CLI.md)
- [HTTP API](docs/API.md)
- [Programmatic API](docs/API.md#programmatic-api)
- [MCP](docs/MCP.md)
- [Experiments & Research](docs/EXPERIMENTS.md)
- [Repository Structure](structure.md)
- [Contributing](CONTRIBUTING.md)

## Roadmap

See [ROADMAP.md](ROADMAP.md) for planned work, commercial ecosystem notes, and
release status. Future items are not current capabilities.

## License

Apache 2.0 — see [LICENSE](LICENSE).
