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
