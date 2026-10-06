import type { JournalEvent } from '../../domain/entities.js';
import type { Journal } from '../../ports/journal.js';
import { createId } from '../../domain/ids.js';

export class InMemoryJournal implements Journal {
  private events: JournalEvent[] = [];
  private nextSequence = 1;

  append(event: Omit<JournalEvent, 'id' | 'sequence'>): JournalEvent {
    const fullEvent: JournalEvent = {
      ...event,
      id: createId('event', `${this.nextSequence}`),
      sequence: this.nextSequence,
    };
    this.events.push(fullEvent);
    this.nextSequence += 1;
    return fullEvent;
  }

  all(): JournalEvent[] {
    return [...this.events];
  }

  sequence(): number {
    return this.nextSequence - 1;
  }
}
