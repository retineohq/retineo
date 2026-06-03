/**
 * ECHO Core — Mock Adapter Registry
 * Phase 2.5: Central registry for mock multimodal adapters.
 * Used by tests and CLI to discover built-in mock adapters.
 */

export interface MockAdapterInfo {
  id: string;
  version: string;
  mimeTypes: string[];
  extensions: string[];
  status: 'mock' | 'stable' | 'experimental';
}

export const MOCK_ADAPTERS: MockAdapterInfo[] = [
  {
    id: 'audio-mock',
    version: '1.0.0',
    mimeTypes: ['audio/mpeg', 'audio/wav'],
    extensions: ['.mp3', '.wav'],
    status: 'mock',
  },
  {
    id: 'video-mock',
    version: '1.0.0',
    mimeTypes: ['video/mp4', 'video/x-msvideo'],
    extensions: ['.mp4', '.avi'],
    status: 'mock',
  },
  {
    id: 'image-mock',
    version: '1.0.0',
    mimeTypes: ['image/png', 'image/jpeg'],
    extensions: ['.png', '.jpg', '.jpeg'],
    status: 'mock',
  },
];

export class MockAdapterRegistry {
  private byId = new Map<string, MockAdapterInfo>();

  constructor(adapters = MOCK_ADAPTERS) {
    for (const a of adapters) {
      this.byId.set(a.id, a);
    }
  }

  list(): MockAdapterInfo[] {
    return Array.from(this.byId.values());
  }

  get(id: string): MockAdapterInfo | undefined {
    return this.byId.get(id);
  }

  resolveByMimeType(mimeType: string): MockAdapterInfo | undefined {
    for (const a of this.byId.values()) {
      if (a.mimeTypes.includes(mimeType)) return a;
    }
    return undefined;
  }

  resolveByExtension(ext: string): MockAdapterInfo | undefined {
    const lower = ext.toLowerCase();
    for (const a of this.byId.values()) {
      if (a.extensions.includes(lower)) return a;
    }
    return undefined;
  }
}
