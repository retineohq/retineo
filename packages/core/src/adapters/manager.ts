/**
 * RETINEO Core — Adapter Manager
 * Phase 2: Loads built-in adapters, resolves by mimeType/extension, ingests files
 */

import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import type {
  NormalizedContent,
  AdapterCapabilities,
} from '../domain/types.js';
import { NormalizedContentSchema } from '../domain/schemas.js';
import type { JSONRPCTransport } from './transport.js';
import type { AdapterProcessRunner } from './runner.js';
import type {
  JSONRPCRequest,
  CapabilitiesResult,
  IngestParams,
  IngestResult,
} from './protocol.js';

interface AdapterManifest {
  id: string;
  version: string;
  mimeTypes: string[];
  extensions: string[];
  entry: string;
  status?: string;
}

interface LoadedAdapter {
  manifest: AdapterManifest;
  dirPath: string;
}

export interface AdapterManager {
  loadBuiltIn(): Promise<void>;
  resolve(uri: string, mimeType?: string): Promise<string>;
  ingest(sourcePath: string, mimeType?: string): Promise<NormalizedContent>;
  capabilities(adapterId: string): Promise<AdapterCapabilities>;
  list(): string[];
}

export class DefaultAdapterManager implements AdapterManager {
  private adaptersDir: string;
  private runner: AdapterProcessRunner;
  private loaded = new Map<string, LoadedAdapter>();

  constructor(adaptersDir: string, runner: AdapterProcessRunner) {
    this.adaptersDir = adaptersDir;
    this.runner = runner;
  }

  async loadBuiltIn(): Promise<void> {
    const entries = await readdir(this.adaptersDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const manifestPath = path.join(this.adaptersDir, entry.name, 'manifest.json');
      try {
        const raw = await readFile(manifestPath, 'utf-8');
        const manifest = JSON.parse(raw) as AdapterManifest;
        this.loaded.set(manifest.id, {
          manifest,
          dirPath: path.join(this.adaptersDir, entry.name),
        });
      } catch {
        // Skip directories without valid manifest
      }
    }
  }

  async resolve(uri: string, mimeType?: string): Promise<string> {
    if (mimeType) {
      for (const [id, loaded] of this.loaded) {
        if (loaded.manifest.mimeTypes.includes(mimeType)) {
          return id;
        }
      }
    }

    const ext = path.extname(uri).toLowerCase();
    if (ext) {
      for (const [id, loaded] of this.loaded) {
        if (loaded.manifest.extensions.includes(ext)) {
          return id;
        }
      }
    }

    throw new Error(`No adapter found for uri=${uri} mimeType=${mimeType}`);
  }

  async ingest(sourcePath: string, mimeType?: string): Promise<NormalizedContent> {
    const adapterId = await this.resolve(sourcePath, mimeType);
    const loaded = this.loaded.get(adapterId);
    if (!loaded) {
      throw new Error(`Adapter ${adapterId} not loaded`);
    }

    const adapterPath = path.join(loaded.dirPath, loaded.manifest.entry);
    const transport = await this.runner.spawn(adapterPath);

    try {
      const ingestReq: JSONRPCRequest<IngestParams> = {
        jsonrpc: '2.0',
        id: 2,
        method: 'ingest',
        params: {
          uri: path.resolve(sourcePath),
          mimeType,
        },
      };

      const response = await transport.send<IngestResult>(ingestReq);
      if (response.error) {
        throw new Error(
          `Ingest failed: ${response.error.message} (code=${response.error.code})`
        );
      }

      const normalized: NormalizedContent = {
        content: response.result!.content,
        metadata: {
          blocks: response.result!.metadata.blocks.map((b) => ({
            type: b.type as 'speech' | 'ocr' | 'frame' | 'heading',
            offset: b.offset,
            length: b.length,
            timestamp: b.timestamp,
            speaker: b.speaker,
            bbox: b.bbox,
            confidence: b.confidence,
          })),
        },
        segments: response.result!.segments?.map((s) => ({
          spanStart: s.spanStart,
          spanEnd: s.spanEnd,
          content: s.content,
          metadata: {
            blocks: s.metadata.blocks.map((b) => ({
              type: b.type as 'speech' | 'ocr' | 'frame' | 'heading',
              offset: b.offset,
              length: b.length,
              timestamp: b.timestamp,
              speaker: b.speaker,
              bbox: b.bbox,
              confidence: b.confidence,
            })),
          },
        })),
      };

      const parsed = NormalizedContentSchema.safeParse(normalized);
      if (!parsed.success) {
        throw new Error(
          `Adapter returned invalid NormalizedContent: ${parsed.error.message}`
        );
      }

      return normalized;
    } finally {
      await this.runner.kill(transport, 3000);
    }
  }

  async capabilities(adapterId: string): Promise<AdapterCapabilities> {
    const loaded = this.loaded.get(adapterId);
    if (!loaded) {
      throw new Error(`Adapter ${adapterId} not loaded`);
    }

    const adapterPath = path.join(loaded.dirPath, loaded.manifest.entry);
    const transport = await this.runner.spawn(adapterPath);

    try {
      const capReq: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: 3,
        method: 'capabilities',
      };

      const response = await transport.send<CapabilitiesResult>(capReq);
      if (response.error) {
        throw new Error(
          `Capabilities failed: ${response.error.message}`
        );
      }

      return {
        mimeTypes: response.result!.mimeTypes,
        extensions: response.result!.extensions,
      };
    } finally {
      await this.runner.kill(transport, 3000);
    }
  }

  list(): string[] {
    return Array.from(this.loaded.keys());
  }
}
