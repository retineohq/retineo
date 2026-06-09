/**
 * ECHO Core — Ghost Recovery Service
 * List, recover, and purge orphaned objects.
 */

import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { Hash, ContextNode } from '../domain/types.js';
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

  async recover(hash: Hash, targetPath?: string): Promise<void> {
    const orphan = this.registry.getOrphan(hash);
    if (!orphan) {
      throw new Error(`No orphan found for hash ${hash}`);
    }

    let nodeData: { node: ContextNode; artifacts: { content: string; meta: any } };
    try {
      nodeData = await this.cas.readObject(hash);
    } catch {
      throw new Error(`CAS object ${hash} not found — cannot recover`);
    }
    const destPath = targetPath ?? orphan.l2Path ?? orphan.originalSourceId;

    // Ensure parent directory exists
    const destDir = path.dirname(destPath);
    if (!existsSync(destDir)) {
      await mkdir(destDir, { recursive: true });
    }

    // Write recovered content
    await writeFile(destPath, nodeData.artifacts.content, 'utf-8');
    this.registry.recoverOrphan(hash);
    this.logger.info('ghost.recover.success', { hash, targetPath: destPath });
  }

  async purge(olderThanDays: number): Promise<number> {
    const purged = this.registry.purgeOrphansOlderThan(olderThanDays);
    this.logger.info('ghost.purge', { purged, olderThanDays });
    return purged;
  }
}
