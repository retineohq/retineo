# RETINEO Core — Troubleshooting

Common issues and fixes for audio/video adapters and external dependencies.

---

## Audio/Video Adapters

### No local transcription engine found (error 5004)

**Cause:** Neither whisper.cpp nor a Whisper API key is available.

**Fix — Option A: Install whisper.cpp (recommended, local-first)**

```bash
mkdir -p ~/.retineo/bin ~/.retineo/models/whisper
wget https://github.com/ggerganov/whisper.cpp/releases/download/v1.6.0/whisper-cli-linux-x64
chmod +x whisper-cli-linux-x64
mv whisper-cli-linux-x64 ~/.retineo/bin/whisper-cli
wget https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
mv ggml-base.bin ~/.retineo/models/whisper/
```

**Fix — Option B: Use cloud fallback**

```bash
export WHISPER_API_KEY="sk-..."
# or
export OPENAI_API_KEY="sk-..."
```

---

### whisper.cpp model not found (error 5005)

**Cause:** `whisper-cli` is installed but no GGML model file was found in `~/.retineo/models/whisper/`.

**Fix:**

```bash
mkdir -p ~/.retineo/models/whisper
wget https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
mv ggml-base.bin ~/.retineo/models/whisper/
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

Persist in RETINEO secrets:

```bash
retineo key set openai sk-...
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

Run `retineo doctor` to verify all external tools:

```bash
retineo doctor
```

Expected output when healthy:

```
RETINEO Core Dependency Check
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
| Jobs stuck in `PENDING` forever | No worker is running | `retineo worker status` → if stopped, `retineo worker start` (or use `retineo daemon start` for bridge+worker) |
| `retineo ingest` returns but no L1/L2/L3 generated | Worker is not draining the queue | Same as above. For a one-shot run, use `retineo ingest file.md --watch` — it starts an inline worker |
| `worker.start` exits immediately | Missing `pnpm build` step | Run `pnpm build` so `dist/cli/worker-script.js` exists |
| `daemon.start` exits immediately | Same as above | `pnpm build` first |
| L2 shows `"Mock summary for prompt hash..."` | `compile --watch` used inline worker without loading real providers from config | Verify `retineo worker status` shows running; or run `retineo daemon start` first; or re-run `retineo init` to ensure config has real provider |
| `LLM provider not configured` error | No providers loaded from config | Run `retineo init` to create `~/.retineo/config.yaml` with Ollama or cloud provider |
| `Provider 'xxx' not found` error | `--provider` flag specifies id not in config | Check `retineo config get llm.providers` for available ids |
| `--non-interactive requires --llm-model and --embed-model` | Missing required flags | Pass both flags: `retineo init --non-interactive --llm-model <model> --embed-model <model>` |
| `Ingest shows duplicate jobs` | Running an older version | Upgrade to v0.1.2+ where duplicate ingestion is fully skipped |

---

## Duplicate ingestion

**Symptom:** Running `retineo ingest same-file.md` twice creates duplicate rows in the `sources` table, or prints `Job ... queued for L1 generation` after `Skipped: already ingested`.

**Fix:** This is resolved in v0.1.2. Ingestion is now fully idempotent:
- Same content hash + same path → skipped with `Skipped: already ingested (hash: ...)` — **no jobs queued**
- Same content hash + different path → source path updated, no new jobs queued
- New content hash → full ingest + jobs queued as before

If you see duplicates or extra job lines from older versions, run `retineo doctor` to verify your install version.

---

## L3 jobs stuck in DEAD status

**Symptom:** After `retineo ingest`, L3 embedding jobs fail with `Ollama embed model not responding — check model settings and ensure Ollama is running`, retry 3 times, then become `DEAD`. `retineo status` shows `0 vectors` and the index is empty.

**Cause:** When Ollama is not ready (model not loaded in memory), the embedding request fails. The circuit breaker opens, retries happen instantly, and the job exhausts its attempts.

**Fix:**
1. Ensure Ollama is running and the embedding model is available:
   ```bash
   ollama list
   ollama pull nomic-embed-text
   ```
2. Restart the worker to reset the circuit breaker:
   ```bash
   retineo worker stop
   retineo worker start
   ```
3. Run `retineo compile` to re-queue dead L3 jobs and find any missing L3 work:
   ```bash
   retineo compile
   ```
4. If you started via daemon, restart the daemon instead:
   ```bash
   retineo daemon stop
   retineo daemon start
   ```

Starting in v0.1.1, the worker automatically resets all circuit breakers on startup, and `compile` recovers both dead L3 jobs and nodes that are missing L3 entirely.

---

## Recovering files from CAS

**Symptom:** `retineo recover <hash>` prints success but the file does not exist at the reported path, or you deleted a source file accidentally.

**Fix:** `retineo recover` now performs a full restore:
- Verifies the file at the registered path — if present and hash matches, prints `Already valid`.
- If missing, reads the normalized content (`content.md`) from the CAS object store and writes it back to the source path.
- If another copy exists at a different registered path, updates the registry to point there.
- If CAS content is missing (e.g., object store was cleaned), prints a clear error: `Recover failed: <hash> — content not found in CAS storage`.

If the registry entry itself is missing, `recover` reports `not found in registry`.

---

## Daemon lifecycle

**Symptom:** `retineo daemon stop` reports the daemon is not running even though it was started.

**Fix:** Starting in v0.1.1, the PID file is written immediately when `daemon start` spawns the process. If the daemon exits immediately (e.g., port conflict or missing build), the PID file is cleaned up and a clear error is shown. Check logs with `retineo daemon logs` to diagnose startup failures.

Graceful shutdown order on `daemon stop`: bridge → worker → registry. The stop command sends SIGTERM, waits up to 5 seconds, then sends SIGKILL if needed.
