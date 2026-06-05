/**
 * ECHO Core — Dependency Checker (echo doctor)
 * Checks external tools: ffmpeg, tesseract, whisper API key, ollama.
 */

import { spawn } from 'child_process';

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

async function checkWhisperKey(): Promise<DependencyCheck> {
  const key = process.env.WHISPER_API_KEY || process.env.OPENAI_API_KEY;
  const ok = !!key;
  return {
    name: 'Whisper API key',
    required: false,
    installed: ok,
    message: ok ? undefined : 'Set WHISPER_API_KEY or OPENAI_API_KEY env var (required for audio/video adapters)',
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
