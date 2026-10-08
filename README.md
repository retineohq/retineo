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
- `structure.md` — repository structure and cross-reference index

## License

See `LICENSE`.
