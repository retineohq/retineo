# ECHO Core — Troubleshooting

Common issues and fixes for audio/video adapters and external dependencies.

---

## Audio/Video Adapters

### `WHISPER_API_KEY not set`

**Cause:** The audio or video adapter needs an OpenAI API key to call the Whisper transcription API.

**Fix:**

```bash
export WHISPER_API_KEY="sk-..."
# or reuse your OpenAI key
export OPENAI_API_KEY="sk-..."
```

Persist in ECHO secrets:

```bash
echo key set openai sk-...
```

---

### `Audio file too large (26MB > 25MB)`

**Cause:** OpenAI Whisper API has a 25 MB file size limit.

**Fix:**

- Split the audio into smaller chunks before ingestion.
- Use the `whisper.cpp` fallback (configure `whisperCppModel` in adapter config).
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

Run `echo doctor` to verify all external tools:

```bash
echo doctor
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
