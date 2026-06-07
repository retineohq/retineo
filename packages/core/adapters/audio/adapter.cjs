/**
 * ECHO Real Audio Adapter
 * Speech-to-text via whisper.cpp (local, primary) → OpenAI Whisper API (cloud, fallback) → graceful empty.
 * Supports: .mp3 .wav .m4a .ogg .flac .webm
 */

const readline = require('readline');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const rl = readline.createInterface({ input: process.stdin });

const SUPPORTED_MIMES = [
  'audio/mpeg',
  'audio/wav',
  'audio/mp4',
  'audio/ogg',
  'audio/flac',
  'audio/webm',
];

const SUPPORTED_EXTS = ['.mp3', '.wav', '.m4a', '.ogg', '.flac', '.webm'];

const SEGMENT_MS = 300000; // 5 minutes
const DEFAULT_WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions';
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const WHISPER_MODEL_DIR = path.join(os.homedir(), '.echo', 'models', 'whisper');
const WHISPER_BIN_FALLBACK = path.join(os.homedir(), '.echo', 'bin', 'whisper-cli');

let config = {};

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
      config = req.params.config || {};
      result = { adapterId: 'audio', version: '1.1.0' };
      break;
    case 'capabilities':
      result = { mimeTypes: SUPPORTED_MIMES, extensions: SUPPORTED_EXTS };
      break;
    case 'ingest':
      try {
        result = await ingestFile(req.params.uri, req.params.mimeType);
      } catch (err) {
        const code = err.code || 5000;
        const msg = err instanceof Error ? err.message : String(err);
        console.log(JSON.stringify({
          jsonrpc: '2.0',
          id: req.id,
          error: { code, message: msg }
        }));
        return;
      }
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

function extToMime(ext) {
  const map = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
    '.webm': 'audio/webm',
  };
  return map[ext] || null;
}

function formatTimestamp(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

async function commandExists(cmd) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, ['--version'], { stdio: 'pipe' });
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0));
  });
}

async function findWhisperCli() {
  const configured = config.whisperCppPath;
  if (configured) {
    try {
      await fs.access(configured);
      return configured;
    } catch {
      // fall through
    }
  }
  if (await commandExists('whisper-cli')) {
    return 'whisper-cli';
  }
  try {
    await fs.access(WHISPER_BIN_FALLBACK);
    return WHISPER_BIN_FALLBACK;
  } catch {
    return null;
  }
}

async function findModel() {
  const configured = config.whisperCppModel;
  if (configured) {
    try {
      await fs.access(configured);
      return configured;
    } catch {
      // fall through
    }
  }
  try {
    const files = await fs.readdir(WHISPER_MODEL_DIR);
    const model = files.find((f) => f.startsWith('ggml-') && f.endsWith('.bin'));
    if (model) {
      return path.join(WHISPER_MODEL_DIR, model);
    }
  } catch {
    // fall through
  }
  return null;
}

async function callWhisperCpp(filePath, whisperPath, modelPath) {
  const outJson = path.join(os.tmpdir(), `echo-whisper-${Date.now()}.json`);
  const args = [
    '-m', modelPath,
    '-f', filePath,
    '-oj',
    '-of', outJson.replace(/\.json$/, ''),
    '--output-json',
  ];
  const lang = config.language;
  if (lang && lang !== 'auto') {
    args.push('-l', lang);
  }

  return new Promise((resolve, reject) => {
    const proc = spawn(whisperPath, args, { stdio: 'pipe' });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('close', async (code) => {
      if (code !== 0) {
        const err = new Error(`whisper.cpp failed (code ${code}): ${stderr}`);
        err.code = 5002;
        reject(err);
        return;
      }
      try {
        const data = JSON.parse(await fs.readFile(outJson, 'utf-8'));
        await fs.unlink(outJson).catch(() => {});
        // whisper.cpp JSON format: { transcription: [ { timestamps: { from: "0:00:00", to: "0:00:05" }, offsets: { from: 0, to: 5000 }, text: "..." } ] }
        const raw = data.transcription || [];
        const segments = raw.map((seg, idx) => {
          const startMs = seg.offsets ? seg.offsets.from : 0;
          const endMs = seg.offsets ? seg.offsets.to : (startMs + 5000);
          return {
            id: idx,
            start: startMs / 1000,
            end: endMs / 1000,
            text: seg.text || '',
          };
        });
        resolve({ segments });
      } catch (e) {
        const err = new Error(`Failed to parse whisper.cpp output: ${e.message}`);
        err.code = 5002;
        reject(err);
      }
    });
    proc.on('error', (err) => {
      err.code = 5002;
      reject(err);
    });
  });
}

async function callWhisperAPI(filePath, apiKey) {
  const stats = await fs.stat(filePath);
  if (stats.size > MAX_FILE_SIZE) {
    const err = new Error(`Audio file too large (${Math.round(stats.size / 1024 / 1024)}MB > 25MB). Split into chunks or use local whisper.cpp.`);
    err.code = 5002;
    throw err;
  }

  const buffer = await fs.readFile(filePath);
  const blob = new Blob([buffer], { type: 'audio/mpeg' });
  const form = new FormData();
  form.append('file', blob, path.basename(filePath));
  form.append('model', config.model || 'whisper-1');
  form.append('response_format', 'verbose_json');
  const lang = config.language;
  if (lang && lang !== 'auto') {
    form.append('language', lang);
  }

  const apiUrl = config.apiUrl || process.env.WHISPER_API_URL || DEFAULT_WHISPER_URL;
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`Whisper API error ${res.status}: ${body}`);
    err.code = 5002;
    throw err;
  }

  return res.json();
}

function heuristicSpeakerDiarization(segments) {
  const speakers = ['Speaker A', 'Speaker B', 'Speaker C', 'Speaker D'];
  let currentSpeakerIdx = 0;
  const out = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (i > 0) {
      const gap = seg.start - segments[i - 1].end;
      if (gap > 2.0) {
        currentSpeakerIdx = (currentSpeakerIdx + 1) % speakers.length;
      }
    }
    out.push({ ...seg, speaker: speakers[currentSpeakerIdx] });
  }
  return out;
}

function rebuildSegmentsFromWhisper(whisperSegments, durationMs) {
  const allBlocks = [];
  let globalOffset = 0;
  const lines = [];

  for (let i = 0; i < whisperSegments.length; i++) {
    const seg = whisperSegments[i];
    const tsStart = Math.floor(seg.start * 1000);
    const tsEnd = Math.floor(seg.end * 1000);
    const header = `## Segment ${i + 1} (${formatTimestamp(tsStart)} - ${formatTimestamp(tsEnd)})`;
    const text = seg.text.trim();

    lines.push(header);
    lines.push(text);

    allBlocks.push({
      type: 'heading',
      offset: globalOffset,
      length: header.length,
      timestamp: tsStart,
    });
    globalOffset += header.length + 1;

    allBlocks.push({
      type: 'speech',
      offset: globalOffset,
      length: text.length,
      timestamp: tsStart,
      speaker: seg.speaker || 'Speaker A',
    });
    globalOffset += text.length + 1;
  }

  const content = lines.join('\n');

  if (durationMs <= SEGMENT_MS) {
    return {
      content,
      metadata: { blocks: allBlocks },
      segments: undefined,
    };
  }

  const numSegs = Math.ceil(durationMs / SEGMENT_MS);
  const segments = [];
  for (let s = 0; s < numSegs; s++) {
    const spanStart = s * SEGMENT_MS;
    const spanEnd = Math.min((s + 1) * SEGMENT_MS, durationMs);
    segments.push({ spanStart, spanEnd, content: '', metadata: { blocks: [] } });
  }

  for (const block of allBlocks) {
    const ts = block.timestamp || 0;
    const segIdx = Math.min(Math.floor(ts / SEGMENT_MS), segments.length - 1);
    const seg = segments[segIdx];
    const localOffset = seg.content.length;
    seg.metadata.blocks.push({ ...block, offset: localOffset });
    if (block.type === 'heading') {
      const line = content.slice(block.offset, block.offset + block.length);
      seg.content += (seg.content ? '\n' : '') + line;
    } else {
      const line = content.slice(block.offset, block.offset + block.length);
      seg.content += (seg.content ? '\n' : '') + line;
    }
  }

  return { content, metadata: { blocks: allBlocks }, segments };
}

async function getFileDuration(uri) {
  return new Promise((resolve) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      uri,
    ]);
    let out = '';
    ffprobe.stdout.on('data', (d) => { out += d; });
    ffprobe.on('close', (code) => {
      if (code === 0) {
        const sec = parseFloat(out.trim());
        resolve(isNaN(sec) ? null : sec);
      } else {
        resolve(null);
      }
    });
    ffprobe.on('error', () => resolve(null));
  });
}

async function ingestFile(uri, mimeType) {
  const ext = path.extname(uri).toLowerCase();
  const detectedMime = mimeType || extToMime(ext);

  if (!detectedMime || !SUPPORTED_MIMES.includes(detectedMime)) {
    throw new Error(`Unsupported audio format: ${detectedMime || ext}`);
  }

  try {
    await fs.access(uri);
  } catch {
    throw new Error('File not found');
  }

  // Priority 1: local whisper.cpp
  const whisperPath = await findWhisperCli();
  if (whisperPath) {
    const modelPath = await findModel();
    if (modelPath) {
      try {
        const whisperResult = await callWhisperCpp(uri, whisperPath, modelPath);
        const rawSegments = whisperResult.segments || [];
        const durationSec = await getFileDuration(uri);
        const durationMs = durationSec ? Math.floor(durationSec * 1000) : (rawSegments.length ? Math.floor(rawSegments[rawSegments.length - 1].end * 1000) : 0);
        const diarized = heuristicSpeakerDiarization(rawSegments);
        return rebuildSegmentsFromWhisper(diarized, durationMs);
      } catch (err) {
        if (err.code === 5002) {
          throw err; // transcription failure, propagate
        }
        // unexpected error from local whisper — try fallback
      }
    } else {
      // whisper-cli found but no model — try API fallback if possible, else 5005
      const apiKey = config.apiKey || process.env.WHISPER_API_KEY || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        const err = new Error(
          'whisper.cpp model not found. Download a model (e.g., ggml-base.bin) to ~/.echo/models/whisper/ or set WHISPER_API_KEY for cloud fallback.'
        );
        err.code = 5005;
        throw err;
      }
      // fall through to API
    }
  }

  // Priority 2: OpenAI Whisper API fallback
  const apiKey = config.apiKey || process.env.WHISPER_API_KEY || process.env.OPENAI_API_KEY;
  if (apiKey) {
    const whisperResult = await callWhisperAPI(uri, apiKey);
    const rawSegments = whisperResult.segments || [];
    if (!rawSegments.length && whisperResult.text) {
      rawSegments.push({ id: 0, start: 0, end: 1, text: whisperResult.text });
    }
    const durationSec = await getFileDuration(uri);
    const durationMs = durationSec ? Math.floor(durationSec * 1000) : (rawSegments.length ? Math.floor(rawSegments[rawSegments.length - 1].end * 1000) : 0);
    const diarized = heuristicSpeakerDiarization(rawSegments);
    return rebuildSegmentsFromWhisper(diarized, durationMs);
  }

  // Priority 3: graceful empty
  return {
    content: '',
    metadata: { blocks: [] },
  };
}
