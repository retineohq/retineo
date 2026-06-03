/**
 * ECHO Core — Ingestion Service
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

export interface IngestionService {
  ingestFile(filePath: string): Promise<ContextNode>;
  ingestBatch(filePaths: string[]): Promise<ContextNode[]>;
}

export class DefaultIngestionService implements IngestionService {
  private cas: CASStorage;
  private registry: Registry;
  private nodeBuilder: NodeBuilder;
  private adapterManager: AdapterManager;
  private computeHash: typeof ComputeHashFn;

  constructor(
    cas: CASStorage,
    registry: Registry,
    nodeBuilder: NodeBuilder,
    adapterManager: AdapterManager,
    computeHashImpl: typeof ComputeHashFn
  ) {
    this.cas = cas;
    this.registry = registry;
    this.nodeBuilder = nodeBuilder;
    this.adapterManager = adapterManager;
    this.computeHash = computeHashImpl;
  }

  async ingestFile(filePath: string): Promise<ContextNode> {
    const absolutePath = path.resolve(filePath);
    const rawBuffer = await readFile(absolutePath);
    const rawHash = this.computeHash(rawBuffer);

    // Idempotency check
    const existing = this.registry.getSourceByRawHash(rawHash);
    if (existing) {
      // Return reconstructed root node from CAS
      const rootHash = existing.rootHash || rawHash;
      if (this.cas.exists(rootHash)) {
        const obj = await this.cas.readObject(rootHash);
        return obj.node;
      }
    }

    // Resolve mimeType from extension
    const ext = path.extname(absolutePath).toLowerCase();
    let mimeType: string | undefined;
    if (ext === '.txt') mimeType = 'text/plain';
    else if (ext === '.md') mimeType = 'text/markdown';
    else if (ext === '.pdf') mimeType = 'application/pdf';

    const adapterId = await this.adapterManager.resolve(absolutePath, mimeType);
    const normalized = await this.adapterManager.ingest(absolutePath, mimeType);

    const contentHash = this.computeHash(normalized.content);

    // Build source record
    const sourceId = randomUUID();
    const source: SourceRecord = {
      id: sourceId,
      protocol: 'file',
      uri: absolutePath,
      mimeType: mimeType || 'application/octet-stream',
      adapterId,
      rawHash,
      rootHash: contentHash,
      lastSeenAt: new Date().toISOString(),
    };

    let rootNode: ContextNode;

    if (normalized.segments && normalized.segments.length > 0) {
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
    }

    // Register source
    this.registry.insertSource(source);

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

    return rootNode;
  }

  async ingestBatch(filePaths: string[]): Promise<ContextNode[]> {
    const results: ContextNode[] = [];
    for (const fp of filePaths) {
      results.push(await this.ingestFile(fp));
    }
    return results;
  }
}
