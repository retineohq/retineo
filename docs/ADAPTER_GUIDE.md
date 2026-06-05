# Writing Custom Adapters for ECHO Core

This guide teaches you how to write an adapter — a small Node.js program that converts any file format into normalized text that ECHO Core can index, search, and compile.

By the end of this guide you will understand the adapter lifecycle, the JSON-RPC protocol, the ingest response format, and how to test your adapter without running the full ECHO Core stack.

---

## 1. What Is an Adapter?

An adapter is a **child process** that speaks **JSON-RPC 2.0** over **stdin/stdout**. ECHO Core spawns your adapter when it encounters a file your adapter claims to handle. Your adapter reads the file, extracts text and metadata, and returns a normalized representation. ECHO Core then stores that representation in its Content-Addressable Storage (CAS) and registers it in the SQLite registry.

Adapters are **stateless** and **short-lived**. ECHO Core spawns one, sends a single `ingest` request, and shuts it down. Do not assume your adapter stays running between files.

Key principles:
- **Output must be text** (or structured text). Binary data is not indexed.
- **Deterministic output is strongly preferred**. Same file → same output. This makes deduplication and idempotency work.
- **Heavy processing is your responsibility**. If you need Whisper, ffmpeg, or Tesseract, bundle them in your adapter. ECHO Core does not provide them.

---

## 2. Quick Start

Create a directory for your adapter with two files:

```
my-adapter/
├── manifest.json
└── adapter.js
```

### `adapter.js` — Minimal Template

```javascript
const readline = require('readline');
const fs = require('fs').promises;

const rl = readline.createInterface({ input: process.stdin });

rl.on('line', async (line) => {
  let req;
  try {
    req = JSON.parse(line);
  } catch {
    console.log(JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: { code: 2000, message: 'Parse error' }
    }));
    return;
  }

  let result;
  switch (req.method) {
    case 'initialize':
      result = { adapterId: 'my-adapter', version: '1.0.0' };
      break;
    case 'capabilities':
      result = { mimeTypes: ['application/x-myformat'], extensions: ['.myext'] };
      break;
    case 'ingest':
      result = await ingestFile(req.params.uri);
      break;
    case 'shutdown':
      rl.close();
      process.exit(0);
      break;
    default:
      console.log(JSON.stringify({
        jsonrpc: '2.0',
        id: req.id,
        error: { code: 1000, message: `Method not found: ${req.method}` }
      }));
      return;
  }

  console.log(JSON.stringify({ jsonrpc: '2.0', id: req.id, result }));
});

async function ingestFile(uri) {
  const content = await fs.readFile(uri, 'utf-8');

  return {
    content,
    metadata: {
      blocks: [
        { type: 'heading', offset: 0, length: content.length }
      ]
    }
  };
}
```

This template handles all four JSON-RPC methods, reads a file as UTF-8, and returns a single `heading` block covering the entire content. It is the smallest valid adapter.

---

## 3. Manifest Format

The `manifest.json` tells ECHO Core how to find and load your adapter.

```json
{
  "id": "my-adapter",
  "version": "1.0.0",
  "mimeTypes": ["application/x-myformat"],
  "extensions": [".myext"],
  "entry": "adapter.js",
  "status": "stable"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier. Use kebab-case. |
| `version` | Yes | SemVer string. |
| `mimeTypes` | Yes | Array of MIME types this adapter handles. |
| `extensions` | Yes | Array of file extensions (with leading dot). |
| `entry` | Yes | Path to the main script, relative to manifest directory. |
| `status` | No | `"stable"`, `"experimental"`, or `"mock"`. Defaults to `"stable"`. |

ECHO Core scans the adapters directory at startup. Every subdirectory containing a valid `manifest.json` becomes a loaded adapter.

---

## 4. JSON-RPC Methods

ECHO Core communicates with adapters using JSON-RPC 2.0 over line-delimited JSON (LDJSON). Each line on stdin is one request; each line on stdout is one response.

### `initialize`

Called immediately after spawn. Use this to set up working directories or load models.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "workDir": "/tmp/echo-work",
    "config": {}
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "adapterId": "my-adapter",
    "version": "1.0.0"
  }
}
```

If `initialize` fails, ECHO Core kills the process and reports the error upstream.

### `capabilities`

Called when ECHO Core needs to know what your adapter can handle. The response must match your manifest.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "capabilities"
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "mimeTypes": ["application/x-myformat"],
    "extensions": [".myext"]
  }
}
```

### `ingest`

The core method. ECHO Core sends the file URI (and optional mimeType) and expects normalized content back.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "ingest",
  "params": {
    "uri": "/path/to/file.myext",
    "mimeType": "application/x-myformat"
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": "Normalized markdown text...",
    "metadata": {
      "blocks": [
        { "type": "heading", "offset": 0, "length": 24 }
      ]
    },
    "segments": []
  }
}
```

The `ingest` method is where all your parsing logic lives. See Section 5 for the full response format.

### `shutdown`

Called before ECHO Core kills the process. Use this to flush buffers or release resources.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": "shutdown",
  "method": "shutdown",
  "params": { "graceful": true }
}
```

**Expected behavior:** Clean up and exit with code 0. ECHO Core will close stdin/stdout after a timeout even if you do not respond.

---

## 5. Ingest Response Format

The `ingest` response must be a `NormalizedContent` object with three fields:

### `content` (string)
The normalized text of the file. Use Markdown where it adds structure. For plain text formats, return the raw text. For binary formats (images, audio, video), return transcripts, descriptions, or extracted text.

### `metadata.blocks` (array)
An array of blocks that annotate regions of `content`. Each block has:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | Block type: `speech`, `frame`, `ocr`, `heading`, or custom. |
| `offset` | number | Yes | Character offset into `content`. |
| `length` | number | Yes | Character length of the annotated region. |
| `timestamp` | number | No | Milliseconds from start (audio/video only). |
| `speaker` | string | No | Speaker name (audio/video only). |
| `bbox` | `[x, y, w, h]` | No | Bounding box (image/video only). |
| `confidence` | number | No | 0.0–1.0 confidence score (OCR only). |

Blocks must be non-overlapping and sorted by `offset`.

### `segments` (optional array)
For large files, split the content into segments. Each segment becomes an independent `ContextNode` child of the root node.

```json
{
  "spanStart": 0,
  "spanEnd": 300000,
  "content": "Segment text...",
  "metadata": {
    "blocks": [
      { "type": "speech", "offset": 0, "length": 120, "timestamp": 0, "speaker": "Speaker A" }
    ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `spanStart` | number | Start of segment (char offset for text, ms for AV). |
| `spanEnd` | number | End of segment (same units as `spanStart`). |
| `content` | string | Text of this segment only. |
| `metadata.blocks` | array | Blocks local to this segment. |

Segment blocks use the same schema as root blocks, but their `offset` is relative to the segment `content`, not the root `content`.

---

## 6. Block Types Reference

ECHO Core recognizes these block types. Custom types are allowed and stored as-is in `content.meta.json`.

### `speech`
Used for audio and video transcripts.

```json
{
  "type": "speech",
  "offset": 0,
  "length": 120,
  "timestamp": 15000,
  "speaker": "Speaker A"
}
```

- `timestamp` — milliseconds from the start of the file.
- `speaker` — free-form string. Use consistent names within a file.

### `frame`
Used for video scene descriptions or key frames.

```json
{
  "type": "frame",
  "offset": 0,
  "length": 50,
  "timestamp": 0,
  "bbox": [0, 0, 1920, 1080]
}
```

- `timestamp` — milliseconds when this frame occurs.
- `bbox` — `[x, y, width, height]` in pixels. Use `[0, 0, w, h]` for full-frame descriptions.

### `ocr`
Used for text extracted from images.

```json
{
  "type": "ocr",
  "offset": 0,
  "length": 15,
  "bbox": [10, 20, 200, 30],
  "confidence": 0.98
}
```

- `bbox` — bounding box of the text region.
- `confidence` — OCR engine confidence, 0.0–1.0.

### `heading`
Used for document headings (markdown, HTML, PDF outlines).

```json
{
  "type": "heading",
  "offset": 0,
  "length": 24
}
```

No extra fields. Headings are the primary navigation anchors for L1 compilation.

### Custom Types

You may invent new types. ECHO Core will store them but will not apply special semantics unless you also teach the L1 compiler about them.

```json
{ "type": "cad-dimension", "offset": 0, "length": 20, "bbox": [100, 100, 50, 20] }
```

---

## 7. Segmentation Guide

Segmentation splits a large file into independently processable chunks. ECHO Core creates a parent `ContextNode` for the root and child nodes for each segment.

### When to Segment

| File Type | Segment Threshold | Rationale |
|-----------|-------------------|-----------|
| Text / Markdown | > 500 KB or > 10,000 lines | LLM context windows have limits |
| Audio | > 5 minutes | Transcript chunks fit retrieval better |
| Video | > 5 minutes | Scene + speech chunks per interval |
| Image | Never | Images are atomic |
| Binary / CAD | Per logical unit | One segment per drawing sheet |

### How to Segment

1. Decide your segment size (e.g., 5 minutes, 1000 lines).
2. Split `content` into an array of segment objects.
3. For each segment, provide `spanStart`, `spanEnd`, `content`, and `metadata.blocks`.
4. Keep segment blocks self-contained. Offsets are relative to the segment `content`.

### Example: 12-Minute Audio

```json
{
  "content": "[00:00:00] Speaker A: Hello...\n[00:05:00] Speaker B: Next...",
  "metadata": { "blocks": [...] },
  "segments": [
    {
      "spanStart": 0,
      "spanEnd": 300000,
      "content": "[00:00:00] Speaker A: Hello...",
      "metadata": { "blocks": [{ "type": "speech", "offset": 0, "length": 100, "timestamp": 0, "speaker": "Speaker A" }] }
    },
    {
      "spanStart": 300000,
      "spanEnd": 720000,
      "content": "[00:05:00] Speaker B: Next...",
      "metadata": { "blocks": [{ "type": "speech", "offset": 0, "length": 100, "timestamp": 300000, "speaker": "Speaker B" }] }
    }
  ]
}
```

ECHO Core handles `parentHash` linkage automatically. Your adapter only needs to emit segments.

---

## 8. Examples

### Example A: CAD Drawing Adapter

You want to index AutoCAD `.dwg` files. Your adapter:
1. Opens the file with a CAD parser (e.g., `dxf-parser` for DXF, or a custom binary reader).
2. Extracts dimension tables as Markdown tables.
3. Creates `ocr`-style blocks with `bbox` for each entity label.
4. Segments by drawing sheet (one segment per layout tab).

```json
{
  "content": "## Sheet A1\n\n| Entity | X | Y | Z |\n|--------|---|---|---|\n| P1 | 10 | 20 | 0 |",
  "metadata": {
    "blocks": [
      { "type": "heading", "offset": 0, "length": 12 },
      { "type": "ocr", "offset": 25, "length": 20, "bbox": [100, 100, 50, 20] }
    ]
  },
  "segments": [
    { "spanStart": 0, "spanEnd": 100, "content": "## Sheet A1\n...", "metadata": { "blocks": [...] } },
    { "spanStart": 100, "spanEnd": 200, "content": "## Sheet A2\n...", "metadata": { "blocks": [...] } }
  ]
}
```

### Example B: Email Archive Adapter

You want to index `.mbox` or `.eml` files. Your adapter:
1. Parses headers and body.
2. Returns the body text as `content`.
3. Creates `heading` blocks for subject lines.
4. Adds metadata blocks for attachments (type `attachment`, no extra fields required).

```json
{
  "content": "From: alice@example.com\nSubject: Q3 Report\n\nPlease find the attached report.",
  "metadata": {
    "blocks": [
      { "type": "heading", "offset": 0, "length": 28 },
      { "type": "attachment", "offset": 50, "length": 10 }
    ]
  }
}
```

### Example C: Biological Sequence Adapter

You want to index `.fasta` files. Your adapter:
1. Parses sequence IDs and sequences.
2. Converts each sequence into a Markdown code block.
3. Segments by chromosome or contig.

```json
{
  "content": "## chr1\n\n```\nATCG...\n```\n\n## chr2\n\n```\nATCG...\n```",
  "metadata": {
    "blocks": [
      { "type": "heading", "offset": 0, "length": 8 },
      { "type": "heading", "offset": 50, "length": 8 }
    ]
  },
  "segments": [
    { "spanStart": 0, "spanEnd": 40, "content": "## chr1\n\n```\nATCG...\n```", "metadata": { "blocks": [...] } },
    { "spanStart": 40, "spanEnd": 80, "content": "## chr2\n\n```\nATCG...\n```", "metadata": { "blocks": [...] } }
  ]
}
```

---

## 9. Testing Your Adapter

You do not need ECHO Core running to test your adapter. Use stdin directly:

```bash
# Test initialize
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"workDir":"/tmp","config":{}}}' | node adapter.js

# Test capabilities
echo '{"jsonrpc":"2.0","id":2,"method":"capabilities"}' | node adapter.js

# Test ingest
echo '{"jsonrpc":"2.0","id":3,"method":"ingest","params":{"uri":"/path/to/file.myext"}}' | node adapter.js

# Test shutdown
echo '{"jsonrpc":"2.0","id":4,"method":"shutdown","params":{"graceful":true}}' | node adapter.js
```

Wrap this in a test script:

```javascript
const { spawn } = require('child_process');

function send(method, params) {
  return new Promise((resolve, reject) => {
    const cp = spawn('node', ['adapter.js']);
    let output = '';
    cp.stdout.on('data', (d) => { output += d.toString(); });
    cp.on('close', () => {
      const lines = output.trim().split('\n');
      resolve(JSON.parse(lines[lines.length - 1]));
    });
    cp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) + '\n');
    cp.stdin.end();
  });
}

(async () => {
  const init = await send('initialize', { workDir: '/tmp', config: {} });
  console.assert(init.result.adapterId === 'my-adapter', 'Initialize failed');

  const caps = await send('capabilities', undefined);
  console.assert(caps.result.extensions.includes('.myext'), 'Capabilities failed');

  console.log('All tests passed');
})();
```

For integration testing with ECHO Core, place your adapter in the `adapters/` directory and use the `DefaultAdapterManager` test pattern shown in `tests/adapters/manager.test.ts`.

---

## 10. Limitations

ECHO Core has strict expectations. Violating them causes ingestion failures.

### Output Must Be Text
Your adapter must return a string in `content`. Binary data (images, audio waveforms, video frames) cannot be stored in CAS. Extract text representations: transcripts, descriptions, OCR results, or structured Markdown.

### Adapter Does Not Store Files
Your adapter is a transformer, not a storage layer. It reads the input file, produces normalized content, and exits. ECHO Core handles all persistence. Do not write to disk unless required for temporary processing.

### Local-First Audio/Video Transcription

ECHO Core's `audio` and `video` adapters use a **local-first** priority cascade:

1. **whisper.cpp (local)** — PRIMARY. Offline, free, private. Requires `whisper-cli` binary + GGML model.
2. **OpenAI Whisper API (cloud)** — OPTIONAL FALLBACK. Requires `WHISPER_API_KEY` or `OPENAI_API_KEY`.
3. **Graceful empty** — LAST RESORT. Returns empty content with error code `5004` if no engine is available.

#### Setting up whisper.cpp

```bash
# 1. Download whisper-cli binary
mkdir -p ~/.echo/bin
wget https://github.com/ggerganov/whisper.cpp/releases/download/v1.6.0/whisper-cli-linux-x64
chmod +x whisper-cli-linux-x64
mv whisper-cli-linux-x64 ~/.echo/bin/whisper-cli

# 2. Download a model (~500MB for base)
mkdir -p ~/.echo/models/whisper
wget https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
mv ggml-base.bin ~/.echo/models/whisper/

# 3. Verify
echoc doctor
```

Supported model locations:
- `~/.echo/models/whisper/ggml-*.bin` (auto-detected)
- Config key `whisperCppModel` in adapter config
- Any path passed via `whisperCppPath` in adapter config

#### Using Cloud Fallback Only

If you prefer not to install whisper.cpp, set an API key:

```bash
export WHISPER_API_KEY="sk-..."
# or
export OPENAI_API_KEY="sk-..."
```

The adapters will skip local detection and use the cloud API directly.

### Heavy Processing Is Your Responsibility
If your adapter needs ML models (Whisper, Tesseract, YOLO), large binaries (ffmpeg, pandoc), or network calls, you must bundle and manage them. ECHO Core provides the spawn environment and working directory, but nothing else.

### No Long-Running State
Adapters are spawned per ingestion. Do not assume state persists between files. If you need to warm up a model, do it in `initialize` and accept the latency on first spawn.

### Error Handling
Return JSON-RPC errors for known failure modes:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "error": { "code": 5001, "message": "OCR failed: image too large" }
}
```

Standard error codes:
- `1000` — Invalid request / method not found
- `1001` — Unsupported MIME type
- `1002` — No text layer (image-only PDF)
- `2000` — Parse error
- `2001` — PDF parse error (corrupted)
- `3000` — Timeout
- `3001` — Encrypted PDF
- `5000` — Internal error
- `5001` — OCR failed
- `5002` — Transcription failed

Custom codes ≥ 6000 are allowed.

## Built-in Adapters

ECHO Core ships with the following built-in adapters:

| Adapter | Status | Formats | Notes |
|---------|--------|---------|-------|
| `text` | stable | `.txt` | UTF-8 text, blank-line block heuristics |
| `markdown` | stable | `.md` | Markdown with heading block detection |
| `pdf` | stable | `.pdf` | Text extraction via `pdf-parse`, heading heuristics, encrypted PDF detection |
| `image` | stable | `.png`, `.jpg`, `.jpeg`, `.tiff`, `.bmp`, `.webp` | OCR via `tesseract.js` with bbox + confidence |
| `audio` | stable | `.mp3`, `.wav`, `.m4a`, `.ogg`, `.flac`, `.webm` | Speech-to-text via **whisper.cpp (local, primary)** → OpenAI Whisper API (cloud, fallback) → graceful empty. Heuristic speaker diarization |
| `audio-mock` | mock | `.mp3`, `.wav` | Synthetic speech blocks for testing (fallback) |
| `video` | stable | `.mp4`, `.avi`, `.mov`, `.mkv`, `.webm` | ffmpeg audio extract → **whisper.cpp (local, primary)** → OpenAI Whisper API (cloud, fallback) → graceful empty. Key-frame timestamps |
| `video-mock` | mock | `.mp4`, `.avi` | Synthetic frame + speech blocks for testing (fallback) |

### Determinism Is Strongly Recommended
While not enforced, deterministic output (same file → same content) makes ECHO Core's deduplication and idempotency features work correctly. Use content-based seeds for any random or synthetic generation.

---

## Summary Checklist

Before publishing your adapter, verify:

- [ ] `manifest.json` is valid JSON with all required fields
- [ ] `adapter.js` handles `initialize`, `capabilities`, `ingest`, and `shutdown`
- [ ] `ingest` returns `content` (string) + `metadata.blocks` (array)
- [ ] Blocks are non-overlapping and sorted by `offset`
- [ ] Segments (if used) have `spanStart`, `spanEnd`, `content`, and `metadata.blocks`
- [ ] Output is deterministic for the same input file
- [ ] Adapter exits cleanly on `shutdown`
- [ ] Errors are returned as JSON-RPC error objects, not thrown to stderr

---

## Further Reading

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — How adapters fit into the L0–L3 pipeline
- [`structure.md`](../structure.md) — Codebase navigation and module map
- `packages/core/src/adapters/protocol.ts` — TypeScript protocol definitions
- `packages/core/src/domain/types.ts` — `NormalizedContent`, `MetaBlock`, `SegmentRef`
- `packages/core/src/domain/schemas.ts` — Zod validators for runtime checking
