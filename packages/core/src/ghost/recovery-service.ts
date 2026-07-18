/**
 * RETINEO Core — Ghost Recovery Service
 * List, recover, and purge orphaned objects.
 */

import type { Hash } from '../domain/types.js';
import type { Registry, OrphanRecord } from '../storage/registry.js';
import type { CASStorage } from '../storage/cas.js';
import type { Logger } from '../utils/logger.js';
import { getGlobalLogger } from '../utils/logger.js';

export interface GhostRecoveryService {
  listGhosts(): Promise<OrphanRecord[]>;
  recover(hash: Hash, targetPath?: string): Promise<void>;
  purge(olderThanDays: number): Promise<number>;
}

export class DefaultGhostRecoveryService implements GhostRecoveryService {
  private logger: Logger;

  constructor(
    private registry: Registry,
    private cas: CASStorage,
    logger?: Logger
  ) {
    this.logger = logger ?? getGlobalLogger().child({ layer: 'ghost' });
  }

  async listGhosts(): Promise<OrphanRecord[]> {
    return this.registry.listOrphans();
  }

  async recover(hash: Hash, _targetPath?: string): Promise<void> {
    const orphan = this.registry.getOrphan(hash);
    if (!orphan) {
      throw new Error(`No orphan found for hash ${hash}`);
    }

    this.registry.recoverOrphan(hash);
    this.registry.updateSource(orphan.sourceId, orphan.externalId, {
      status: 'active',
      deletedAt: null,
    });
    this.logger.info('ghost.recover.success', { hash, sourceId: orphan.sourceId, externalId: orphan.externalId });
  }

  async purge(olderThanDays: number): Promise<number> {
    const purged = this.registry.purgeOrphansOlderThan(olderThanDays);
    this.logger.info('ghost.purge', { purged, olderThanDays });
    return purged;
  }
}
