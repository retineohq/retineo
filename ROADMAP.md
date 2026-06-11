# Retineo Roadmap

> **Last updated:** June 2026
>
> This document describes the public evolution of Retineo. It is a living document — updated as milestones are reached and priorities shift.

---

## Philosophy

Retineo is built in layers. Each layer is a complete, usable system on its own. You do not need L4–L9 to get value from L0–L3.

- **L0–L3** (Retineo Core): Open-source, local-first, free forever. This is the foundation.
- **L4–L9**: Commercial layers that build on the foundation. Available in Retineo for Obsidian (Pro), Retineo Team, and Retineo Enterprise.

We ship each layer when it is solid — not before. The timeline below reflects what we are building, not what we are promising.

---

## Current Status

| Layer | Status | Where |
|---|---|---|
| **L0** Content Ingestion | ✅ Production | Retineo Core + Obsidian Plugin |
| **L1** Structural Outline | ✅ Production | Retineo Core + Obsidian Plugin |
| **L2** Semantic Essence | ✅ Production | Retineo Core + Obsidian Plugin |
| **L3** Semantic Search | ✅ Production | Retineo Core + Obsidian Plugin (Pro trial) |
| **L4** Semantic Links | ✅ Production | Retineo for Obsidian (Pro) |
| **L5** Curated Themes | 🚧 In Development | Retineo for Obsidian (Pro) / Team |
| **L6** Organizational Patterns | 🚧 In Development | Retineo Team |
| **L7** Derived Philosophy | 📋 Planned | Retineo Team / Enterprise |
| **L8** Strategic Archetypes | 📋 Planned | Retineo Enterprise |
| **L9** Industry Position | 📋 Planned | Retineo Enterprise |

---

## Completed

### Phase 1 — Foundation (L0–L3)

**Released:** May–June 2026

- ✅ Content-addressable storage (SHA-256 CAS)
- ✅ Multi-source ingestion: Markdown, PDF, TXT, images (OCR), audio (transcription), video
- ✅ L1 structural generation: headings, sections, chunk anchors, line ranges
- ✅ L2 semantic essence: summary, key concepts, claims, relations
- ✅ L3 hybrid search: HNSW vector index + BM25 keyword index
- ✅ CLI: `retineo init`, `ingest`, `search`, `status`, `recover`
- ✅ HTTP API + MCP tools (`echo_search`, `echo_add_note`, `echo_inspect`)
- ✅ 408 tests passing, production-ready

### Phase 2 — Chat & Conversational Memory

**Released:** April–May 2026

- ✅ Chat interface with streaming responses
- ✅ Conversational memory (30-min TTL, entity extraction, pronoun resolution)
- ✅ Three retrieval pipelines: vague / section / precision
- ✅ Topic shift detection and sticky anchors
- ✅ Forced Context Mode (load specific document into chat)
- ✅ AI-generated content filtering at retrieval time
- ✅ Ghost system: L2 survival when source files are deleted

### Phase 3 — Obsidian Plugin (L0–L4)

**Released:** May–June 2026

- ✅ Full L0–L3 pipeline inside Obsidian
- ✅ Chat UI with citations and L2 essence previews
- ✅ Ghost badge and L2 recovery in chat
- ✅ Semantic links (L4): auto-detected connections written to frontmatter YAML
- ✅ Annotations (L7–L9): chunk-anchored insights with hover preview
- ✅ Settings V2: unified LLM profiles, provider assignments, optional encryption
- ✅ 6 LLM providers: Anthropic, OpenRouter, OpenAI, DeepSeek, Ollama, Custom OpenAI

---

## In Development

### Phase 4 — Semantic Graph & Curation (L4–L6)

**Target:** Q3 2026

- 🚧 **L4 Semantic Graph v2:** HNSW-based neighbor detection → semantic link suggestions with user acceptance UI
- 🚧 **L5 Curated Themes:** HDBSCAN clustering on L3 vectors + LLM-generated theme names from aggregated L2 essences
- 🚧 **L6 Organizational Patterns:** Cross-department contradiction detection, decision pattern extraction
- 🚧 **Property Graph Storage:** JSON adjacency lists (MVP) → optional Neo4j (Enterprise)
- 🚧 **Graph Traversal API:** `traverse-up` (L0→L9), `project-context` (layer slicing), `contradiction-detect`

### Phase 5 — Multi-Agent & Federation

**Target:** Q4 2026

- 🚧 **Agentic Router:** Adaptive retrieval depth based on query complexity
- 🚧 **FileAgent:** Autonomous file organization, tagging, and linking
- 🚧 **ChatAgent:** Persistent conversational agent with long-term memory
- 🚧 **Coordinator:** Multi-agent orchestration with conflict resolution
- 🚧 **Federation:** Cross-vault and cross-instance knowledge sharing (Team/Enterprise)

---

## Planned

### Phase 6 — Advanced Layers (L7–L9)

**Target:** 2027

- 📋 **L7 Derived Philosophy:** Data-driven extraction of organizational principles from accumulated L2 essences
- 📋 **L8 Strategic Archetypes:** Pattern recognition of decision constraints and strategic blind spots
- 📋 **L9 Industry Position:** External benchmarking and competitive positioning analysis
- 📋 **Enterprise Compliance:** SOC2, GDPR, EU AI Act alignment
- 📋 **Air-gapped Deployment:** Fully offline Enterprise installations

### Phase 7 — Platform Expansion

**Target:** 2027+

- 📋 **Browser Extension:** Chrome/Firefox plugin for web content ingestion
- 📋 **Mobile Companion:** Read-only access to L2 essences and search
- 📋 **Third-party Integrations:** Slack, Notion, Confluence adapters
- 📋 **Marketplace:** Community adapters, themes, and annotation packs

---

## Open Core vs. Commercial

| Feature | Retineo Core (Open Source) | Retineo for Obsidian (Pro) | Retineo Team | Retineo Enterprise |
|---|---|---|---|---|
| L0–L3 Pipeline | ✅ Free forever | ✅ Free + Pro trial | ✅ Included | ✅ Included |
| L3 Semantic Search | ✅ Unlimited | ✅ Unlimited (Pro) | ✅ Unlimited | ✅ Unlimited |
| L4 Semantic Links | ❌ | ✅ Pro | ✅ Included | ✅ Included |
| L5 Curated Themes | ❌ | 🚧 Coming | ✅ Included | ✅ Included |
| L6 Org Patterns | ❌ | ❌ | 🚧 Coming | ✅ Included |
| L7–L9 | ❌ | ❌ | 📋 Planned | 📋 Planned |
| Multi-user | ❌ | ❌ | ✅ 5–50 seats | ✅ Unlimited |
| On-premise | ✅ Self-hosted | ✅ Local only | ✅ Docker | ✅ Kubernetes / Air-gapped |
| Support | Community | Community | Email | Dedicated |

---

## How to Influence This Roadmap

We build in public — but we prioritize based on real user needs, not feature requests alone.

### Ways to contribute:

1. **Use it.** Install Retineo Core or the Obsidian Plugin. Report what works and what doesn't.
2. **Share your use case.** Open a GitHub Discussion with your workflow. If 10 people have the same problem, it moves up the roadmap.
3. **Build on it.** Create an adapter, integration, or demo vault. Tag it with `#retineo` — we feature the best ones.
4. **Contribute code.** See [CONTRIBUTING.md](CONTRIBUTING.md). We accept PRs for Core and Plugin.
5. **Request a pilot.** For Team or Enterprise features, email `pilot@retineo.dev`. Real organizational use cases directly shape L5–L9 priorities.

### What we do NOT do:

- ❌ We do not add features to Core that belong in commercial layers (L4–L9 stays in the ecosystem).
- ❌ We do not commit to dates we cannot meet. "Target" means "we are actively building this," not "we promise it by this date."
- ❌ We do not build for hypothetical users. Every feature on this roadmap is backed by at least one real use case.

---

## Version History

| Date | Milestone |
|---|---|
| 2026-03 | L0–L2 generation pipeline complete |
| 2026-04 | Chat UI with citations and ghost system |
| 2026-05 | L3 hybrid search production-ready |
| 2026-06 | Retineo Core 0.2.0 published, 408 tests, Apache 2.0 |
| 2026-06 | Retineo for Obsidian plugin public release |
| 2026-Q3 | L4–L6 semantic graph and curation (target) |
| 2026-Q4 | Multi-agent router and federation (target) |
| 2027 | L7–L9 advanced layers (planned) |

---

<p align="center">
  <em>Built in layers. Shipped when solid.</em>
</p>
