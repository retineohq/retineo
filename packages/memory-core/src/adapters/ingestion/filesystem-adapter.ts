import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, basename, extname } from 'node:path';
import type { Source, SourceItem, SourceVersion, Evidence } from '../../domain/entities.js';
import type { SourceId, SourceItemId, SourceVersionId, EvidenceId } from '../../domain/ids.js';
import type { SourceRepository, SourceItemRepository, SourceVersionRepository, EvidenceRepository } from '../../ports/repositories.js';
import { createId } from '../../domain/ids.js';

const TEXT_EXTENSIONS = new Set(['.md', '.txt', '.markdown', '.rst']);

export interface IngestOptions {
  sourceName: string;
  trustProfile: 'trusted' | 'untrusted' | 'sandboxed';
  actor: string;
}

export interface IngestResult {
  sourceId: SourceId;
  itemsIngested: number;
  versionsCreated: number;
  evidenceCreated: number;
  skipped: number;
  quarantined: boolean;
}

export class FilesystemSourceAdapter {
  constructor(
    private sources: SourceRepository,
    private items: SourceItemRepository,
    private versions: SourceVersionRepository,
    private evidence: EvidenceRepository,
  ) {}

  private hash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  private isTextFile(filePath: string): boolean {
    return TEXT_EXTENSIONS.has(extname(filePath).toLowerCase());
  }

  private walk(dir: string): string[] {
    const files: string[] = [];
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        files.push(...this.walk(fullPath));
      } else if (this.isTextFile(fullPath)) {
        files.push(fullPath);
      }
    }
    return files;
  }

  ingest(dir: string, options: IngestOptions): IngestResult {
    const now = new Date().toISOString();
    const sourceId = createId('source', options.sourceName.toLowerCase().replace(/\s+/g, '-')) as SourceId;

    let source = this.sources.get(sourceId);
    if (!source) {
      source = {
        id: sourceId,
        type: 'filesystem',
        name: options.sourceName,
        trustProfile: options.trustProfile,
        state: 'active',
        createdAt: now,
        updatedAt: now,
      };
      this.sources.save(source);
    }

    const files = this.walk(dir);
    let itemsIngested = 0;
    let versionsCreated = 0;
    let evidenceCreated = 0;
    let skipped = 0;

    for (const filePath of files) {
      const content = readFileSync(filePath, 'utf8');
      const contentHash = this.hash(content);
      const externalId = basename(filePath);
      const locator = filePath;

      const existingItems = this.items.bySource(sourceId);
      const existing = existingItems.find((item) => item.externalId === externalId);

      if (existing) {
        const currentVersion = this.versions.get(existing.currentVersionId);
        if (currentVersion && currentVersion.contentHash === contentHash) {
          skipped++;
          continue;
        }
      }

      const itemId = existing?.id ?? createId('item', `${sourceId}:${externalId}`) as SourceItemId;
      const versionId = createId('sv', `${contentHash.slice(0, 12)}`) as SourceVersionId;

      const existingVersion = this.versions.get(versionId);
      if (!existingVersion) {
        this.versions.save({
          id: versionId,
          sourceItemId: itemId,
          contentHash,
          capturedAt: now,
          sourceTime: null,
          contentRef: filePath,
          metadata: {},
        });
        versionsCreated++;
      }

      if (!existing) {
        this.items.save({
          id: itemId,
          sourceId,
          externalId,
          locator,
          state: 'active',
          currentVersionId: versionId,
          createdAt: now,
          updatedAt: now,
        });
        itemsIngested++;
      } else {
        this.items.save({
          ...existing,
          currentVersionId: versionId,
          updatedAt: now,
        });
      }

      const evidenceId = createId('ev', contentHash.slice(0, 12)) as EvidenceId;
      const existingEvidence = this.evidence.get(evidenceId);
      if (!existingEvidence) {
        this.evidence.save({
          id: evidenceId,
          sourceVersionId: versionId,
          segmentRef: null,
          contentHash,
          state: options.trustProfile === 'trusted' ? 'available' : 'unavailable',
          createdAt: now,
        });
        evidenceCreated++;
      }
    }

    return {
      sourceId, itemsIngested, versionsCreated, evidenceCreated, skipped,
      quarantined: options.trustProfile !== 'trusted',
    };
  }
}
