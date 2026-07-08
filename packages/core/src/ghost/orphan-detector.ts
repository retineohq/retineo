/**
 * RETINEO Core — Orphan Detector
 * Detects deleted source files and registers them as orphans.
 */

import { existsSync } from 'fs';
import type { Hash } from '../domain/types.js';
import type { Registry } from '../storage/registry.js';
import type { CASStorage } from '../storage/cas.js';
import type { Logger } from '../utils/logger.js';
import { getGlobalLogger } from '../utils/logger.js';

export interface OrphanDetector {
  detectDeletedSources(): Promise<OrphanRecord[]>;
  detectModifiedSources(): Promise<OrphanRecord[]>;
}

export interface OrphanRecord {
  hash: Hash;
  sourceId: string;
  externalId: string;
  reason: 'deleted' | 'modified';
  detectedAt: string;
}

export class DefaultOrphanDetector implements OrphanDetector {
  private logger: Logger;

  constructor(
    private registry: Registry,
    private cas: CASStorage,
    logger?: Logger
  ) {
    this.logger = logger ?? getGlobalLogger().child({ layer: 'ghost' });
  }

  async detectDeletedSources(): Promise<OrphanRecord[]> {
    const sources = this.registry.listSources();
    const orphans: OrphanRecord[] = [];

    for (const source of sources) {
      if (source.sourceId !== 'filesystem') continue;

      const filePath = source.externalId;
      if (!existsSync(filePath)) {
        const record: OrphanRecord = {
          hash: source.contentHash,
          sourceId: source.sourceId,
          externalId: source.externalId,
          reason: 'deleted',
          detectedAt: new Date().toISOString(),
        };
        orphans.push(record);

        try {
          this.registry.insertOrphan(source.contentHash, source.sourceId, source.externalId);
          this.registry.updateSource(source.sourceId, source.externalId, {
            status: 'ghost',
            deletedAt: Date.now(),
          });
          this.logger.info('ghost.orphan.detected', { hash: source.contentHash, externalId: filePath, reason: 'deleted' });
        } catch (err) {
          this.logger.warn('ghost.orphan.register.failed', { hash: source.contentHash, error: String(err) });
        }
      }
    }

    return orphans;
  }

  async detectModifiedSources(): Promise<OrphanRecord[]> {
    // Modified sources are detected at ingest time (dedup check),
    // not here. This method is a placeholder for future file-watcher integration.
    return [];
  }
}
