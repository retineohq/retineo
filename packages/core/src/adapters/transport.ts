/**
 * RETINEO Core — JSON-RPC Transport over child_process stdin/stdout
 * Phase 2: Adapter IPC System
 */

import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import { createInterface, type Interface } from 'readline';
import type {
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCError,
} from './protocol.js';
import { AdapterErrorCodes } from './protocol.js';

export interface JSONRPCTransport {
  send<T>(request: JSONRPCRequest): Promise<JSONRPCResponse<T>>;
  close(): Promise<void>;
  onError(handler: (err: Error) => void): void;
  onExit(handler: (code: number) => void): void;
}

interface PendingRequest {
  resolve: (value: JSONRPCResponse<unknown>) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class LineDelimitedJSONTransport implements JSONRPCTransport {
  private process: ChildProcess;
  private rl: Interface;
  private pending = new Map<string | number, PendingRequest>();
  private errorHandlers: Array<(err: Error) => void> = [];
  private exitHandlers: Array<(code: number) => void> = [];
  private closed = false;
  private idCounter = 0;

  constructor(
    adapterPath: string,
    private timeoutMs = 30000
  ) {
    // Resolve NODE_PATH from the adapter's directory upward so adapters
    // copied to temp dirs (e.g. in tests) can still find node_modules.
    const adapterDir = path.dirname(adapterPath);
    const rootNodeModules = path.join(process.cwd(), 'node_modules');
    const existingNodePath = process.env.NODE_PATH || '';
    const nodePath = [rootNodeModules, existingNodePath].filter(Boolean).join(path.delimiter);
    this.process = spawn('node', [adapterPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_PATH: nodePath },
    });

    this.rl = createInterface({ input: this.process.stdout! });

    this.rl.on('line', (line) => this.handleLine(line));

    this.process.stderr!.on('data', (data: Buffer) => {
      const msg = data.toString('utf-8').trim();
      if (msg) {
        console.warn(`[adapter stderr] ${msg}`);
      }
    });

    this.process.on('error', (err) => {
      this.errorHandlers.forEach((h) => h(err));
      this.rejectAllPending(err);
    });

    this.process.on('exit', (code) => {
      if (this.closed) return;
      const exitCode = code ?? -1;
      this.exitHandlers.forEach((h) => h(exitCode));
      const err = new Error(
        `Adapter process exited unexpectedly with code ${exitCode}`
      );
      this.rejectAllPending(err);
    });
  }

  private handleLine(line: string): void {
    let response: JSONRPCResponse<unknown>;
    try {
      response = JSON.parse(line) as JSONRPCResponse<unknown>;
    } catch {
      // Malformed line — ignore per LDJSON best practice
      return;
    }

    const pending = this.pending.get(response.id);
    if (!pending) return;

    this.pending.delete(response.id);
    clearTimeout(pending.timer);

    if (response.error) {
      const err = new Error(
        `JSON-RPC error ${response.error.code}: ${response.error.message}`
      );
      (err as any).code = response.error.code;
      pending.reject(err);
    } else {
      pending.resolve(response);
    }
  }

  private rejectAllPending(reason: Error): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(reason);
    }
    this.pending.clear();
  }

  send<T>(request: JSONRPCRequest): Promise<JSONRPCResponse<T>> {
    if (this.closed) {
      return Promise.reject(new Error('Transport is closed'));
    }

    return new Promise((resolve, reject) => {
      const id = request.id ?? ++this.idCounter;
      const reqWithId: JSONRPCRequest = { ...request, id };

      const timer = setTimeout(() => {
        this.pending.delete(id);
        const err = new Error(`Request timeout after ${this.timeoutMs}ms`);
        (err as any).code = AdapterErrorCodes.TIMEOUT;
        reject(err);
      }, this.timeoutMs);

      this.pending.set(id, {
        resolve: resolve as (value: JSONRPCResponse<unknown>) => void,
        reject,
        timer,
      });

      this.process.stdin!.write(JSON.stringify(reqWithId) + '\n');
    });
  }

  close(): Promise<void> {
    if (this.closed) return Promise.resolve();
    this.closed = true;

    // Clear pending so exit doesn't reject after close
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
    }
    this.pending.clear();

    return new Promise((resolve) => {
      this.rl.close();
      this.process.stdin?.end();

      // Give process a moment to exit gracefully
      const timer = setTimeout(() => {
        if (!this.process.killed) {
          this.process.kill('SIGTERM');
        }
        resolve();
      }, 500);

      this.process.on('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  onError(handler: (err: Error) => void): void {
    this.errorHandlers.push(handler);
  }

  onExit(handler: (code: number) => void): void {
    this.exitHandlers.push(handler);
  }
}
