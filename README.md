# Retineo Memory Core

Retineo Memory Core is a persistent epistemic memory engine. It maintains
explicit, provenance-backed knowledge — objects, claims, relationships, and
contexts — with temporal state, support state, and immutable evidence.

Retrieval serves memory. Memory does not exist merely to serve retrieval.

## Core idea

The old model:

```
documents → chunks → indexes → retrieval → context reconstruction
```

The new model:

```
sources → evidence → candidates → decisions → policies → memory
                                                          │
                                        ┌─────────────────┼─────────────────┐
                                        ▼                 ▼                 ▼
                                     indexes           segments          agents
                                  (rebuildable)      (portable)      (context pkgs)
```

Search finds where to enter memory. Memory contains what the organization
knows, what it does not know, and why.

> **Migration note:** If you previously used `@retineo/core` (0.x), this is
> the same project — renamed, redesigned and rewritten on new ports.
> New package name: **`@retineo/memory-core`**. The old package will be
> deprecated after the 1.0 release; see `docs/PUBLISHING.md`.

## What it does

| Capability | Description |
|---|---|
| **Evidence** | Immutable, hash-addressed. Untrusted sources quarantined |
| **Objects** | Typed entities with identity, merge via tombstone + redirect |
| **Claims** | subject + predicate + value with temporal state, support, confidence, scope |
| **Relationships** | First-class, typed (supersedes, contradicts, caused_by, ...) |
| **Contexts** | First-class, nested, overlapping, membership by reference |
| **Knowledge gaps** | Explicit representation of unknowns |
| **Provenance** | Every authoritative assertion traces to evidence |
| **Journal** | Atomic, every mutation has an event |
| **Segments** | Portable, signed, verifiable, expiring |
| **Extraction** | Evidence → Candidates → Decision → Policy → Memory |
| **Retrieval** | Essence → entry points; Claims → knowledge; Multi-hop → context |

## Quick start

```bash
# Start HTTP API server (port 7900)
npx memory-core serve

# Ingest text files from a directory
npx memory-core ingest ./docs

# Query memory
npx memory-core query entry-points "PostgreSQL database"
npx memory-core query knowledge "primary database"
npx memory-core query context "obj:postgresql"

# Start MCP server (stdio)
npx memory-core mcp
```

## Invariants

20 mandatory invariants (M1–M20) are exhaustively tested. See
`docs/semantic-model/phase6-domain-model.md` for the full list.

## API surface (0.7.0)

**SDK**

```ts
import { MemoryCore, createSqliteAdapter } from '@retineo/memory-core';
```

**REST (Fastify)** — `/health`, `/objects`, `/claims`, `/relationships`,
`/contexts` (+ memberships, agent-context), `/candidates`, `/decisions`,
`/extract` (OpenRouter/Ollama), `/segments`, `/query/*`, `/replication/events`,
`/journal`.

**CLI**

```bash
memory-core serve [dbFile] [port]              # HTTP server
STORAGE=postgres DATABASE_URL=... memory-core serve   # Postgres backend
memory-core ingest <dir> [dbFile]
memory-core extract-async <ev> <content> ollama|openrouter [dbFile]
memory-core replicate-pull <sourceUrl> [dbFile]   # REPLICATION_TOKEN optional
memory-core mcp [dbFile]
```

**Environment**

| Variable | Purpose |
|---|---|
| `STORAGE` | `sqlite` (default) or `postgres` |
| `DATABASE_URL` | Postgres connection string |
| `OPENROUTER_API_KEY` | OpenRouter extraction |
| `OPENROUTER_EXTRACTION_MODEL` | default `openai/gpt-4o-mini` |
| `OLLAMA_BASE_URL` / `OLLAMA_EXTRACTION_MODEL` | default `127.0.0.1:11434` / `qwen2.5:3b` |
| `OLLAMA_EMBEDDING_MODEL` | default `nomic-embed-text` |
| `REPLICATION_TOKEN` | Bearer token for `/replication/events` |

## Development

```bash
npm install
npm run build
npm test
npm run validate
```

## Documentation

- `docs/semantic-model/` — experiment artifacts (Phase 1–6), detailed roadmap, working conventions
- `docs/semantic-model/STATUS.md` — current status snapshot
- `CHANGELOG.md` — release history (v0.7.0)
- `docs/PUBLISHING.md` — how this package is published and how the legacy package is deprecated
- `structure.md` — repository structure and cross-reference index

## License

See `LICENSE`.
