# Contributing to RETINEO Core

Thank you for contributing. This guide covers setup, conventions, and the pull request process.

---

## Development Setup

```bash
git clone https://github.com/your-org/retineo.git
cd retineo
pnpm install
pnpm build
pnpm test
```

All 277 tests must pass before submitting.

---

## Project Structure

RETINEO Core is a monorepo. See [`structure.md`](../structure.md) for the complete file listing and cross-reference index.

```
packages/core/
├── src/
│   ├── domain/      # Types, Zod schemas
│   ├── adapters/    # Adapter IPC protocol
│   ├── storage/     # CAS, Registry, Config, SecretsManager
│   ├── search/      # Query analysis, retrieval, context assembly
│   ├── llm/         # Provider abstraction, factory, rate limiting
│   ├── layers/      # L1/L2/L3 compilation pipelines
│   ├── bridge/      # HTTP API, SSE, health, metrics
│   ├── mcp/         # Model Context Protocol server
│   ├── i18n/        # Language packs, detection
│   ├── cli/         # CLI commands and formatters
│   └── utils/       # Logger, shutdown, errors, cache
├── adapters/        # Built-in adapter scripts (CommonJS)
└── tests/           # Mirror of src/ — every module has tests
```

---

## Code Style

- **TypeScript strict mode** — no `any` without explicit justification
- **ESM only** — use `.js` extensions in imports
- **Zod for validation** — all runtime inputs validated against schemas
- **Structured logging** — use `createLogger` from `src/utils/logger.ts`. No `console.log` in production code
- **Error hierarchy** — throw `BaseRetineoError` subclasses, not raw `Error`

Example:

```typescript
import { createLogger } from '../utils/logger.js';
import { IngestError } from '../utils/errors.js';

const logger = createLogger({ name: 'ingestion' });

// Good
logger.info({ sourceId, filePath }, 'Ingestion started');

// Bad
console.log('Ingestion started', filePath);
```

---

## Testing

We use **vitest**.

```bash
pnpm test              # Run all tests
pnpm test --watch      # Watch mode
pnpm test --coverage   # Coverage report
```

Coverage expectations:
- New code: **≥80%** line coverage
- Bug fixes: add a regression test
- Refactors: ensure existing tests still pass

Test file naming: `tests/{module}/{feature}.test.ts`

---

## Pull Request Process

1. Branch from `dev`:
   ```bash
   git checkout dev
   git pull origin dev
   git checkout -b feature/your-feature
   ```
2. Make changes
3. Update `structure.md` in the same commit if you add/remove files or change public API
4. Ensure `pnpm test` passes
5. Push and open PR against `dev`

PRs without passing tests or without `structure.md` updates will be blocked.

---

## Adding an Adapter

See [`ADAPTER_GUIDE.md`](ADAPTER_GUIDE.md) for the full protocol and format specification.

Quick checklist:
1. Create directory: `adapters/{id}/`
2. Add `manifest.json` and `adapter.js`
3. Add tests in `tests/adapters/{id}.test.ts`
4. Update `structure.md` adapter table

---

## Adding a Provider

See [`LLM_PROVIDERS.md`](LLM_PROVIDERS.md) for the interface and factory mechanism.

Quick checklist:
1. Implement `LLMProvider` and/or `EmbeddingProvider` in `src/llm/providers/{id}.ts`
2. Register in `DefaultLLMProviderFactory.createProvider`
3. Add tests in `tests/llm/providers/{id}.test.ts`
4. Update `structure.md` provider table

---

## Documentation

Update relevant docs when changing public API:

| Change | Update |
|--------|--------|
| New CLI command | `docs/CLI.md` |
| New HTTP endpoint | `docs/API.md` |
| New adapter | `docs/ADAPTER_GUIDE.md` built-in table |
| New provider type | `docs/LLM_PROVIDERS.md` factory table |
| New config key | `docs/ARCHITECTURE.md` config section |
| New language pack | `docs/MULTILINGUAL.md` built-in table |
| File structure change | `structure.md` |

Link between documents instead of duplicating content.
