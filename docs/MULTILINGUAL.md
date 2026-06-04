# ECHO Core — Multilingual Support

ECHO Core supports multiple languages through **language packs**, **configurable detection**, and **cross-lingual search** via shared embedding spaces.

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

Embedding models like `text-embedding-3-large` map multiple languages into a shared vector space. This means:

- A **Russian query** can match **English documents** via embeddings.
- L2 rerank applies a language boost (`+0.3`) when query language == document language.
- Cross-lingual search can be disabled:

```yaml
search:
  crossLingual:
    enabled: false
```

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
