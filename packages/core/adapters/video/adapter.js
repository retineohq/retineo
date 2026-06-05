/**
 * ECHO Real Video Adapter
 * Extracts audio via ffmpeg → Whisper API transcription.
 * Extracts key frames via ffmpeg (placeholder descriptions).
 * Supports: .mp4 .avi .mov .mkv .webm
 */

const readline = require('readline');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { createReadStream } = require('fs');

const rl = readline.createInterface({ input: process.stdin });

const SUPPORTED_MIMES = [
  'video/mp4',
  'video/x-msvideo',
  'video/quicktime',
  'video/x-matroska',
  'video/webm',
];

const SUPPORTED_EXTS = ['.mp4', '.avi', '.mov', '.mkv', '.webm'];

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
      result = { adapterId: 'video', version: '1.0.0' };
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
    '.mp4': 'video/mp4',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
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

async function checkFfmpeg() {
  return new Promise((resolve) => {
    const proc = spawn(config.ffmpegPath || 'ffmpeg', ['-version'], { stdio: 'pipe' });
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0));
  });
}

async function getVideoInfo(uri) {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn(config.ffmpegPath || 'ffmpeg', [
      '-i', uri,
    ], { stdio: 'pipe' });
    let stderr = '';
    ffprobe.stderr.on('data', (d) => { stderr += d; });
    ffprobe.on('close', () => {
      const durationMatch = stderr.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
      const durationSec = durationMatch
        ? parseInt(durationMatch[1]) * 3600 + parseInt(durationMatch[2]) * 60 + parseFloat(durationMatch[3])
        : null;
      const hasAudio = stderr.includes('Audio:');
      resolve({ durationSec, hasAudio });
    });
    ffprobe.on('error', (err) => reject(err));
  });
}

async function extractAudio(uri, outWav) {
  return new Promise((resolve, reject) => {
    const proc = spawn(config.ffmpegPath || 'ffmpeg', [
      '-i', uri,
      '-vn',
      '-acodec', 'pcm_s16le',
      '-ar', '16000',
      '-ac', '1',
      '-y',
      outWav,
    ], { stdio: 'pipe' });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg audio extract failed: ${stderr.slice(-200)}`));
      } else {
        resolve();
      }
    });
    proc.on('error', (err) => reject(err));
  });
}

async function extractFrames(uri, outDir, frameIntervalSec, durationSec) {
  await fs.mkdir(outDir, { recursive: true });
  return new Promise((resolve, reject) => {
    const proc = spawn(config.ffmpegPath || 'ffmpeg', [
      '-i', uri,
      '-vf', `fps=1/${frameIntervalSec},scale=320:-1`,
      '-q:v', '2',
      '-y',
      path.join(outDir, 'frame_%04d.jpg'),
    ], { stdio: 'pipe' });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('close', (code) => {
      if (code !== 0) {
        // Non-fatal: some videos may fail frame extraction
        resolve([]);
      } else {
        resolve();
      }
    });
    proc.on('error', () => resolve([]));
  });
}

async function callWhisperAPI(filePath, apiKey) {
  const stats = await fs.stat(filePath);
  if (stats.size > MAX_FILE_SIZE) {
    const err = new Error(`Extracted audio too large (${Math.round(stats.size / 1024 / 1024)}MB > 25MB). Split video or use local whisper.cpp.`);
    err.code = 5002;
    throw err;
  }

  const buffer = await fs.readFile(filePath);
  const blob = new Blob([buffer], { type: 'audio/wav' });
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

async function ingestFile(uri, mimeType) {
  const ext = path.extname(uri).toLowerCase();
  const detectedMime = mimeType || extToMime(ext);

  if (!detectedMime || !SUPPORTED_MIMES.includes(detectedMime)) {
    throw new Error(`Unsupported video format: ${detectedMime || ext}`);
  }

  try {
    await fs.access(uri);
  } catch {
    throw new Error('File not found');
  }

  const ffmpegOk = await checkFfmpeg();
  if (!ffmpegOk) {
    const err = new Error('ffmpeg is required for video processing. Install: apt install ffmpeg');
    err.code = 5003;
    throw err;
  }

  const apiKey = resolveApiKey();
  const tmpDir = path.join(os.tmpdir(), `echo-video-${Date.now()}`);
  const wavPath = path.join(tmpDir, 'audio.wav');
  const framesDir = path.join(tmpDir, 'frames');

  let videoInfo;
  try {
    videoInfo = await getVideoInfo(uri);
  } catch {
    videoInfo = { durationSec: null, hasAudio: true };
  }

  const durationMs = videoInfo.durationSec ? Math.floor(videoInfo.durationSec * 1000) : 0;
  const frameIntervalSec = config.frameIntervalSeconds || 30;

  let whisperSegments = [];
  let hasAudio = videoInfo.hasAudio;

  if (hasAudio) {
    await fs.mkdir(tmpDir, { recursive: true });
    try {
      await extractAudio(uri, wavPath);
      const whisperResult = await callWhisperAPI(wavPath, apiKey);
      whisperSegments = whisperResult.segments || [];
      if (!whisperSegments.length && whisperResult.text) {
        whisperSegments.push({ id: 0, start: 0, end: Math.max(1, videoInfo.durationSec || 1), text: whisperResult.text });
      }
    } catch (err) {
      if (err.message && err.message.includes('audio extract failed')) {
        hasAudio = false;
      } else {
        throw err;
      }
    }
  }

  // Extract frames (best effort)
  let frameTimestamps = [];
  try {
    await fs.mkdir(tmpDir, { recursive: true });
    await extractFrames(uri, framesDir, frameIntervalSec, videoInfo.durationSec || 0);
    const files = await fs.readdir(framesDir);
    const frameFiles = files.filter((f) => f.startsWith('frame_') && f.endsWith('.jpg')).sort();
    for (let i = 0; i < frameFiles.length; i++) {
      frameTimestamps.push(i * frameIntervalSec * 1000);
    }
  } catch {
    // Frame extraction optional for MVP
  }

  // Cleanup temp files
  try {
    await fs.rm(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }

  const diarized = heuristicSpeakerDiarization(whisperSegments);

  // Build unified content + blocks
  const allBlocks = [];
  let globalOffset = 0;
  const contentLines = [];

  // Interleave frames and speech
  let frameIdx = 0;
  let segIdx = 0;

  while (frameIdx < frameTimestamps.length || segIdx < diarized.length) {
    const nextFrameTs = frameIdx < frameTimestamps.length ? frameTimestamps[frameIdx] : Infinity;
    const nextSeg = segIdx < diarized.length ? diarized[segIdx] : null;
    const nextSegTs = nextSeg ? Math.floor(nextSeg.start * 1000) : Infinity;

    if (nextFrameTs <= nextSegTs) {
      const ts = nextFrameTs;
      const line = `[${formatTimestamp(ts)}] Scene: Frame at ${formatTimestamp(ts)}.`;
      contentLines.push(line);
      allBlocks.push({
        type: 'frame',
        offset: globalOffset,
        length: line.length,
        timestamp: ts,
        bbox: [0, 0, 1920, 1080],
      });
      globalOffset += line.length + 1;
      frameIdx++;
    } else {
      const seg = nextSeg;
      const ts = Math.floor(seg.start * 1000);
      const line = `[${formatTimestamp(ts)}] ${seg.speaker || 'Speaker A'}: ${seg.text.trim()}`;
      contentLines.push(line);
      allBlocks.push({
        type: 'speech',
        offset: globalOffset,
        length: line.length,
        timestamp: ts,
        speaker: seg.speaker || 'Speaker A',
      });
      globalOffset += line.length + 1;
      segIdx++;
    }
  }

  const content = contentLines.join('\n');

  if (durationMs <= SEGMENT_MS) {
    return {
      content,
      metadata: { blocks: allBlocks },
    };
  }

  // Split into segments
  const numSegs = Math.max(1, Math.ceil(durationMs / SEGMENT_MS));
  const segments = [];
  for (let s = 0; s < numSegs; s++) {
    segments.push({
      spanStart: s * SEGMENT_MS,
      spanEnd: Math.min((s + 1) * SEGMENT_MS, durationMs),
      content: '',
      metadata: { blocks: [] },
    });
  }

  for (const block of allBlocks) {
    const ts = block.timestamp || 0;
    const segIdx2 = Math.min(Math.floor(ts / SEGMENT_MS), segments.length - 1);
    const seg = segments[segIdx2];
    const localOffset = seg.content.length;
    const text = content.slice(block.offset, block.offset + block.length);
    seg.metadata.blocks.push({ ...block, offset: localOffset });
    seg.content += (seg.content ? '\n' : '') + text;
  }

  return { content, metadata: { blocks: allBlocks }, segments };
}
