import type { MemoryCore } from '../../core/memory-core.js';
import type { JournalEvent } from '../../domain/entities.js';

export interface ReplicationPullOptions {
  getEvents: (since: number) => Promise<{ lastSequence: number; events: JournalEvent[] }>;
  intervalMs?: number;
  maxRounds?: number;
}

export interface ReplicationPullResult {
  rounds: number;
  applied: number;
  lastSequence: number;
}

export async function pullReplicationOnce(core: MemoryCore, options: ReplicationPullOptions): Promise<ReplicationPullResult> {
  const since = core.journalSequence();
  const { lastSequence, events } = await options.getEvents(since);
  let applied = 0;
  for (const event of events) {
    const result = core.applyJournalEvent(event);
    if (result.applied) applied++;
  }
  return { rounds: 1, applied, lastSequence };
}

export async function pullReplicationLoop(core: MemoryCore, options: ReplicationPullOptions): Promise<ReplicationPullResult> {
  const intervalMs = options.intervalMs ?? 0;
  const maxRounds = options.maxRounds ?? 1;
  let totalApplied = 0;
  let lastSequence = core.journalSequence();
  let rounds = 0;
  for (let index = 0; index < maxRounds; index++) {
    const result = await pullReplicationOnce(core, options);
    totalApplied += result.applied;
    lastSequence = Math.max(lastSequence, result.lastSequence);
    rounds++;
    if (intervalMs > 0 && index < maxRounds - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
  return { rounds, applied: totalApplied, lastSequence };
}
