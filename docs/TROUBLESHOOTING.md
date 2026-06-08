# ECHO Core — Troubleshooting

Common issues and fixes for audio/video adapters and external dependencies.

---

## Audio/Video Adapters

### No local transcription engine found (error 5004)

**Cause:** Neither whisper.cpp nor a Whisper API key is available.

**Fix — Option A: Install whisper.cpp (recommended, local-first)**

```bash
mkdir -p ~/.echo/bin ~/.echo/models/whisper
wget https://github.com/ggerganov/whisper.cpp/releases/download/v1.6.0/whisper-cli-linux-x64
chmod +x whisper-cli-linux-x64
mv whisper-cli-linux-x64 ~/.echo/bin/whisper-cli
wget https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
mv ggml-base.bin ~/.echo/models/whisper/
```

**Fix — Option B: Use cloud fallback**

```bash
export WHISPER_API_KEY="sk-..."
# or
export OPENAI_API_KEY="sk-..."
```

---

### whisper.cpp model not found (error 5005)

**Cause:** `whisper-cli` is installed but no GGML model file was found in `~/.echo/models/whisper/`.

**Fix:**

```bash
mkdir -p ~/.echo/models/whisper
wget https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
mv ggml-base.bin ~/.echo/models/whisper/
```

Or set `whisperCppModel` in your adapter config to an existing model path.

---

### `WHISPER_API_KEY not set`

**Cause:** The audio or video adapter needs an OpenAI API key to call the Whisper transcription API. This is only required if whisper.cpp is not installed.

**Fix:**

```bash
export WHISPER_API_KEY="sk-..."
# or reuse your OpenAI key
export OPENAI_API_KEY="sk-..."
```

Persist in ECHO secrets:

```bash
echoc key set openai sk-...
```

---

### `Audio file too large (26MB > 25MB)`

**Cause:** OpenAI Whisper API has a 25 MB file size limit.

**Fix:**

- Split the audio into smaller chunks before ingestion.
- Use whisper.cpp local transcription (no file size limit).
- Compress the audio to a lower bitrate before sending.

---

### `ffmpeg is required for video processing`

**Cause:** The video adapter uses ffmpeg to extract the audio track and key frames.

**Fix:**

```bash
# Ubuntu/Debian
sudo apt-get install ffmpeg

# macOS
brew install ffmpeg

# Verify
ffmpeg -version
```

---

### Video has no audio track

**Behavior:** The video adapter will fall back to frame-only processing. You will see `frame` blocks with timestamps but no `speech` blocks.

**Fix:** Not an error. If you expected audio, verify the file has an audio stream:

```bash
ffmpeg -i video.mp4 2>&1 | grep Audio
```

---

### Speaker labels are inaccurate

**Cause:** The MVP uses heuristic speaker diarization (pause > 2 seconds = possible speaker change). It is not true speaker recognition.

**Fix:** For production diarization, integrate `pyannote.audio` or Whisper API v2 in a custom adapter.

---

## Dependency Checks

Run `echoc doctor` to verify all external tools:

```bash
echoc doctor
```

Expected output when healthy:

```
ECHO Core Dependency Check
─────────────────────────
✓ Node.js v20.12.0
✓ ffmpeg (6.1.1)
✗ tesseract (optional)
✓ Whisper API key (set)
✗ Ollama (optional)
```

Exit code is `1` if any **critical** dependency is missing. Currently only Node.js is critical.

---

## General

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Adapter not found for .mp3` | `audio` adapter not loaded | Verify `packages/core/adapters/audio/` exists and `manifest.json` is valid |
| `Adapter not found for .mp4` | `video` adapter not loaded | Verify `packages/core/adapters/video/` exists and `manifest.json` is valid |
| Transcription is empty | Audio is silent or corrupted | Check file plays correctly; try re-encoding |
| Frame extraction fails | Corrupted video or missing codec | Re-encode with ffmpeg: `ffmpeg -i in.mp4 -c:v libx264 out.mp4` |
| Jobs stuck in `PENDING` forever | No worker is running | `echoc worker status` → if stopped, `echoc worker start` (or use `echoc daemon start` for bridge+worker) |
| `echoc ingest` returns but no L1/L2/L3 generated | Worker is not draining the queue | Same as above. For a one-shot run, use `echoc ingest file.md --watch` — it starts an inline worker |
| `worker.start` exits immediately | Missing `pnpm build` step | Run `pnpm build` so `dist/cli/worker-script.js` exists |
| `daemon.start` exits immediately | Same as above | `pnpm build` first |
| L2 shows `"Mock summary for prompt hash..."` | `compile --watch` used inline worker without loading real providers from config | Verify `echoc worker status` shows running; or run `echoc daemon start` first; or re-run `echoc init` to ensure config has real provider |
| `LLM provider not configured` error | No providers loaded from config | Run `echoc init` to create `~/.echo/config.yaml` with Ollama or cloud provider |
| `Provider 'xxx' not found` error | `--provider` flag specifies id not in config | Check `echoc config get llm.providers` for available ids |

---

## Duplicate ingestion

**Symptom:** Running `echoc ingest same-file.md` twice creates duplicate rows in the `sources` table.

**Fix:** This is resolved in v0.1.1. Ingestion is now idempotent:
- Same content hash + same path → skipped with `Skipped: already ingested`
- Same content hash + different path → source path updated, no new jobs queued
- New content hash → full ingest + jobs queued as before

If you see duplicates from older versions, run `echoc doctor` to verify your install version.

---

## Recovering orphaned nodes

**Symptom:** `echoc recover <hash>` shows `unknown` or cannot find the original file path.

**Fix:** The `recover` command now queries the SQLite `sources` table by content hash to retrieve the original `sourcePath`. Ensure your registry database is intact at `~/.echo/echo.sqlite`. If the source was never registered (e.g., manual CAS insertion), `recover` will report `source path not found in registry`.

---

## Daemon lifecycle

**Symptom:** `echoc daemon stop` reports the daemon is not running even though it was started.

**Fix:** Starting in v0.1.1, the PID file is written immediately when `daemon start` spawns the process. If the daemon exits immediately (e.g., port conflict or missing build), the PID file is cleaned up and a clear error is shown. Check logs with `echoc daemon logs` to diagnose startup failures.

Graceful shutdown order on `daemon stop`: bridge → worker → registry. The stop command sends SIGTERM, waits up to 5 seconds, then sends SIGKILL if needed.
