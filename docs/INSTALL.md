# ECHO Core — Installation Guide

## Prerequisites

| Requirement | Version                   | Notes                                                  |
| ----------- | ------------------------- | ------------------------------------------------------ |
| Node.js     | 20+                       | Required. Check with `node --version`                  |
| OS          | Linux, macOS, Windows WSL | Native Windows without WSL is not tested               |
| ffmpeg      | optional                  | Required for video adapter (audio extract + frames)    |
| Tesseract   | optional                  | For PDF/image OCR if not using built-in `tesseract.js` |
| Whisper API key | optional              | Required for audio/video transcription (OpenAI Whisper) |

Install Node.js via [nodejs.org](https://nodejs.org/) or your package manager:

```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# macOS
brew install node

# Verify
node --version  # v20.x.x or higher
```

---

## Install via npm

```bash
npm install -g @echo/core
```

Or run without installing:

```bash
npx @echo/core <command>
```

### Initialize ECHO

```bash
echo init
```

What `init` does:

1. Creates `~/.echo/` directory
2. Writes default `config.yaml`
3. Checks for optional dependencies (ffmpeg, tesseract)
4. Verifies write permissions

---

## Install from binary

Download a standalone binary from [GitHub Releases](https://github.com/your-org/echo-core/releases) if you cannot install Node.js.

| Platform | Binary |
|----------|--------|
| Linux x64 | `echo-core-linux-x64` |
| macOS x64 | `echo-core-macos-x64` |
| Windows x64 | `echo-core-win-x64.exe` |

> **Note:** Binaries are best-effort and may not support native dependencies (e.g., `better-sqlite3`). For full functionality, use npm install.

---

## Install from source

```bash
git clone https://github.com/your-org/echo-core.git
cd echo-core
pnpm install
pnpm build
pnpm test
```

Run locally:

```bash
node bin/echo.js <command>
```

---

## Install optional dependencies

### ffmpeg (required for video adapter)

```bash
# Ubuntu/Debian
sudo apt-get install ffmpeg

# macOS
brew install ffmpeg

# Verify
ffmpeg -version
```

### Whisper API key (required for audio/video adapters)

```bash
export WHISPER_API_KEY="sk-..."
# or
export OPENAI_API_KEY="sk-..."
```

Store persistently:

```bash
echo key set openai $OPENAI_API_KEY
```

### Check all dependencies

```bash
echo doctor
```

---

## First run

```bash
echo status
```

Expected output:

```json
{
  "version": "0.1.0",
  "nodeCount": 0,
  "sourceCount": 0,
  "jobCount": {"pending": 0, "running": 0, "completed": 0, "failed": 0},
  "indexStatus": {"vectorCount": 0, "lastIndexed": null}
}
```

Files created in `~/.echo/`:

| File            | Purpose                        |
| --------------- | ------------------------------ |
| `config.yaml`   | User configuration             |
| `secrets.json`  | AES-256-GCM encrypted API keys |
| `data/objects/` | Content-Addressable Storage    |
| `data/index/`   | Search indexes                 |
| `echo.sqlite`   | SQLite registry                |

---

## Configuration

View current config:

```bash
echo config
```

Set data directory:

```bash
echo config dataDir /path/to/data
```

Set default LLM provider:

```bash
echo config llm.defaultProvider ollama
```

Edit `~/.echo/config.yaml` directly for advanced options. See [`ARCHITECTURE.md`](ARCHITECTURE.md) for config reference.

---

## Troubleshooting

| Symptom                                 | Cause                                    | Fix                                                                                                     |
| --------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `Port 37891 is already in use`          | Another ECHO instance running            | `kill` the old process or change `bridge.port` in config                                                |
| `SQLite database is locked`             | Concurrent access or crashed worker      | Wait 30s for lease expiry, or run `echo recover`                                                        |
| `Adapter not found for .ext`            | No adapter registered for that extension | Check [`ADAPTER_GUIDE.md`](ADAPTER_GUIDE.md) or install the adapter                                     |
| `LLM provider timeout`                  | Provider unreachable or overloaded       | Check `llm.providers[].baseUrl`, increase `timeoutMs`, or verify API key with `echo key get <provider>` |
| `CONFIG_SECRET_NOT_FOUND`               | Environment variable or secret missing   | Set with `echo key set <provider> <key>` or export the env var                                          |
| `WHISPER_API_KEY not set`               | Missing Whisper API key                  | Set `WHISPER_API_KEY` or `OPENAI_API_KEY` env var, or run `echo key set openai <key>`                  |
| `ffmpeg is required`                    | ffmpeg not installed                     | Install ffmpeg: `apt install ffmpeg` or `brew install ffmpeg`                                            |
| `Module not found` after source install | Forgot `pnpm build`                      | Run `pnpm build`                                                                                        |

For structured logging and health checks, see [`OPERATIONS.md`](OPERATIONS.md).
