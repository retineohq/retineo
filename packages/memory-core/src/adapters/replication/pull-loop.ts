import type { MemoryCore } from '../../core/memory-core.js';
import type { JournalEvent } from '../../domain/entities.js';

export interface ReplicationPullOptions {
  getEvents: (since: number) => Promise<{ lastSequence: number; events: JournalEvent[] }>;
  intervalMs?: number;
  maxRounds?: number;
  authHeader?: string | null;
  sourceUrl?: string | null;
}

export interface ReplicationPullResult {
  rounds: number;
  applied: number;
  lastSequence: number;
}

export async function pullReplicationOnce(core: MemoryCore, options: ReplicationPullOptions): Promise<ReplicationPullResult> {
  let events: JournalEvent[];
  let lastSequence: number;
  const sourceUrl = options.sourceUrl ?? null;
  if (sourceUrl) {
    const authHeader = options.authHeader ?? (process.env.REPLICATION_TOKEN ? `Bearer ${process.env.REPLICATION_TOKEN}` : null);
    const response = await fetch(`${sourceUrl.replace(/\/$/, '')}/replication/events?since=${core.journalSequence()}`, {
      headers: options.authHeader ? { authorization: options.authHeader } : undefined,
    });
    if (!response.ok) {
      throw new Error(`replication pull failed: HTTP ${response.status}`);
    }
    const body = (await response.json()) as { lastSequence: number; events: JournalEvent[] };
    events = body.events;
    lastSequence = body.lastSequence;
  } else {
    const resolved = await options.getEvents(core.journalSequence());
    events = resolved.events;
    lastSequence = resolved.lastSequence;
  }
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
