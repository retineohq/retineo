import type { JournalEvent } from '../../domain/entities.js';
import type { Journal } from '../../ports/journal.js';
import { createId } from '../../domain/ids.js';

export class InMemoryJournal implements Journal {
  private events: JournalEvent[] = [];
  private nextSequence = 1;

  append(event: Omit<JournalEvent, 'id' | 'sequence'> & { id?: string; sequence?: number }): JournalEvent {
    if (typeof event.sequence === 'number' && typeof (event as any).id === 'string') {
      const fullEvent: JournalEvent = {
        ...(event as Omit<JournalEvent, 'id' | 'sequence'>),
        id: (event as any).id as string,
        sequence: event.sequence,
      };
      this.events.push(fullEvent);
      this.nextSequence = Math.max(this.nextSequence, fullEvent.sequence + 1);
      return fullEvent;
    }
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
