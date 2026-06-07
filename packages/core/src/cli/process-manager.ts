/**
 * ECHO Core — Process Lifecycle Manager
 *
 * Read/write PID files, signal running processes, and stream logs.
 * Used by `echoc worker start/stop/status/logs` and `echoc bridge ...`.
 */

import { readFile, writeFile, mkdir, unlink, access } from 'fs/promises';
import { existsSync, openSync, readFileSync, createReadStream } from 'fs';
import path from 'path';
import os from 'os';

export interface ProcessInfo {
  pid: number;
  startedAt: string;
  /** Optional service name, e.g. "worker", "bridge", "daemon" */
  service: string;
  /** Optional log file path written by the service */
  logFile?: string;
}

export function dataDir(): string {
  // Honour ECHO_DATA_DIR for the lifecycle helpers so the wizard and
  // lifecycle commands operate on the same directory.
  return process.env.ECHO_DATA_DIR ?? path.join(os.homedir(), '.echo');
}

export function pidFilePath(service: string): string {
  return path.join(dataDir(), `${service}.pid`);
}

export function logDir(): string {
  return path.join(dataDir(), 'logs');
}

export function logFilePath(service: string): string {
  return path.join(logDir(), `${service}.log`);
}

export async function ensureDataDirs(): Promise<void> {
  await mkdir(dataDir(), { recursive: true });
  await mkdir(logDir(), { recursive: true });
}

/**
 * Check if a PID is alive by sending signal 0.
 */
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read a PID file. Returns null if the file does not exist or is malformed.
 */
export function readPidFile(service: string): ProcessInfo | null {
  const p = pidFilePath(service);
  if (!existsSync(p)) return null;
  try {
    const raw = readFileSync(p, 'utf-8').trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProcessInfo;
    if (typeof parsed.pid !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writePidFile(info: ProcessInfo): Promise<void> {
  await ensureDataDirs();
  const p = pidFilePath(info.service);
  await writeFile(p, JSON.stringify(info, null, 2), 'utf-8');
}

export async function removePidFile(service: string): Promise<void> {
  const p = pidFilePath(service);
  if (existsSync(p)) {
    await unlink(p);
  }
}

/**
 * Send SIGTERM to a process and wait for it to exit. If still alive after
 * `timeoutMs`, send SIGKILL.
 */
export async function stopProcess(
  pid: number,
  options: { timeoutMs?: number; service?: string } = {}
): Promise<{ stopped: boolean; signal: 'SIGTERM' | 'SIGKILL' | null }> {
  const timeoutMs = options.timeoutMs ?? 5000;
  if (!isPidAlive(pid)) {
    return { stopped: true, signal: null };
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return { stopped: true, signal: null };
  }
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!isPidAlive(pid)) {
      return { stopped: true, signal: 'SIGTERM' };
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  try {
    process.kill(pid, 'SIGKILL');
    await new Promise((r) => setTimeout(r, 500));
  } catch {
    // already dead
  }
  return { stopped: !isPidAlive(pid), signal: 'SIGKILL' };
}

/**
 * Print the last `n` lines of a log file to stdout. Returns a stream if `follow` is true.
 */
export function tailLog(filePath: string, n = 50): string {
  if (!existsSync(filePath)) return '(no log file yet)';
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  return lines.slice(-n).join('\n');
}

export function streamLog(filePath: string): NodeJS.ReadableStream {
  if (!existsSync(filePath)) {
    // Return an empty stream that immediately ends
    return createReadStream('/dev/null');
  }
  // Open with O_RDONLY
  const fd = openSync(filePath, 'r');
  // Seek to end minus 1KB for context
  // (best-effort; just stream from current position with tail of file)
  return createReadStream(filePath, { encoding: 'utf-8', start: Math.max(0, readFileSync(filePath).length - 1024) })
    .on('close', () => {
      // fd unused; createReadStream manages its own
      void fd;
    });
}

export async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}
