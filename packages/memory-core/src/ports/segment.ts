import type { Segment } from '../domain/entities.js';
import type { SegmentId, ContextId } from '../domain/ids.js';

export interface SegmentRepository {
  save(segment: Segment): void;
  get(id: SegmentId): Segment | undefined;
  all(): Segment[];
}

export interface SegmentSecurityModel {
  sign(payloadHash: string): string;
  verify(segment: Segment): boolean;
}
