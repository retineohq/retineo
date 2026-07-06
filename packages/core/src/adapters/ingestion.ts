/**
 * RETINEO Core — Ingestion Service
 * Phase 2: Orchestrator — file → adapter → CAS → registry → ContextNode
 */

import { readFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import path from 'path';
import type {
  ContextNode,
  SourceRecord,
  JobRecord,
  Hash,
} from '../domain/types.js';
import type { CASStorage, computeHash as ComputeHashFn } from '../storage/cas.js';
import type { Registry } from '../storage/registry.js';
import type { NodeBuilder } from '../storage/node-builder.js';
import type { AdapterManager } from './manager.js';
import type { Logger } from '../utils/logger.js';
import { getGlobalLogger } from '../utils/logger.js';

export interface IngestFileResult {
  node: ContextNode;
  skipped?: boolean;
}

export interface IngestionService {
  ingestFile(filePath: string): Promise<IngestFileResult>;
  ingestBatch(filePaths: string[]): Promise<IngestFileResult[]>;
}

export class DefaultIngestionService implements IngestionService {
  private cas: CASStorage;
  private registry: Registry;
  private nodeBuilder: NodeBuilder;
  private adapterManager: AdapterManager;
  private computeHash: typeof ComputeHashFn;
  private logger: Logger;

  constructor(
    cas: CASStorage,
    registry: Registry,
    nodeBuilder: NodeBuilder,
    adapterManager: AdapterManager,
    computeHashImpl: typeof ComputeHashFn,
    logger?: Logger
  ) {
    this.cas = cas;
    this.registry = registry;
    this.nodeBuilder = nodeBuilder;
    this.adapterManager = adapterManager;
    this.computeHash = computeHashImpl;
    this.logger = logger ?? getGlobalLogger().child({ layer: 'ingestion' });
  }

  async ingestFile(filePath: string): Promise<IngestFileResult> {
    const absolutePath = path.resolve(filePath);
    const sourcePath = filePath;
    this.logger.info('ingest.start', { sourcePath: absolutePath });
    const rawBuffer = await readFile(absolutePath);
    const rawHash = this.computeHash(rawBuffer);

    // Resolve mimeType from extension
    const ext = path.extname(absolutePath).toLowerCase();
    let mimeType: string | undefined;
    if (ext === '.txt') mimeType = 'text/plain';
    else if (ext === '.md') mimeType = 'text/markdown';
    else if (ext === '.pdf') mimeType = 'application/pdf';

    const adapterId = await this.adapterManager.resolve(absolutePath, mimeType);
    this.logger.info('adapter.ingest.start', { sourcePath: absolutePath, adapterId });
    const normalized = await this.adapterManager.ingest(absolutePath, mimeType);
    this.logger.info('adapter.ingest.complete', { sourcePath: absolutePath, adapterId, contentLength: normalized.content.length });

    const contentHash = this.computeHash(normalized.content);

    // Deduplication by contentHash + sourcePath
    const existing = this.registry.getSourceByRootHash(contentHash);
    if (existing) {
      if (existing.uri === absolutePath) {
        this.logger.info('ingest.skip.duplicate', { sourcePath: absolutePath, contentHash });
        console.log(`Skipped: already ingested (hash: ${contentHash})`);
        const rootHash = existing.rootHash || contentHash;
        if (this.cas.exists(rootHash)) {
          const obj = await this.cas.readObject(rootHash);
          return { node: obj.node, skipped: true };
        }
        // CAS missing but source exists — return minimal node
        return {
          node: {
            id: rootHash,
            sourceRef: { protocol: 'file', uri: absolutePath, mimeType: existing.mimeType },
            sourcePath,
            childrenIds: [],
            depth: 0,
            artifacts: {},
            build: { schemaVersion: 1, nodeVersion: 1, rawHash, contentHash, generators: { l1: { id: '', version: '' }, l2: { id: '', version: '' }, embedding: { id: '', version: '' } }, buildTimestamp: existing.lastSeenAt },
            createdAt: existing.lastSeenAt,
            updatedAt: existing.lastSeenAt,
          },
          skipped: true,
        };
      } else {
        // Same content, different path — update sourcePath
        this.logger.info('ingest.update.path', { sourcePath: absolutePath, oldPath: existing.uri, contentHash });
        this.registry.updateSourcePath(existing.id, absolutePath, sourcePath);
        console.log(`Updated source path: ${existing.uri} → ${absolutePath}`);
        const rootHash = existing.rootHash || contentHash;
        if (this.cas.exists(rootHash)) {
          const obj = await this.cas.readObject(rootHash);
          return { node: obj.node, skipped: true };
        }
        return {
          node: {
            id: rootHash,
            sourceRef: { protocol: 'file', uri: absolutePath, mimeType: existing.mimeType },
            sourcePath,
            childrenIds: [],
            depth: 0,
            artifacts: {},
            build: { schemaVersion: 1, nodeVersion: 1, rawHash, contentHash, generators: { l1: { id: '', version: '' }, l2: { id: '', version: '' }, embedding: { id: '', version: '' } }, buildTimestamp: existing.lastSeenAt },
            createdAt: existing.lastSeenAt,
            updatedAt: existing.lastSeenAt,
          },
          skipped: true,
        };
      }
    }

    // Build source record
    const sourceId = randomUUID();
    const source: SourceRecord = {
      id: sourceId,
      protocol: 'file',
      uri: absolutePath,
      sourcePath,
      mimeType: mimeType || 'application/octet-stream',
      adapterId,
      rawHash,
      rootHash: contentHash,
      lastSeenAt: new Date().toISOString(),
    };

    let rootNode: ContextNode;

    if (normalized.segments && normalized.segments.length > 0) {
      this.logger.info('ingest.segment', { sourcePath: absolutePath, segmentCount: normalized.segments.length });
      // Multi-segment ingestion
      rootNode = await this.nodeBuilder.buildRoot(source, normalized, rawHash);
      const children = await this.nodeBuilder.buildSegments(
        rootNode,
        normalized.segments,
        source
      );

      // Update rootNode childrenIds
      rootNode.childrenIds = children.map((c) => c.id);

      // Write root to CAS
      await this.cas.writeObject(rootNode, {
        content: normalized.content,
        meta: normalized.metadata,
      });

      // Register source before segments (FK constraint)
      this.registry.insertSource(source);

      // Write children to CAS + register segments
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const seg = normalized.segments[i];
        await this.cas.writeObject(child, {
          content: seg.content,
          meta: seg.metadata,
        });

        this.registry.insertSegment({
          hash: child.id,
          sourceId,
          spanStart: seg.spanStart,
          spanEnd: seg.spanEnd,
          adapterId,
          parentHash: rootNode.id,
        });
      }
    } else {
      // Single node ingestion
      rootNode = await this.nodeBuilder.buildRoot(source, normalized, rawHash);
      await this.cas.writeObject(rootNode, {
        content: normalized.content,
        meta: normalized.metadata,
      });

      // Register source
      this.registry.insertSource(source);
    }

    // Queue GENERATE_L1 job for root node
    const job: JobRecord = {
      id: randomUUID(),
      type: 'GENERATE_L1',
      payload: JSON.stringify({ nodeId: rootNode.id, sourceId }),
      priority: 0,
      attempts: 0,
      maxAttempts: 3,
      status: 'PENDING',
      leaseUntil: null,
      workerId: null,
      heartbeatAt: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
    };
    this.registry.insertJob(job);
    this.logger.info('ingest.complete', { sourcePath: absolutePath, nodeId: rootNode.id, jobId: job.id });

    // Queue GENERATE_L1 for each child segment too
    for (const childId of rootNode.childrenIds) {
      const childJob: JobRecord = {
        id: randomUUID(),
        type: 'GENERATE_L1',
        payload: JSON.stringify({ nodeId: childId, sourceId }),
        priority: 0,
        attempts: 0,
        maxAttempts: 3,
        status: 'PENDING',
        leaseUntil: null,
        workerId: null,
        heartbeatAt: null,
        createdAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
      };
      this.registry.insertJob(childJob);
    }

    return { node: rootNode };
  }

  async ingestBatch(filePaths: string[]): Promise<IngestFileResult[]> {
    const results: IngestFileResult[] = [];
    for (const fp of filePaths) {
      results.push(await this.ingestFile(fp));
    }
    return results;
  }
}
