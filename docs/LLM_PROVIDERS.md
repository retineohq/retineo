# Writing Custom LLM Providers for ECHO Core

This guide teaches you how to write an LLM or embedding provider — a TypeScript class that ECHO Core loads from `config.yaml` to power L2 generation and L3 indexing.

By the end of this guide you will understand the provider interface, the factory loading mechanism, rate limiting, and how to test your provider without running the full ECHO Core stack.

---

## 1. What Is a Provider?

A provider is a **TypeScript class** that implements `LLMProvider` and/or `EmbeddingProvider`. ECHO Core instantiates providers from `config.yaml` at startup. Unlike adapters, providers are **not child processes** — they are lightweight in-memory objects that make HTTP calls to external APIs.

Key principles:
- **Output must be deterministic where possible.** Same input → same output makes testing and caching easier.
- **HTTP errors are your responsibility.** Timeouts, retries, and rate limiting are handled by ECHO Core, but you must throw clear error messages.
- **Keep it stateless.** Providers are singletons per config entry. Do not store per-request state in instance fields.

---

## 2. Quick Start

Create a provider file:

```typescript
// my-provider.ts
import type { LLMProvider, EmbeddingProvider, ProviderConfig, GenerateOptions, ProviderCapabilities } from 'echo-core/llm';

export class MyProvider implements LLMProvider, EmbeddingProvider {
  readonly id: string;
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.id = config.id;
    this.config = config;
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: options?.temperature ?? this.config.temperature ?? 0.3,
      }),
    });
    if (!res.ok) throw new Error(`MyProvider failed: ${res.status}`);
    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices[0].message.content;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const res = await fetch(`${this.config.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({ model: this.config.model, input: texts }),
    });
    if (!res.ok) throw new Error(`MyProvider embed failed: ${res.status}`);
    const data = await res.json() as { data: Array<{ embedding: number[] }> };
    return data.data.map((d) => d.embedding);
  }

  async validate(): Promise<boolean> {
    try {
      const res = await fetch(`${this.config.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.config.apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  capabilities(): ProviderCapabilities {
    return {
      supportsStreaming: false,
      supportsJsonMode: true,
      maxContextLength: 128000,
    };
  }

  dimension(): number {
    return (this.config.dimension as number | undefined) ?? 1536;
  }
}
```

Register it in `config.yaml`:

```yaml
llm:
  defaultProvider: my-provider
  providers:
    - id: my-provider
      type: my-provider
      baseUrl: https://api.example.com/v1
      apiKey: ${MY_API_KEY}
      model: gpt-4o
      temperature: 0.3
      maxTokens: 4096
      concurrency: 5
      timeoutMs: 30000
```

Then register it with the factory at runtime:

```typescript
import { DefaultLLMProviderFactory } from 'echo-core/llm';
import { MyProvider } from './my-provider.js';

const factory = new DefaultLLMProviderFactory();
factory.register('my-provider', new MyProvider({ id: 'my-provider', type: 'my-provider', model: 'gpt-4o' }));
```

---

## 3. Provider Interface Reference

### `LLMProvider`

| Method | Returns | Description |
|--------|---------|-------------|
| `generate(prompt, options?)` | `Promise<string>` | Generate a text completion. |
| `stream?(prompt, options?)` | `AsyncIterable<string>` | Optional streaming completion. |
| `validate()` | `Promise<boolean>` | Ping the API to verify connectivity. |
| `capabilities()` | `ProviderCapabilities` | Declare streaming, JSON mode, and context length. |

### `EmbeddingProvider`

| Method | Returns | Description |
|--------|---------|-------------|
| `embed(texts)` | `Promise<number[][]>` | Generate embeddings for a batch of texts. |
| `validate()` | `Promise<boolean>` | Ping the API to verify connectivity. |
| `dimension()` | `number` | Return the vector dimension (e.g., 1536, 4096). |

### `ProviderConfig`

```typescript
interface ProviderConfig {
  id: string;           // unique identifier
  type: string;         // factory lookup key
  baseUrl?: string;     // API base URL
  apiKey?: string;      // API key (supports ${ENV_VAR})
  model: string;        // model name
  temperature?: number;
  maxTokens?: number;
  concurrency?: number; // max parallel requests
  timeoutMs?: number;
  [key: string]: unknown; // extra provider-specific fields
}
```

---

## 4. Factory Loading

ECHO Core resolves `${ENV_VAR}` syntax in `apiKey` and `baseUrl` at load time. The factory uses the `type` field to instantiate the correct class:

| `type` | Built-in Class |
|--------|---------------|
| `ollama` | `OllamaProvider` |
| `openai-compatible` | `OpenAICompatibleProvider` |
| `mock` | `MockLLMProvider` |

To add a custom type, extend the factory:

```typescript
class MyLLMFactory extends DefaultLLMProviderFactory {
  protected createProvider(config: ProviderConfig): LLMProvider {
    if (config.type === 'my-provider') return new MyProvider(config);
    return super.createProvider(config);
  }
}
```

---

## 5. Rate Limiting

The factory automatically registers each provider with a `SemaphoreRateLimiter`. You do not need to implement rate limiting in your provider. The factory calls `acquire(providerId)` before each request and `release(providerId)` after.

If you need custom rate limiting (e.g., token bucket), implement `RateLimiter`:

```typescript
import type { RateLimiter } from 'echo-core/llm';

export class TokenBucketLimiter implements RateLimiter {
  acquire(providerId: string): Promise<void> { /* ... */ }
  release(providerId: string): void { /* ... */ }
}
```

---

## 6. Testing Your Provider

You do not need ECHO Core running to test your provider. Use any HTTP mocking library:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { MyProvider } from './my-provider.js';

describe('MyProvider', () => {
  it('generates text', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Hello' } }] }),
    });

    const p = new MyProvider({ id: 'test', type: 'my-provider', model: 'm' });
    const text = await p.generate('hi');
    expect(text).toBe('Hello');
  });
});
```

For deterministic tests without network, use `MockLLMProvider`:

```typescript
import { MockLLMProvider } from 'echo-core/llm';

const mock = new MockLLMProvider({ id: 'mock', type: 'mock', model: 'm' });
const json = await mock.generate('prompt', { jsonMode: true });
```

---

## 7. Error Handling

Throw descriptive errors. ECHO Core catches them and marks the job as failed for retry:

```typescript
if (!res.ok) {
  const body = await res.text();
  throw new Error(`MyProvider ${res.status}: ${body}`);
}
```

Standard patterns:
- `400` → malformed request (do not retry)
- `401/403` → auth error (do not retry)
- `429` → rate limited (will retry after lease expiry)
- `5xx` → server error (will retry)
- `ETIMEDOUT` / `ECONNREFUSED` → will retry

---

## 8. Summary Checklist

Before using your provider in production, verify:

- [ ] Implements `LLMProvider` and/or `EmbeddingProvider`
- [ ] `generate()` returns a string (or throws)
- [ ] `embed()` returns `number[][]` with consistent `dimension()`
- [ ] `validate()` returns `true` when API is reachable
- [ ] `capabilities()` accurately reports `maxContextLength`
- [ ] Errors are thrown as `Error` with descriptive messages
- [ ] `config.yaml` entry has correct `type`, `model`, and `id`
- [ ] Tests pass without real API calls (mock `fetch`)

---

## Further Reading

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — How providers fit into the L0–L3 pipeline
- [`structure.md`](../structure.md) — Codebase navigation and module map
- `packages/core/src/llm/provider.ts` — Provider interfaces
- `packages/core/src/llm/factory.ts` — Factory and config resolution
- `packages/core/src/llm/providers/` — Built-in provider implementations
