/**
 * RETINEO Core — Ingestion Service
 * PR3: Event-driven ingestion. Any SourceAdapter can push documents to Core.
 * Core only sees contentHash. Paths live in the Registry.
 */

import path from 'path';
import type { CASStorage, computeHash as ComputeHashFn } from '../storage/cas.js';
import type { Registry } from '../storage/registry.js';
import type { NodeBuilder } from '../storage/node-builder.js';
import type { AdapterManager } from '../adapters/manager.js';
import type { SourceAdapter, AdapterRegistry } from '../adapters/source-adapter.js';
import { DefaultAdapterRegistry } from '../adapters/source-adapter.js';
import { FileSystemSourceAdapter } from '../adapters/filesystem-adapter.js';
import type { Hash, SourceRef, ContentMeta } from '../domain/types.js';
import type { RegistryEntry } from '../storage/types.js';
import type { AuditService } from '../storage/audit.js';
import type { CompilationPipeline } from '../layers/pipeline.js';
import type { Logger } from '../utils/logger.js';
import { getGlobalLogger } from '../utils/logger.js';

export interface IngestResult {
  contentHash: Hash;
  action: 'created' | 'updated' | 'unchanged';
}

export interface SyncResult {
  processed: number;
  ghosts: number;
}

export interface IngestionService {
  ingest(
    sourceId: string,
    externalId: string,
    body: Buffer,
    etag: string,
    metadata?: ContentMeta
  ): Promise<IngestResult>;
  syncSource(sourceId: string): Promise<SyncResult>;
  registerAdapter(adapter: SourceAdapter): void;
  ingestFile(filePath: string): Promise<IngestResult>;
  ingestBatch(filePaths: string[]): Promise<IngestResult[]>;
  syncDirectory(dirPath: string): Promise<SyncResult & { sourceId: string }>;
}

export class DefaultIngestionService implements IngestionService {
  private cas: CASStorage;
  private registry: Registry;
  private nodeBuilder: NodeBuilder;
  private documentAdapterManager: AdapterManager | undefined;
  private computeHash: typeof ComputeHashFn;
  private pipeline: CompilationPipeline;
  private auditService: AuditService | undefined;
  private logger: Logger;
  private adapterRegistry: AdapterRegistry;

  constructor(
    cas: CASStorage,
    registry: Registry,
    nodeBuilder: NodeBuilder,
    documentAdapterManager: AdapterManager | undefined,
    pipeline: CompilationPipeline,
    computeHashImpl: typeof ComputeHashFn,
    logger?: Logger,
    auditService?: AuditService
  ) {
    this.cas = cas;
    this.registry = registry;
    this.nodeBuilder = nodeBuilder;
    this.documentAdapterManager = documentAdapterManager;
    this.pipeline = pipeline;
    this.computeHash = computeHashImpl;
    this.logger = logger ?? getGlobalLogger().child({ layer: 'ingestion' });
    this.auditService = auditService;
    this.adapterRegistry = new DefaultAdapterRegistry();
  }

  registerAdapter(adapter: SourceAdapter): void {
    this.adapterRegistry.register(adapter);
  }

  async ingestFile(filePath: string): Promise<IngestResult> {
    const absolutePath = path.resolve(filePath);
    const sourceId = this.sourceIdFromPath(absolutePath);
    const adapter = new FileSystemSourceAdapter(path.dirname(absolutePath), this.documentAdapterManager, sourceId);
    const { body, etag, metadata } = await adapter.fetch(absolutePath);
    return this.ingest(sourceId, absolutePath, body, etag, metadata);
  }


  async ingestBatch(filePaths: string[]): Promise<IngestResult[]> {
    const results: IngestResult[] = [];
    for (const fp of filePaths) {
      results.push(await this.ingestFile(fp));
    }
    return results;
  }

  private sourceIdFromPath(absolutePath: string): string {
    return `filesystem:${path.dirname(absolutePath)}`;
  }

  private sourceIdFromDirectory(absolutePath: string): string {
    return `filesystem:${absolutePath}`;
  }

  async syncDirectory(dirPath: string): Promise<SyncResult & { sourceId: string }> {
    const absolutePath = path.resolve(dirPath);
    const sourceId = this.sourceIdFromDirectory(absolutePath);
    const adapter = new FileSystemSourceAdapter(absolutePath, this.documentAdapterManager, sourceId);
    this.registerAdapter(adapter);
    const result = await this.syncSource(sourceId);
    return { ...result, sourceId };
  }

  async ingest(
    sourceId: string,
    externalId: string,
    body: Buffer,
    etag: string,
    metadata?: ContentMeta
  ): Promise<IngestResult> {
    const contentHash = this.computeHash(body);
    const existing = this.registry.get(sourceId, externalId);

    if (existing && existing.etag === etag && existing.contentHash === contentHash) {
      // Re-activate a ghosted source if it reappears.
      if (existing.status !== 'active') {
        this.registry.set({
          ...existing,
          status: 'active',
          deletedAt: null,
          lastSeenAt: Date.now(),
        });
      } else {
        this.registry.set({
          ...existing,
          lastSeenAt: Date.now(),
        });
      }

      this.logger.info('ingest.skip.duplicate', { sourceId, externalId, contentHash });
      await this.auditService?.log('ingest', contentHash, undefined, {
        sourceId,
        externalId,
        action: 'unchanged',
      });
      return { contentHash, action: 'unchanged' };
    }

    const action: 'created' | 'updated' = existing ? 'updated' : 'created';
    const now = Date.now();

    const entry: RegistryEntry = {
      sourceId,
      externalId,
      contentHash,
      etag,
      status: 'active',
      deletedAt: null,
      lastSeenAt: now,
      createdAt: existing?.createdAt ?? now,
      retentionPolicy: existing?.retentionPolicy ?? 'standard',
      sensitivityLevel: existing?.sensitivityLevel ?? 'none',
      encryptionKeyId: existing?.encryptionKeyId ?? null,
    };

    const content = body.toString('utf-8');
    const contentMeta: ContentMeta = metadata ?? { blocks: [] };

    const sourceRef: SourceRef = {
      protocol: 'file',
      uri: externalId,
      mimeType: this.mimeTypeFromPath(externalId) || 'application/octet-stream',
    };

    const normalized = { content, metadata: contentMeta };
    const rootNode = await this.nodeBuilder.buildRoot(entry, sourceRef, normalized, contentHash);

    // Write L0 body to CAS (idempotent for duplicate content)
    await this.cas.writeObject(rootNode, { content, meta: contentMeta });

    this.registry.set(entry);

    this.pipeline.enqueueL1(contentHash, sourceId);
    this.logger.info('ingest.complete', { sourceId, externalId, contentHash, action });

    await this.auditService?.log('ingest', contentHash, undefined, {
      sourceId,
      externalId,
      action,
    });

    return { contentHash, action };
  }

  async syncSource(sourceId: string): Promise<SyncResult> {
    const adapter = this.adapterRegistry.get(sourceId);
    if (!adapter) {
      throw new Error(`Source adapter not found: ${sourceId}`);
    }

    const docs = await adapter.sync();
    const existingEntries = this.registry.listBySourceId(sourceId);
    const existingById = new Map(existingEntries.map((e) => [e.externalId, e]));

    let processed = 0;
    const seen = new Set<string>();

    for (const doc of docs) {
      seen.add(doc.externalId);
      const entry = existingById.get(doc.externalId);
      if (entry && entry.etag === doc.etag && entry.status === 'active' && this.cas.exists(entry.contentHash)) {
        // Fast path: unchanged by etag and CAS object still present
        this.registry.set({ ...entry, lastSeenAt: Date.now() });
        continue;
      }

      const fetched = await adapter.fetch(doc.externalId);
      await this.ingest(sourceId, doc.externalId, fetched.body, fetched.etag, fetched.metadata);
      processed++;
    }

    let ghosts = 0;
    for (const entry of existingEntries) {
      if (!seen.has(entry.externalId) && entry.status === 'active') {
        this.registry.set({
          ...entry,
          status: 'ghost',
          deletedAt: Date.now(),
        });
        this.registry.insertOrphan(entry.contentHash, entry.sourceId, entry.externalId);
        ghosts++;
      }
    }

    this.logger.info('sync.complete', { sourceId, processed, ghosts });
    return { processed, ghosts };
  }

  private mimeTypeFromPath(filePath: string): string | undefined {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.txt') return 'text/plain';
    if (ext === '.md' || ext === '.markdown') return 'text/markdown';
    if (ext === '.pdf') return 'application/pdf';
    return undefined;
  }
}
