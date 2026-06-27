# RETINEO Core — Multilingual Support

RETINEO Core supports multiple languages through **language packs**, **configurable detection**, and **cross-lingual search** via shared embedding spaces.

---

## Built-in Language Packs

| Code | Name | File |
|------|------|------|
| `en` | English | `src/i18n/packs/en.ts` |
| `ru` | Русский | `src/i18n/packs/ru.ts` |
| `zh` | 中文 | `src/i18n/packs/zh.ts` |

Each pack contains:

- **Prompt templates** in the target language (intent classification, entity extraction, L2 generation, context assembly)
- **Search tuning** (threshold, keyword/semantic boost)
- **Script regex** for heuristic fallback detection

---

## Language Detection

Three detectors are available:

| Detector | Package | Accuracy | Speed | Notes |
|----------|---------|----------|-------|-------|
| `HeuristicDetector` | None | Low | Fastest | Script-based regex fallback |
| `FrancDetector` | `franc` | Medium | Fast | Default. 100+ languages. |
| `CLD3Detector` | `cld3` | High | Medium | Optional heavy dependency. |

Configure in `config.yaml`:

```yaml
search:
  languageDetection:
    provider: "franc"
    fallback: "heuristic"
    confidenceThreshold: 0.7
```

If detection confidence is below the threshold, the system uses `search.defaultLanguage`.

---

## Cross-Lingual Search

RETINEO combines two cross-lingual mechanisms:

1. **Shared embedding space** — embedding models like `nomic-embed-text` map multiple languages into the same vector space, so a Russian query can match an English document semantically.
2. **Keyword bridge** — every L2 artifact stores both the original `concepts` and an English translation `conceptsEn`. The BM25 index contains both sets of tokens, and non-English queries have their entities translated into English before keyword matching.

This means:

- A **Russian query** can match **English documents** via embeddings *and* via English concept tokens.
- A **Russian query** can match **Russian documents** via Cyrillic tokens.
- L2 rerank applies a language boost (`+0.3`) when query language == document language, so same-language results rank higher.
- Cross-lingual search can be disabled or tuned:

```yaml
search:
  crossLingual:
    enabled: true
    translateQuery: "llm"          # none | llm
    targetLanguages: ["en"]        # languages to bridge into
```

### How it works in practice

For a document written in Russian:

- L2 generator detects `language: ru` and emits both `concepts` (`["нейросети", "глубокое обучение"]`) and `conceptsEn` (`["neural networks", "deep learning"]`).
- L3 generator writes both Cyrillic and English tokens into `index/bm25.json`.
- A query such as `нейросети` matches directly; a query such as `neural networks` matches via `conceptsEn`.

### Re-indexing after enabling cross-lingual search

Existing indexes do **not** contain `language` or `conceptsEn`. To upgrade an existing collection:

```bash
retineo compile --rebuild-l2
```

This deletes all cached `L2.json` artifacts, re-queues `GENERATE_L2` jobs for every source, and regenerates L3 indexes. Run the worker if needed (`retineo daemon start` or `retineo worker`) to process the jobs.

---

## Adding a New Language

### 1. Create the pack

Create `src/i18n/packs/{code}.ts`:

```typescript
import type { LanguagePack } from '../language-pack.js';

export const dePack: LanguagePack = {
  code: 'de',
  name: 'Deutsch',
  prompts: {
    intentClassification: `Klassifiziere die Absicht...`,
    entityExtraction: `Extrahiere Entitäten...`,
    l2Generation: `Erstelle eine semantische Zusammenfassung...`,
    contextAssembly: `Erstelle einen zusammenhängenden Kontext...`,
  },
  search: {
    defaultThreshold: 0.75,
    keywordBoost: 1.0,
    semanticBoost: 1.0,
  },
  scriptRegex: /[äöüß]/,
};
```

### 2. Register the pack

In `src/i18n/registry.ts`, add:

```typescript
import { dePack } from './packs/de.js';

// In constructor:
this.register(dePack);
```

### 3. (Optional) Override via config

```yaml
i18n:
  defaultLanguage: "de"
  packs:
    - code: "de"
      prompts:
        intentClassification: "Custom German prompt..."
```

No core source code changes are required for prompt overrides — only for registering new packs.

---

## Prompt Translation Checklist

When translating prompts for a new language:

1. **Keep JSON output format identical** — the parser expects `"intent"`, `"entities"`, etc.
2. **Preserve placeholders** — `{query}`, `{language}`, `{maxTokens}`, `{results}` must remain.
3. **Match tone to use case** — legal, medical, or technical domains may need formal registers.
4. **Test with real queries** — heuristic detection and rule-based intent may need language-specific patterns.

---

## Per-Language Search Tuning

| Language | Default Threshold | Keyword Boost | Rationale |
|----------|-------------------|---------------|-----------|
| English | 0.75 | 1.0 | Baseline |
| Russian | 0.72 | 1.1 | Rich morphology benefits from keyword loosening |
| Chinese | 0.70 | 1.2 | No spaces → higher keyword boost needed |

Adjust these in the language pack or override via `config.yaml`.
