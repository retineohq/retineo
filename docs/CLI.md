# ECHO Core CLI Guide

## Installation

```bash
npm install -g echo-core
# or run locally:
node bin/echo.js <command>
```

## Commands

### `echo ingest <filePath>`

Ingest a file into the knowledge base.

```bash
echo ingest ./notes.md
echo ingest ./doc.pdf --adapter pdf
```

### `echo search <query>`

Search the knowledge base.

```bash
echo search "machine learning"
echo search "deep learning" --language en --mode hybrid --top-k 10 --json
```

### `echo status`

Show engine status.

```bash
echo status
```

### `echo compile [filePath]`

Compile pending jobs or a specific file.

```bash
echo compile
echo compile ./notes.md --layer l2
```

### `echo config [key] [value]`

Read or write config values.

```bash
echo config
echo config search.defaultLanguage
echo config search.defaultLanguage ru
```

### `echo jobs`

List recent jobs.

```bash
echo jobs
```

### `echo recover <hash>`

Recover an orphaned node.

```bash
echo recover deadbeef...
```

### `echo key set <provider> <apiKey>`

Encrypt and store an API key in `~/.echo/secrets.json`.

```bash
echo key set openai sk-xxxxxxxx
```

### `echo key get <provider>`

Show a masked version of the stored key.

```bash
echo key get openai
# openai: sk-x...xxxx
```

### `echo key delete <provider>`

Remove a stored key.

```bash
echo key delete openai
```

### `echo key list`

List all stored keys (masked).

```bash
echo key list
```
