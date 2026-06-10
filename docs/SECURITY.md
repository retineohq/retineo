# RETINEO Core — Security

## Secrets Management

API keys and sensitive configuration must not be stored in plain `config.yaml`.

### `SecretsManager` Interface

```typescript
interface SecretsManager {
  set(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | undefined>;
  delete(key: string): Promise<void>;
  list(): Promise<string[]>;
}
```

### `FileSecretsManager`

- Stores secrets in `~/.retineo/secrets.json`.
- Encrypted with **AES-256-GCM** via `node:crypto`.
- Encryption key derived from:
  1. `RETINEO_MASTER_KEY` environment variable (preferred).
  2. Machine-specific salt + hostname/username fallback (MVP convenience, not for production).

### CLI Commands

```bash
# Store an API key (encrypted)
retineo key set openai sk-xxxxxxxx

# View masked key
retineo key get openai
# openai: sk-x...xxxx

# List all keys (masked)
retineo key list

# Remove a key
retineo key delete openai
```

### Config Resolution Order

When a provider config contains `${OPENAI_API_KEY}`:

1. Check environment variable `OPENAI_API_KEY`.
2. Check secrets manager (`~/.retineo/secrets.json`).
3. If neither found → throw `CONFIG_SECRET_NOT_FOUND` on provider initialization.

### Example Config

```yaml
llm:
  providers:
    - id: openai
      type: openai-compatible
      model: gpt-4o-mini
      apiKey: ${OPENAI_API_KEY}
```

## Error Handling

All errors use the `RetineoError` hierarchy with standardized codes:

| Code | Status | Meaning |
|------|--------|---------|
| `ADAPTER_SPAWN_FAILED` | 500 | Adapter process could not start |
| `INGEST_CAS_WRITE_FAILED` | 500 | CAS filesystem error |
| `LLM_TIMEOUT` | 504 | LLM provider did not respond |
| `LLM_CIRCUIT_OPEN` | 503 | Circuit breaker is open |
| `SEARCH_EMPTY` | 404 | No search results |
| `CONFIG_SECRET_NOT_FOUND` | 400 | Required secret missing |
| `BRIDGE_SHUTDOWN` | 503 | Service is shutting down |

HTTP responses include structured JSON:

```json
{
  "error": {
    "code": "LLM_CIRCUIT_OPEN",
    "message": "LLM provider circuit breaker open: openai",
    "details": { "providerId": "openai" }
  }
}
```

## Recommendations

- Set `RETINEO_MASTER_KEY` in production. Do not rely on machine-derived keys.
- Restrict `~/.retineo/` directory permissions to `0700`.
- Rotate secrets regularly.
- Use separate API keys per environment (dev/staging/prod).
