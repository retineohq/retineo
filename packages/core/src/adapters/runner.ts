/**
 * RETINEO Core — Adapter Process Runner
 * Phase 2: Spawns adapters, auto-initializes, graceful shutdown
 */

import path from 'path';
import type { JSONRPCTransport } from './transport.js';
import { LineDelimitedJSONTransport } from './transport.js';
import type {
  JSONRPCRequest,
  InitializeParams,
  InitializeResult,
  ShutdownParams,
} from './protocol.js';
import type { Logger } from '../utils/logger.js';
import { getGlobalLogger } from '../utils/logger.js';

export interface AdapterProcessRunner {
  spawn(
    adapterPath: string,
    config?: Record<string, unknown>
  ): Promise<JSONRPCTransport>;
  kill(transport: JSONRPCTransport, timeoutMs?: number): Promise<void>;
}

export class DefaultAdapterProcessRunner implements AdapterProcessRunner {
  private workDir: string;
  private logger: Logger;

  constructor(workDir: string, logger?: Logger) {
    this.workDir = workDir;
    this.logger = logger ?? getGlobalLogger().child({ layer: 'adapter' });
  }

  async spawn(
    adapterPath: string,
    config?: Record<string, unknown>
  ): Promise<JSONRPCTransport> {
    const resolvedPath = path.resolve(adapterPath);
    const transport = new LineDelimitedJSONTransport(resolvedPath);

    const initReq: JSONRPCRequest<InitializeParams> = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        workDir: this.workDir,
        config: config ?? {},
      },
    };

    try {
      const response = await transport.send<InitializeResult>(initReq);
      if (response.error) {
        await transport.close();
        throw new Error(
          `Adapter initialize failed: ${response.error.message}`
        );
      }
      this.logger.info('adapter.spawn', { adapterPath });
      return transport;
    } catch (err) {
      this.logger.error('adapter.spawn.failed', { adapterPath, error: String(err) });
      await transport.close();
      throw err;
    }
  }

  async kill(
    transport: JSONRPCTransport,
    timeoutMs = 5000
  ): Promise<void> {
    const shutdownReq: JSONRPCRequest<ShutdownParams> = {
      jsonrpc: '2.0',
      id: 'shutdown',
      method: 'shutdown',
      params: { graceful: true },
    };

    try {
      await transport.send<void>(shutdownReq);
    } catch {
      // Shutdown request may fail if process already dead — ignore
    }

    const timeout = setTimeout(() => {
      // transport.close() handles SIGTERM
    }, timeoutMs);

    await transport.close();
    clearTimeout(timeout);
    this.logger.info('adapter.kill');
  }
}
