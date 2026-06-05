# ECHO Core CLI Guide

## Installation

```bash
npm install -g echo-core
# or run locally:
node bin/echo-core.js <command>
```

> `echo-core` is also available as an alias for `echoc`.

## Commands

### `echoc ingest <filePath>`

Ingest a file into the knowledge base.

```bash
echoc ingest ./notes.md
echoc ingest ./doc.pdf --adapter pdf
```

### `echoc search <query>`

Search the knowledge base.

```bash
echoc search "machine learning"
echoc search "deep learning" --language en --mode hybrid --top-k 10 --json
```

### `echoc status`

Show engine status.

```bash
echoc status
```

### `echoc compile [filePath]`

Compile pending jobs or a specific file.

```bash
echoc compile
echoc compile ./notes.md --layer l2
```

### `echoc config [key] [value]`

Read or write config values.

```bash
echoc config
echoc config search.defaultLanguage
echoc config search.defaultLanguage ru
```

### `echoc jobs`

List recent jobs.

```bash
echoc jobs
```

### `echoc recover <hash>`

Recover an orphaned node.

```bash
echoc recover deadbeef...
```

### `echoc key set <provider> <apiKey>`

Encrypt and store an API key in `~/.echo/secrets.json`.

```bash
echoc key set openai sk-xxxxxxxx
```

### `echoc key get <provider>`

Show a masked version of the stored key.

```bash
echoc key get openai
# openai: sk-x...xxxx
```

### `echoc key delete <provider>`

Remove a stored key.

```bash
echoc key delete openai
```

### `echoc key list`

List all stored keys (masked).

```bash
echoc key list
```
