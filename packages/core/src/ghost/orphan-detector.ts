/**
 * ECHO Core — Orphan Detector
 * Detects deleted or modified source files and registers them as orphans.
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
  originalSourceId: string;
  sourcePath: string;
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
      if (source.protocol !== 'file') continue;

      const filePath = source.uri;
      if (!existsSync(filePath)) {
        const record: OrphanRecord = {
          hash: source.rootHash,
          originalSourceId: source.id,
          sourcePath: filePath,
          reason: 'deleted',
          detectedAt: new Date().toISOString(),
        };
        orphans.push(record);

        // Register in orphan registry
        try {
          this.registry.insertOrphan(source.rootHash, source.id, filePath);
          this.logger.info('ghost.orphan.detected', { hash: source.rootHash, path: filePath, reason: 'deleted' });
        } catch (err) {
          this.logger.warn('ghost.orphan.register.failed', { hash: source.rootHash, error: String(err) });
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
