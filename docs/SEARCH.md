# RETINEO Core — Search & Retrieval Guide

This document covers the search pipeline, configuration, and customization of the retrieval system introduced in **Phase 4**.

---

## Overview

The search pipeline transforms a user query into an assembled context ready for LLM consumption:

```
User Query
  ↓
QueryAnalyzer        (language detection, intent classification, enrichment)
  ↓
RetrievalService     (L3 semantic → L2 rerank → L1/L0 cascade)
  ↓
ContextAssembler     (token budgets, citations, drill-down)
  ↓
AssembledContext
```

---

## Configuration

All search behavior is controlled via `~/.retineo/config.yaml` under the `search:` key.

### Example

```yaml
search:
  defaultLanguage: "en"
  languageDetection:
    provider: "franc"        # franc | cld3 | heuristic
    fallback: "heuristic"
    confidenceThreshold: 0.7

  semantic:
    topK: 100
    threshold: 0.75
    hybridWeight: 0.7        # 0.7 semantic + 0.3 keyword

  rerank:
    topK: 10
    weights:
      concept: 1.0
      claim: 0.5
      summary: 0.8
      language: 0.3

  cascade:
    budgets:
      vague: 500
      section: 800
      precision: 1500

  citations:
    format: "markdown"       # markdown | plain | json
    includeLineNumbers: true
    includeTimestamps: true

  prompts:
    intentClassification: |
      Classify the query intent...
    entityExtraction: |
      Extract key entities...
    contextAssembly: |
      Produce coherent context...

  crossLingual:
    enabled: true
    translateQuery: "llm"      # none | llm
    targetLanguages: ["en"]    # bridge query entities into these languages
```

### Prompt Override Rules

1. If `config.search.prompts.{name}` exists → **use it**.
2. If the active language pack has the prompt → **use it**.
3. Otherwise → use the **built-in default** (minimal hardcoded fallback).

This means third-party developers can override prompts without touching source code.

---

## Query Analyzer

### Language Detection

Three providers are supported:

| Provider | Description | When to use |
|----------|-------------|-------------|
| `franc` | Lightweight, 100+ languages (npm `franc`). | Default. Best balance of speed and coverage. |
| `cld3` | Google Compact Language Detector. | More accurate, but heavier optional dependency. |
| `heuristic` | Script-based regex (Cyrillic, CJK, Arabic, etc.). | Zero dependencies. Fast fallback. |

If confidence is below `confidenceThreshold`, the system falls back to `defaultLanguage`.

### Intent Classification

| Intent | Trigger | Search behavior |
|--------|---------|-----------------|
| **VAGUE** | "Tell me about X" | Broad semantic search, L2 summaries only, single-document focus |
| **SECTION** | "What did we discuss about pricing?" | Section anchor search, L1 outline included |
| **PRECISION** | "What was the exact objection on line 45?" | Exact match, L0 chunks with line ranges |

Fast **rule-based** classification runs first (<1ms). If no rule matches and an `LLMProvider` is available, an LLM call classifies the intent.

### Query Enrichment

- **Pronoun resolution**: "What did **he** say?" → resolves to last entity from session context.
- **Entity injection**: Extracted entities are appended as weighted keywords.
- **Cross-lingual entity translation**: For non-English queries, entities are translated into English (when `crossLingual.translateQuery` is `llm` and an LLM provider is configured) and appended as `[en: ...]`. This bridges the query into the English `conceptsEn` BM25 tokens.
- **Temporal signals**: "last week", "Q2 2026" → captured as `QuerySignal` (filters are future work).

---

## Retrieval Service

### L3 Semantic Search

Loads the `hnsw.bin` index (built from `index/embeddings.jsonl` by `DefaultL3Generator`) and performs **HNSW approximate nearest neighbor search**. Distance is converted to similarity (`score = 1 - distance`).

The index is loaded or built automatically when `DefaultRetrievalService` starts. New vectors are added to the index immediately after each successful `GENERATE_L3` job.

### Hybrid Mode

Combines semantic scores with BM25 keyword scores:

```
score = 0.7 * semantic + 0.3 * keyword
```

Weights are configurable via `search.semantic.hybridWeight`.

### L2 Rerank

Scores top-K candidates by:

- **Concept overlap**: +1.0 per matching concept (matches both `concepts` and `conceptsEn`)
- **Claim match**: +0.5 per claim containing query terms
- **Summary similarity**: keyword overlap with summary
- **Language match**: +0.3 if document language matches query language (only applied when `language` is known)

Weights are fully configurable via `search.rerank.weights`.

### L1/L0 Cascade

Based on intent, deeper artifacts are loaded:

| Intent | Loaded levels | Approx. tokens |
|--------|--------------|----------------|
| VAGUE | L2 summary | ~500 |
| SECTION | L2 + L1 outline | ~800 |
| PRECISION | L2 + L1 + L0 exact chunks | ~1500 |

---

## Context Assembler

### Token Budget Allocation

The assembler respects per-intent budgets and an overall `maxTokens` cap:

```
VAGUE:    L2 base = 500
SECTION:  L2 base = 500 + L1 fractal = 800
PRECISION: L2 base = 500 + L1 fractal = 800 + L0 precision = 512
```

All values are configurable.

### Citation Generation

Every segment includes a citation:

- **Markdown**: `[[hash#lines-45-120|filename.md]]`
- **Plain**: `filename.md lines 45-120`
- **JSON**: structured object

Configure via `search.citations.format`.

### Drill-Down

Set `includeChildren: true` when assembling to get a hierarchical segment tree:

```typescript
const ctx = await assembler.assemble(query, candidates, { includeChildren: true });
// ctx.segments[0].children → L1 segments
// ctx.segments[0].children[0].children → L0 segments
```

---

## API Reference

### QueryAnalyzer

```typescript
export interface QueryAnalyzer {
  analyze(query: string, sessionContext?: SessionContext): Promise<AnalyzedQuery>;
}
```

### RetrievalService

```typescript
export interface RetrievalService {
  search(query: AnalyzedQuery, options?: SearchOptions): Promise<RetrievalResult>;
}
```

### ContextAssembler

```typescript
export interface ContextAssembler {
  assemble(
    query: AnalyzedQuery,
    candidates: CandidateNode[],
    options?: { maxTokens?: number; includeChildren?: boolean }
  ): Promise<AssembledContext>;
}
```

---

## Adding a Custom Prompt

Create `custom-prompts.yaml`:

```yaml
search:
  prompts:
    intentClassification: |
      You are a legal assistant. Classify the query as BROAD, CASE, or STATUTE.
      Query: {query}
      Respond with JSON: {"intent": "..."}
```

Reference it in `~/.retineo/config.yaml` by merging or replacing the `search.prompts` section. No source code changes required.
