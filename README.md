# Retineo Core

<p align="center">
  <strong>Find meaning across documents — not just keywords.</strong><br>
  A local-first engine that turns any source (PDF, Markdown, audio, images) into a searchable, structured knowledge layer.<br>
  <em>Search finds words. Retineo finds meaning.</em>
</p>

<p align="center">
  <a href="https://github.com/retineohq/retineo/actions"><img src="https://img.shields.io/badge/tests-458%20passing-brightgreen" alt="Tests"></a>
  <a href="https://www.npmjs.com/package/@retineo/core"><img src="https://img.shields.io/npm/v/@retineo/core" alt="npm"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="License"></a>
</p>

**Version:** 0.6.2  
**Status:** Production-ready — 462 tests passing

---

## 30-Second Demo

```bash
# 1. Ingest documents
retineo ingest ./research-papers/
retineo ingest ./meeting-notes/

# 2. Search by meaning — not keywords
retineo search "cognitive overload in user onboarding"

# 3. Retineo surfaces relevant passages across all documents
┌─────────────────────────────────────────────────────────────┐
│  Results (sorted by semantic relevance)                     │
│                                                             │
│  📄 research-papers/cognitive-load-2024.pdf                 │
│     "Users experience decision paralysis when presented     │
│      with more than 7 options during first interaction"     │
│     Relevance: 0.94                                         │
│                                                             │
│  📄 meeting-notes/product-sync-jan.md                       │
│     "Activation funnel: 68% drop-off at step 3 —            │
│      'too many choices' cited as reason"                    │
│     Relevance: 0.91                                         │
│                                                             │
│  📄 support-tickets/bug-442.md                              │
│     "Customer reports: 'I don't know where to start'"       │
│     Relevance: 0.87                                         │
└─────────────────────────────────────────────────────────────┘
```

> **Same underlying idea. Three different documents. Found by meaning, not by matching words.**

---

## What Retineo Core Does (L0–L3)

Retineo Core is the **open-source foundation** of the Retineo ecosystem. It compiles raw information into structured, searchable layers:

| Level | What it creates | What you can do with it |
|---|---|---|
| **L0** | Normalized text from any source (PDF, MD, images, audio, video) | Ingest anything |
| **L1** | Structural outline: headings, sections, chunk anchors, line ranges | Navigate documents precisely |
| **L2** | Semantic essence: summary, key concepts, claims | Grasp a document without reading it fully |
| **L3** | Vector embeddings + hybrid index (HNSW + BM25) | **Search by meaning across all documents** |

**L3 is where "finding meaning" happens.** You ask a question in natural language. Retineo returns the most semantically relevant passages — even if they use completely different words than your query.

---

## What Comes Next (L4–L9)

L0–L3 is the **foundation**. The Retineo ecosystem builds deeper layers on top:

| Layer | Capability | Available In |
|---|---|---|
| **L4** | Auto-discovered themes and semantic links between documents | Retineo for Obsidian (Pro) |
| **L5–L6** | Curated projects and organizational pattern detection | Retineo Team |
| **L7–L9** | Contradiction detection, strategic archetypes, industry positioning | Retineo Enterprise |

**Core gives you the engine. The ecosystem gives you the depth.**

- **Developers / AI builders:** Use Core directly via CLI, npm, or MCP.
- **Knowledge workers:** Try [Retineo for Obsidian](https://github.com/retineohq/retineo-obsidian) — free L0–L2, Pro trial unlocks L3+.
- **Teams:** [Retineo Team](https://retineo.dev) (Docker) and [Enterprise](https://retineo.dev) coming soon.

---

## Install

```bash
# Global install
npm install -g @retineo/core

# Or try without installing
npx @retineo/core status

# Or download a standalone binary
# See docs/INSTALL.md for macOS, Linux, and Windows binaries
```

**Requirements:** Node.js 18+, 500MB RAM, any CPU. No GPU. No cloud required. No data leaves your machine.

---

## Quick Start

```bash
# Initialize workspace
retineo init

# Ingest anything — single file or entire directory
retineo ingest ./my-knowledge-base/

# Search by meaning
retineo search "why did our Q3 strategy fail"

# Find semantically similar documents by content hash
retineo similar <contentHash>

# Diagnostic memory health report
retineo health ./my-notes

# Check compilation status
retineo status
```

The `retineo health` command syncs a directory, analyzes coverage, duplicates, orphans, ghosts, and knowledge age, then prints a JSON report with a 0–100 score and concrete findings referencing specific content hashes.

See [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) for the full walkthrough.

---

## Programmatic API

You can also embed Core directly in a Node.js application instead of spawning CLI processes:

```ts
import { createCore } from '@retineo/core';

const core = await createCore({ dataDir: '/path/to/.retineo' });

await core.ingest('/vault');                       // → IngestResult
const report = await core.health();                // → HealthReport
const docs = await core.listDocuments();           // → DocumentSummary[]
const similar = await core.findSimilar(hash, { topK: 5, threshold: 0.8 }); // → SimilarDocument[]
const node = await core.getNode(hash);             // → NodeArtifacts | null
await core.close();                                // release DB handles, workers, HNSW
```

`createCore` accepts:

- `dataDir` — required path for CAS, SQLite registry, indexes, and config.
- `config` — optional config overrides (same shape as `config.yaml`).
- `logger` — optional Pino-compatible logger.

The runtime API wires together the same internal services the CLI uses, so storage formats and behavior are identical. No separate worker process is required; pending L1/L2/L3 jobs are drained automatically after each `ingest` call.

See [docs/API.md](docs/API.md#programmatic-api) for the full `CoreHandle` reference.

---

## Why Retineo Core?

### The Problem
You have thousands of documents. Search works when you know the exact word. But:

- The sales call transcript and the research paper describe the **same problem** using different words.
- The meeting note from March and the support ticket from June mention the **same unmet need** — but no one connects them.
- You know the answer is **somewhere** in your files. You just can't find it.

### The Solution (L0–L3)
Retineo Core reads everything you give it, understands meaning, and lets you search across it naturally:

- Ask *"competitive threats we ignored in 2023"* — get relevant passages even if the word "threat" never appears.
- Ask *"why users drop off"* — find the customer interview, the support ticket, and the product note that all touch the same idea.
- **Not keyword matching. Semantic similarity.**

---

## Use Cases for Core

| Audience | What You Have | What Core Does |
|---|---|---|
| **Solo Researcher** | 10,000 notes, papers, bookmarks | Search across all of them by meaning. Find the paper you forgot you had. |
| **Consultant** | Client reports, transcripts, research | Surface relevant past work for new engagements — even if filed under different names. |
| **Startup Founder** | Interviews, tickets, meeting notes | Search across all sources to find evidence for a specific hypothesis. |
| **Developer** | Documentation, code, API specs | Embed semantic search into your own tool via MCP or REST API. |

---

## Architecture

Retineo is a **compiler**, not a RAG wrapper. Like `gcc` turns `.c` → `.o` → `.elf`, Retineo turns raw sources into a chain of compiled artifacts:

```
PDF / MD / Audio / Image
        ↓
    [L0] Normalized text + metadata
        ↓
    [L1] Structural outline (headings, chunks, line ranges)
        ↓
    [L2] Semantic essence (summary, concepts, claims)
        ↓
    [L3] Vector index + keyword index (HNSW + BM25)
        ↓
    Search by meaning
```

**Key principles:**
- **Content-Addressable Storage (CAS):** SHA-256 primary keys. Immutable artifacts.
- **Reproducible builds:** Every node carries a `build.json` with generator versions and timestamps.
- **Fractal nodes:** Each segment is a self-similar `ContextNode` with its own L0–L3 pipeline.
- **SQLite Registry:** Mutable metadata, job queue, and audit logs.
- **Adapter IPC:** Built-in adapters run as isolated child processes with JSON-RPC 2.0.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full technical design.

---

## Integrations

Built to be embedded:

- **MCP (Model Context Protocol):** Expose your knowledge base to any MCP-compatible agent. Tools: `echo_search`, `echo_add_note`, `echo_inspect`, `retineo_find_similar`.
- **HTTP Bridge:** Local REST API on `localhost:37891` for scripts, browser extensions, and chatbots. API-key auth, localhost-only by default.
- **REST API:** Full CRUD for nodes, search, annotations, batch operations, and document similarity.
- **Obsidian Plugin:** The fastest way to experience Retineo. [Retineo for Obsidian](https://github.com/retineohq/retineo-obsidian) → freemium plugin with L0–L2 free, L3+ on Pro trial.

---

## Performance

| Metric | Result |
|---|---|
| Search latency (10K docs) | **< 50 ms** |
| Search latency (100K docs) | **< 100 ms** |
| Compilation pipeline | **~25 s per document** |
| Test coverage | **458 tests passing** |
| Binary size | **< 15 MB** |
| Memory footprint | **< 500 MB** |

Runs entirely on your machine. No cloud round-trips. No data leaves your device.

---

## Ecosystem

| Product | What | Audience | Status |
|---|---|---|---|
| **Retineo Core** (`@retineo/core`) | Open-source engine, npm + CLI | Developers, AI builders | ✅ Production-ready |
| **Retineo for Obsidian** | Plugin for Obsidian.md | Researchers, writers, knowledge workers | ✅ Ready |
| **Retineo Team** | Docker Compose stack (5–50 people) | Startups, agencies, research teams | 🚧 Coming soon |
| **Retineo Enterprise** | Kubernetes, on-premise, air-gapped | Regulated industries, large orgs | 🚧 Pilot requests open |

- **Organization:** [github.com/retineohq](https://github.com/retineohq)
- **Learn:** [echo-memory.com](https://echo-memory.com) — *The Connection Discovery Handbook* (educational hub)
- **Product:** [retineo.dev](https://retineo.dev)

---

## Early Adopter Program

Retineo Core is **free and open-source** (Apache 2.0) forever. Use it, fork it, embed it.

The **Obsidian Plugin** runs a Pro trial for early adopters while we build payment infrastructure:

| Contribution | Pro Trial Extension |
|---|---|
| Bug report with reproduction steps | +30 days |
| Merged PR to Core or Plugin | +90 days |
| Quality UX feedback (video or detailed write-up) | +30 days |
| Synthetic demo vault (150+ docs) | +60 days |
| Translation of documentation | +30 days |

**Request:** Open a GitHub Issue with the `activation-request` label. Reviewed within 48 hours.

**Founding Member status:** Install within the first 30 days of public release and get a lifetime 50% discount when paid tiers launch.

---

## Community & Roadmap

- 💬 **Discord:** [discord.gg/retineo](https://discord.gg/retineo) coming soon
- 🗺️ **Roadmap:** See [ROADMAP.md](ROADMAP.md) for L4–L9 features and upcoming releases
- 🤝 **Contributing:** See [CONTRIBUTING.md](CONTRIBUTING.md)
- 🐦 **Updates:** Follow [@retineohq](https://x.com/retineohq) on X

---

## License

Apache 2.0 — see [LICENSE](LICENSE).

Copyright © 2026 Valery Kot

---

<p align="center">
  <em>Search finds words. Retineo finds meaning.</em>
</p>
