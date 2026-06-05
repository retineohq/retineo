/**
 * ECHO Real Audio Adapter
 * Speech-to-text via OpenAI Whisper API (primary) with optional whisper.cpp fallback.
 * Supports: .mp3 .wav .m4a .ogg .flac .webm
 */

const readline = require('readline');
const fs = require('fs').promises;
const path = require('path');
const { createReadStream } = require('fs');
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
      result = { adapterId: 'audio', version: '1.0.0' };
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

function resolveApiKey() {
  const key = config.apiKey || process.env.WHISPER_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) {
    const err = new Error('WHISPER_API_KEY not set');
    err.code = 5001;
    throw err;
  }
  return key;
}

function formatTimestamp(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

async function getFileDuration(uri) {
  // Try ffprobe for real duration; fallback to size heuristic
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
  // Whisper segments: pause > 2s → possible speaker change
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

function buildContentAndBlocks(segments) {
  const lines = [];
  const blocks = [];
  let offset = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const tsStart = formatTimestamp(Math.floor(seg.start * 1000));
    const tsEnd = formatTimestamp(Math.floor(seg.end * 1000));
    const header = `## Segment ${i + 1} (${tsStart} - ${tsEnd})`;
    const text = seg.text.trim();
    const line = `${header}\n${text}`;

    lines.push(line);

    // block for header
    const headerLen = header.length;
    blocks.push({
      type: 'heading',
      offset,
      length: headerLen,
      timestamp: Math.floor(seg.start * 1000),
    });
    offset += headerLen + 1;

    // block for speech
    blocks.push({
      type: 'speech',
      offset,
      length: text.length,
      timestamp: Math.floor(seg.start * 1000),
      speaker: seg.speaker || 'Speaker A',
    });
    offset += text.length + 1;
  }

  return { content: lines.join('\n'), blocks };
}

function splitIntoSegments(segments, durationMs) {
  if (durationMs <= SEGMENT_MS) {
    return [{ spanStart: 0, spanEnd: durationMs, content: '', metadata: { blocks: [] } }];
  }

  const numSegs = Math.ceil(durationMs / SEGMENT_MS);
  const segs = [];
  for (let i = 0; i < numSegs; i++) {
    segs.push({
      spanStart: i * SEGMENT_MS,
      spanEnd: Math.min((i + 1) * SEGMENT_MS, durationMs),
      content: '',
      metadata: { blocks: [] },
    });
  }

  // Distribute blocks into segments
  for (const block of segments) {
    const ts = block.timestamp || 0;
    const segIdx = Math.min(Math.floor(ts / SEGMENT_MS), segs.length - 1);
    const seg = segs[segIdx];
    if (!seg.metadata.blocks.length) {
      seg.content = '';
    }
    // Rebase offset within segment
    const localOffset = seg.content.length;
    seg.metadata.blocks.push({ ...block, offset: localOffset });
    const textLen = block.length;
    // Reconstruct segment content from blocks
    const text = block.type === 'heading'
      ? '' // heading text already in content
      : (block.speaker ? `[${formatTimestamp(ts)}] ${block.speaker}: ` : '') + '…'.repeat(Math.max(1, textLen)); // placeholder not needed, we rebuild below
  }

  // Rebuild segment content properly
  for (const seg of segs) {
    const parts = [];
    let localOffset = 0;
    for (const b of seg.metadata.blocks) {
      b.offset = localOffset;
      if (b.type === 'heading') {
        const line = `## Segment (${formatTimestamp(b.timestamp)} - ${formatTimestamp(Math.min(b.timestamp + 5000, seg.spanEnd))})`;
        parts.push(line);
        b.length = line.length;
        localOffset += line.length + 1;
      } else {
        const line = `[${formatTimestamp(b.timestamp)}] ${b.speaker}: ${'…'.repeat(Math.max(1, b.length))}`;
        // We don't know original text here; rebuild from segments list instead
      }
    }
  }

  // Better approach: rebuild from Whisper segments directly
  return null; // signal caller to use rebuildFromWhisperSegments
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

  // Split into 5-minute segments
  const numSegs = Math.ceil(durationMs / SEGMENT_MS);
  const segments = [];
  for (let s = 0; s < numSegs; s++) {
    const spanStart = s * SEGMENT_MS;
    const spanEnd = Math.min((s + 1) * SEGMENT_MS, durationMs);
    segments.push({ spanStart, spanEnd, content: '', metadata: { blocks: [] } });
  }

  // Assign blocks
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

  const apiKey = resolveApiKey();

  // Try whisper.cpp fallback first if configured
  const provider = config.whisperProvider || 'openai';
  let whisperResult;

  if (provider === 'whisper.cpp') {
    try {
      whisperResult = await callWhisperCpp(uri);
    } catch (err) {
      // Graceful degradation to cloud
      if (config.whisperProvider === 'whisper.cpp') {
        throw err;
      }
      whisperResult = await callWhisperAPI(uri, apiKey);
    }
  } else {
    whisperResult = await callWhisperAPI(uri, apiKey);
  }

  const rawSegments = whisperResult.segments || [];
  if (!rawSegments.length && whisperResult.text) {
    // Fallback for non-verbose format
    rawSegments.push({ id: 0, start: 0, end: 1, text: whisperResult.text });
  }

  const durationSec = await getFileDuration(uri);
  const durationMs = durationSec ? Math.floor(durationSec * 1000) : (rawSegments.length ? Math.floor(rawSegments[rawSegments.length - 1].end * 1000) : 0);

  const diarized = heuristicSpeakerDiarization(rawSegments);
  const { content, metadata, segments } = rebuildSegmentsFromWhisper(diarized, durationMs);

  return { content, metadata, segments };
}

async function callWhisperCpp(filePath) {
  const whisperPath = config.whisperCppPath || 'whisper-cli';
  const modelPath = config.whisperCppModel;
  if (!modelPath) {
    const err = new Error('whisper.cpp model path not configured (whisperCppModel)');
    err.code = 5001;
    throw err;
  }

  const outJson = path.join(os.tmpdir(), `echo-whisper-${Date.now()}.json`);
  const args = [
    '-m', modelPath,
    '-f', filePath,
    '-oj', // output json
    '-of', outJson.replace(/\.json$/, ''),
    '--output-json',
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn(whisperPath, args, { stdio: 'pipe' });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('close', async (code) => {
      if (code !== 0) {
        reject(new Error(`whisper.cpp failed: ${stderr}`));
        return;
      }
      try {
        const data = JSON.parse(await fs.readFile(outJson, 'utf-8'));
        await fs.unlink(outJson).catch(() => {});
        resolve({ segments: data.transcription || [] });
      } catch (e) {
        reject(e);
      }
    });
    proc.on('error', (err) => reject(err));
  });
}
