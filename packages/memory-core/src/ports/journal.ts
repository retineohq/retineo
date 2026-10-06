import type { JournalEvent } from '../domain/entities.js';

export interface Journal {
  append(event: Omit<JournalEvent, 'id' | 'sequence'>): JournalEvent;
  all(): JournalEvent[];
  sequence(): number;
}
