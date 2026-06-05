/**
 * ECHO Core — Dependency Checker (echo doctor)
 * Checks external tools: ffmpeg, tesseract, whisper.cpp, whisper API key, ollama.
 */

import { spawn } from 'child_process';
import { access } from 'fs/promises';
import { homedir } from 'os';
import path from 'path';

export interface DependencyCheck {
  name: string;
  required: boolean;
  installed: boolean;
  version?: string;
  message?: string;
}

export interface DoctorResult {
  checks: DependencyCheck[];
  ok: boolean;
}

async function checkCommand(cmd: string, args: string[], versionRegex?: RegExp): Promise<{ ok: boolean; version?: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { stdio: 'pipe' });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('error', () => resolve({ ok: false }));
    proc.on('close', (code) => {
      if (code !== 0) {
        resolve({ ok: false });
        return;
      }
      const out = stdout + stderr;
      const match = versionRegex ? out.match(versionRegex) : null;
      resolve({ ok: true, version: match ? match[1] : undefined });
    });
  });
}

async function checkNodeVersion(): Promise<DependencyCheck> {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0], 10);
  return {
    name: `Node.js ${version}`,
    required: true,
    installed: major >= 20,
    version,
    message: major >= 20 ? undefined : 'Node.js 20+ required',
  };
}

async function checkFfmpeg(): Promise<DependencyCheck> {
  const res = await checkCommand('ffmpeg', ['-version'], /ffmpeg version (\S+)/);
  return {
    name: 'ffmpeg',
    required: false,
    installed: res.ok,
    version: res.version,
    message: res.ok ? undefined : 'Install: apt install ffmpeg (required for video adapter)',
  };
}

async function checkTesseract(): Promise<DependencyCheck> {
  const res = await checkCommand('tesseract', ['--version'], /tesseract (\S+)/);
  return {
    name: 'tesseract',
    required: false,
    installed: res.ok,
    version: res.version,
    message: res.ok ? undefined : 'Install: apt install tesseract-ocr (optional, for image OCR)',
  };
}

async function checkWhisperCpp(): Promise<DependencyCheck> {
  const res = await checkCommand('whisper-cli', ['--version'], /whisper(?:\.cpp)?\s*v?(\S+)/i);
  if (res.ok) {
    return {
      name: 'whisper.cpp',
      required: false,
      installed: true,
      version: res.version,
      message: 'PRIMARY — local transcription engine',
    };
  }
  // Check fallback path
  const fallback = path.join(homedir(), '.echo', 'bin', 'whisper-cli');
  try {
    await access(fallback);
    return {
      name: 'whisper.cpp',
      required: false,
      installed: true,
      message: `PRIMARY — ${fallback}`,
    };
  } catch {
    return {
      name: 'whisper.cpp',
      required: false,
      installed: false,
      message: 'Install whisper.cpp for local audio/video transcription (https://github.com/ggerganov/whisper.cpp)',
    };
  }
}

async function checkWhisperModel(): Promise<DependencyCheck> {
  const modelDir = path.join(homedir(), '.echo', 'models', 'whisper');
  try {
    const files = await (await import('fs/promises')).readdir(modelDir);
    const model = files.find((f: string) => f.startsWith('ggml-') && f.endsWith('.bin'));
    if (model) {
      return {
        name: 'whisper model',
        required: false,
        installed: true,
        message: `${model} found`,
      };
    }
  } catch {
    // fall through
  }
  return {
    name: 'whisper model',
    required: false,
    installed: false,
    message: 'Download a model (e.g., ggml-base.bin) to ~/.echo/models/whisper/ (https://huggingface.co/ggerganov/whisper.cpp)',
  };
}

async function checkWhisperKey(): Promise<DependencyCheck> {
  const key = process.env.WHISPER_API_KEY || process.env.OPENAI_API_KEY;
  const ok = !!key;
  return {
    name: 'Whisper API key',
    required: false,
    installed: ok,
    message: ok ? 'OPTIONAL — cloud fallback' : 'Set WHISPER_API_KEY or OPENAI_API_KEY env var (optional, cloud fallback)',
  };
}

async function checkOllama(): Promise<DependencyCheck> {
  try {
    const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(3000) });
    const ok = res.ok;
    return {
      name: 'Ollama',
      required: false,
      installed: ok,
      message: ok ? undefined : 'Ollama not responding on localhost:11434',
    };
  } catch {
    return {
      name: 'Ollama',
      required: false,
      installed: false,
      message: 'Ollama not running on localhost:11434 (optional, for local LLM)',
    };
  }
}

export async function runDoctor(): Promise<DoctorResult> {
  const checks = await Promise.all([
    checkNodeVersion(),
    checkFfmpeg(),
    checkTesseract(),
    checkWhisperCpp(),
    checkWhisperModel(),
    checkWhisperKey(),
    checkOllama(),
  ]);

  const ok = checks.filter((c) => c.required).every((c) => c.installed);
  return { checks, ok };
}

export function formatDoctor(result: DoctorResult): string {
  const lines: string[] = [];
  lines.push('ECHO Core Dependency Check');
  lines.push('─────────────────────────');
  for (const c of result.checks) {
    const icon = c.installed ? '✓' : (c.required ? '✗' : '✗');
    const version = c.version ? ` (${c.version})` : '';
    lines.push(`${icon} ${c.name}${version}${c.message ? ` — ${c.message}` : ''}`);
  }
  lines.push('');
  lines.push(result.ok ? 'All critical dependencies present.' : 'Some critical dependencies are missing.');
  return lines.join('\n');
}
