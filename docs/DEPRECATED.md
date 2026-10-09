# Deprecated Documentation

> Документы в этой папке описывают предыдущую архитектуру Retineo Core
> (document → chunks → embeddings → retrieval), которая была полностью
> заменена на Memory Core (см. `docs/semantic-model/`).
>
> **Статус:** deprecated. Не поддерживаются. Содержание историческое.
>
> **Актуальная документация:** `docs/semantic-model/` и `structure.md`.

## Deprecated files

| Файл | Что описывал | Замена |
|---|---|---|
| `ARCHITECTURE.md` | L0–L3 pipeline architecture | `docs/semantic-model/phase6-domain-model.md` |
| `API.md` | HTTP Bridge API (старое ядро) | `packages/memory-core/src/api/http-server.ts` |
| `CLI.md` | retineo CLI команды | `packages/memory-core/bin/memory-core.js --help` |
| `MCP.md` | MCP tools (старое ядро) | `packages/memory-core/src/api/mcp-server.ts` |
| `SEARCH.md` | BM25/semantic/hybrid retrieval | `docs/semantic-model/phase4-retrieval-experiment.md` |
| `LLM_PROVIDERS.md` | LLM provider factory (старое ядро) | `packages/memory-core/src/ports/extraction.ts` (port) |
| `MULTILINGUAL.md` | Language packs | `docs/semantic-model/ROADMAP-DETAIL.md` §4 |
| `ADAPTER_GUIDE.md` | Third-party adapters (старое ядро) | `packages/memory-core/src/ports/repositories.ts` (ports) |
| `SECURITY.md` | Security model (старое ядро) | handoff #40, инварианты M11–M13 |
| `INSTALL.md`, `DISTRIBUTION.md`, `GETTING_STARTED.md`, `OPERATIONS.md`, `LOGGING.md`, `HEALTH.md`, `PERFORMANCE.md`, `TROUBLESHOOTING.md`, `CONTRIBUTING.md`, `README.md` | Инфраструктура старого ядра | — |
| `CHANGELOG.md` | История версий старого ядра | git history |
| `EXPERIMENTS.md` | Эксперименты старого ядра | `docs/semantic-model/` |
| `ROADMAP.md` (root) | Roadmap старого ядра | `docs/semantic-model/ROADMAP-DETAIL.md` |
| `PROGRESS.md` (root) | Progress v0.1.1 → v0.2.0 | git history |
| `HANDOFF.md` (root) | Handoff v0.5.1 | `/home/ryzen/MY_Brand/FROM_GPT/HANDOFF_Q.md` |
