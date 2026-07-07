# RETINEO Core — Installation Guide

## Prerequisites

| Requirement | Version                   | Notes                                                  |
| ----------- | ------------------------- | ------------------------------------------------------ |
| Node.js     | 20+                       | Required. Check with `node --version`                  |
| OS          | Linux, macOS, Windows WSL | Native Windows without WSL is not tested               |
| ffmpeg      | optional                  | Required for video adapter (audio extract + frames)    |
| Tesseract   | optional                  | For PDF/image OCR if not using built-in `tesseract.js` |
| whisper.cpp | optional                  | **Primary** audio/video transcription engine (local, offline) |
| Whisper API key | optional              | Cloud fallback for audio/video transcription (OpenAI Whisper) |

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
npm install -g @retineo/core
```

Or run without installing:

```bash
npx @retineo/core <command>
```

### Initialize RETINEO

After install, run the setup wizard to configure RETINEO Core:

```bash
retineo init
```

> `retineo` is also available as an alias for `retineo`.

What `init` does:

1. Detects Ollama on `localhost:11434` and lists installed models (or offers cloud/mock fallback)
2. Lets you pick an LLM model and an embedding model
3. Asks for a data directory (default `~/.retineo`) and bridge port (default `37891`)
4. Creates `~/.retineo/` directory structure (`objects/`, `index/`, `adapters/`, `models/`, `logs/`)
5. Writes `~/.retineo/config.yaml` with the `llm.providers[]` and `embedding.providers[]` sections
6. Initializes the SQLite database (`~/.retineo/retineo.sqlite`) with the schema
7. Optionally starts a background worker (`retineo worker start`)

For CI / scripts, use `retineo init --non-interactive` — it reads `RETINEO_DATA_DIR`, `RETINEO_LLM_MODEL`, `RETINEO_EMBED_MODEL`, `RETINEO_BRIDGE_PORT`, and `OLLAMA_BASE_URL` from the environment.

---

## Install from binary

Download a standalone binary from [GitHub Releases](https://github.com/your-org/retineo/releases) if you cannot install Node.js.

| Platform | Binary |
|----------|--------|
| Linux x64 | `retineo-linux-x64` |
| macOS x64 | `retineo-macos-x64` |
| Windows x64 | `retineo-win-x64.exe` |

> **Note:** Binaries are best-effort and may not support native dependencies (e.g., `better-sqlite3`). For full functionality, use npm install.

---

## Install from source

```bash
git clone https://github.com/your-org/retineo.git
cd retineo
pnpm install
pnpm build
pnpm test
```

Run locally:

```bash
node bin/retineo.js <command>
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

### whisper.cpp (recommended for audio/video adapters)

Local-first speech-to-text. Offline, free, private.

```bash
# Download whisper-cli binary
mkdir -p ~/.retineo/bin
wget https://github.com/ggerganov/whisper.cpp/releases/download/v1.6.0/whisper-cli-linux-x64
chmod +x whisper-cli-linux-x64
mv whisper-cli-linux-x64 ~/.retineo/bin/whisper-cli

# Download model (~500MB for base, good balance)
mkdir -p ~/.retineo/models/whisper
wget https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
mv ggml-base.bin ~/.retineo/models/whisper/

# Verify
retineo doctor
```

Without whisper.cpp, audio/video adapters will use the OpenAI API if a key is set, otherwise return empty content.

### Whisper API key (cloud fallback for audio/video adapters)

Only needed if whisper.cpp is not installed.

```bash
export WHISPER_API_KEY="sk-..."
# or
export OPENAI_API_KEY="sk-..."
```

Store persistently:

```bash
retineo key set openai $OPENAI_API_KEY
```

### Check all dependencies

```bash
retineo doctor
```

---

## First run

After `retineo init`, verify everything is wired up:

```bash
retineo worker status
retineo status
```

Expected output:

```json
{
  "version": "0.5.2",
  "nodeCount": 0,
  "sourceCount": 0,
  "jobCount": {"pending": 0, "running": 0, "completed": 0, "failed": 0},
  "indexStatus": {"vectorCount": 0, "lastIndexed": null}
}
```

Files created in `~/.retineo/`:

| File            | Purpose                        |
| --------------- | ------------------------------ |
| `config.yaml`   | User configuration             |
| `secrets.json`  | AES-256-GCM encrypted API keys |
| `data/objects/` | Content-Addressable Storage    |
| `data/index/`   | Search indexes                 |
| `retineo.sqlite`   | SQLite registry                |

---

## Configuration

View current config:

```bash
retineo config
```

Set data directory:

```bash
retineo config dataDir /path/to/data
```

Set default LLM provider:

```bash
retineo config llm.defaultProvider ollama
```

Edit `~/.retineo/config.yaml` directly for advanced options. See [`ARCHITECTURE.md`](ARCHITECTURE.md) for config reference.

---

## Troubleshooting

| Symptom                                 | Cause                                    | Fix                                                                                                     |
| --------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `Port 37891 is already in use`          | Another RETINEO instance running            | `kill` the old process or change `bridge.port` in config                                                |
| `SQLite database is locked`             | Concurrent access or crashed worker      | Wait 30s for lease expiry, or run `retineo recover`                                                        |
| `Adapter not found for .ext`            | No adapter registered for that extension | Check [`ADAPTER_GUIDE.md`](ADAPTER_GUIDE.md) or install the adapter                                     |
| `LLM provider timeout`                  | Provider unreachable or overloaded       | Check `llm.providers[].baseUrl`, increase `timeoutMs`, or verify API key with `retineo key get <provider>` |
| `CONFIG_SECRET_NOT_FOUND`               | Environment variable or secret missing   | Set with `retineo key set <provider> <key>` or export the env var                                          |
| `WHISPER_API_KEY not set`               | Missing Whisper API key                  | Set `WHISPER_API_KEY` or `OPENAI_API_KEY` env var, or run `retineo key set openai <key>`                  |
| `ffmpeg is required`                    | ffmpeg not installed                     | Install ffmpeg: `apt install ffmpeg` or `brew install ffmpeg`                                            |
| `Module not found` after source install | Forgot `pnpm build`                      | Run `pnpm build`                                                                                        |

For structured logging and health checks, see [`OPERATIONS.md`](OPERATIONS.md).
