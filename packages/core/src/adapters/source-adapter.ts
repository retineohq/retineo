/**
 * RETINEO Core — Source Adapter Interface
 * PR3: Any source (filesystem, S3, API, etc.) notifies Core about documents.
 * Core knows nothing about filesystem paths or remote protocols.
 */

import type { ContentMeta } from '../domain/types.js';

export interface SourceDocument {
  externalId: string;
  etag: string;
  mtime: number;
}

export interface SourceFetchResult {
  body: Buffer;
  etag: string;
  mtime: number;
  metadata?: ContentMeta;
}

export interface SourceAdapter {
  readonly sourceId: string;

  /** Scan the source and return metadata for all known documents. */
  sync(): Promise<SourceDocument[]>;

  /** Fetch the full body of a specific document. */
  fetch(externalId: string): Promise<SourceFetchResult>;

  /** Optional: delete a document from the source. */
  delete?(externalId: string): Promise<void>;
}

export interface AdapterRegistry {
  register(adapter: SourceAdapter): void;
  get(sourceId: string): SourceAdapter | undefined;
  list(): SourceAdapter[];
}

export class DefaultAdapterRegistry implements AdapterRegistry {
  private adapters = new Map<string, SourceAdapter>();

  register(adapter: SourceAdapter): void {
    this.adapters.set(adapter.sourceId, adapter);
  }

  get(sourceId: string): SourceAdapter | undefined {
    return this.adapters.get(sourceId);
  }

  list(): SourceAdapter[] {
    return Array.from(this.adapters.values());
  }
}
