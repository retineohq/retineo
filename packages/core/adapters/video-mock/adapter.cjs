/**
 * ECHO Mock Video Adapter
 * Generates synthetic transcript + frame descriptions with speech/frame blocks
 * Segments by 5-minute intervals
 * Deterministic: same filename → same output
 */

const readline = require('readline');
const fs = require('fs').promises;
const crypto = require('crypto');
const path = require('path');

const rl = readline.createInterface({ input: process.stdin });

const LOREM = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua Ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur Excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum';
const WORDS = LOREM.split(/\s+/);

const SCENES = [
  'Office interior with glass walls',
  'Conference room with projector screen',
  'City street view from window',
  'Laboratory with equipment',
  'Home office with bookshelves',
  'Factory floor with machinery',
  'Outdoor garden patio',
  'Server room with blinking lights',
];

const SEGMENT_MS = 300000; // 5 minutes

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
      result = { adapterId: 'video-mock', version: '1.0.0' };
      break;
    case 'capabilities':
      result = { mimeTypes: ['video/mp4', 'video/x-msvideo'], extensions: ['.mp4', '.avi'] };
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

function hashString(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function seededRandom(seedHex) {
  let seed = parseInt(seedHex.slice(0, 8), 16);
  return () => {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function generateTranscript(wordCount, rng) {
  const out = [];
  for (let i = 0; i < wordCount; i++) {
    out.push(WORDS[Math.floor(rng() * WORDS.length)]);
  }
  return out.join(' ');
}

function formatTimestamp(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `[${h}:${m}:${s}]`;
}

async function ingestFile(uri) {
  const stats = await fs.stat(uri);
  const fileName = path.basename(uri);
  const seed = hashString(fileName);
  const rng = seededRandom(seed);

  // 10 KB ≈ 1 second (video is larger)
  const durationSec = Math.max(1, Math.floor(stats.size / (1024 * 10)));
  const durationMs = durationSec * 1000;
  const numSegments = Math.max(1, Math.ceil(durationMs / SEGMENT_MS));

  const speakers = ['Speaker A', 'Speaker B', 'Speaker C'];
  const allBlocks = [];
  const segments = [];

  let globalOffset = 0;

  for (let segIdx = 0; segIdx < numSegments; segIdx++) {
    const segStartMs = segIdx * SEGMENT_MS;
    const segEndMs = Math.min((segIdx + 1) * SEGMENT_MS, durationMs);
    const segDurationSec = Math.floor((segEndMs - segStartMs) / 1000);

    const segBlocks = [];
    const segContentParts = [];
    let segLocalOffset = 0;

    // Frame description at segment start
    const scene = SCENES[Math.floor(rng() * SCENES.length)];
    const frameText = `${formatTimestamp(segStartMs)} Scene: ${scene}.`;
    segContentParts.push(frameText);
    const frameBlock = {
      type: 'frame',
      offset: segLocalOffset,
      length: frameText.length,
      timestamp: segStartMs,
      bbox: [0, 0, 1920, 1080],
    };
    segBlocks.push(frameBlock);
    allBlocks.push({ ...frameBlock, offset: globalOffset + segLocalOffset });
    segLocalOffset += frameText.length + 1;

    // Speech chunks
    const wordCount = Math.max(10, segDurationSec * 2);
    const transcript = generateTranscript(wordCount, rng);
    const lines = transcript.split(/\s+/);
    const chunkSize = 20;

    for (let i = 0; i < lines.length; i += chunkSize) {
      const chunk = lines.slice(i, i + chunkSize).join(' ');
      const speaker = speakers[Math.floor(rng() * speakers.length)];
      const utteranceMs = segStartMs + Math.floor((i / lines.length) * (segEndMs - segStartMs));
      const timestamp = formatTimestamp(utteranceMs);
      const lineText = `${timestamp} ${speaker}: ${chunk}`;

      segContentParts.push(lineText);

      const block = {
        type: 'speech',
        offset: segLocalOffset,
        length: lineText.length,
        timestamp: utteranceMs,
        speaker,
      };
      segBlocks.push(block);
      allBlocks.push({ ...block, offset: globalOffset + segLocalOffset });
      segLocalOffset += lineText.length + 1;
    }

    const segContent = segContentParts.join('\n');
    segments.push({
      spanStart: segStartMs,
      spanEnd: segEndMs,
      content: segContent,
      metadata: { blocks: segBlocks },
    });

    globalOffset += segLocalOffset;
  }

  const content = segments.map((s) => s.content).join('\n');

  return {
    content,
    metadata: { blocks: allBlocks },
    segments,
  };
}
