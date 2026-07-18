/**
 * RETINEO Core — FileSystem Source Adapter
 * PR3: Reads local files and exposes them to Core as a SourceAdapter.
 * Optionally normalizes non-plain-text files through the document AdapterManager.
 */

import { readFile, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { ContentMeta } from '../domain/types.js';
import type { SourceAdapter, SourceDocument, SourceFetchResult } from './source-adapter.js';
import type { AdapterManager } from './manager.js';

const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.markdown']);

function mimeTypeFromExtension(ext: string): string | undefined {
  if (ext === '.txt') return 'text/plain';
  if (ext === '.md' || ext === '.markdown') return 'text/markdown';
  if (ext === '.pdf') return 'application/pdf';
  return undefined;
}

export class FileSystemSourceAdapter implements SourceAdapter {
  readonly sourceId: string;

  constructor(
    private root: string,
    private documentAdapterManager?: AdapterManager,
    sourceId?: string
  ) {
    this.sourceId = sourceId ?? 'filesystem';
  }

  async sync(): Promise<SourceDocument[]> {
    const resolved = path.resolve(this.root);
    if (!existsSync(resolved)) {
      return [];
    }

    const stats = await stat(resolved);
    if (stats.isFile()) {
      return [this.makeDocument(resolved, stats)];
    }

    const docs: SourceDocument[] = [];
    await this.collectFiles(resolved, docs);
    return docs;
  }

  async fetch(externalId: string): Promise<SourceFetchResult> {
    const resolved = path.resolve(externalId);
    const stats = await stat(resolved);
    const etag = this.makeEtag(stats);
    const mtime = stats.mtime.getTime();

    if (this.documentAdapterManager) {
      try {
        const normalized = await this.documentAdapterManager.ingest(resolved);
        return {
          body: Buffer.from(normalized.content, 'utf-8'),
          etag,
          mtime,
          metadata: normalized.metadata,
        };
      } catch (err) {
        // Fall through to raw read if normalization fails or no adapter exists
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[filesystem-adapter] Normalization failed for ${resolved}: ${msg}\n`);
      }
    }

    const body = await readFile(resolved);
    return { body, etag, mtime };
  }

  async delete(externalId: string): Promise<void> {
    const { unlink } = await import('fs/promises');
    await unlink(externalId);
  }

  private async collectFiles(dir: string, out: SourceDocument[]): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.collectFiles(full, out);
      } else if (entry.isFile()) {
        const stats = await stat(full);
        out.push(this.makeDocument(full, stats));
      }
    }
  }

  private makeDocument(filePath: string, stats: { mtime: Date; size: number }): SourceDocument {
    return {
      externalId: filePath,
      etag: this.makeEtag(stats),
      mtime: stats.mtime.getTime(),
    };
  }

  private makeEtag(stats: { mtime: Date; size: number }): string {
    return `${stats.mtime.getTime()}-${stats.size}`;
  }
}
