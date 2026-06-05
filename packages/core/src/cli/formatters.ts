/**
 * ECHO Core — CLI Formatters
 * Phase 5: Output formatters for CLI commands.
 */

import type { SearchResponse, StatusResponse, JobResponse } from '../bridge/types.js';

export function formatSearchResult(res: SearchResponse, options?: { json?: boolean }): string {
  if (options?.json) {
    return JSON.stringify(res, null, 2);
  }
  const lines: string[] = [];
  lines.push(`Query: "${res.query}" (detected: ${res.language}, intent: ${res.intent})`);
  lines.push('───────────────────────────────');
  for (let i = 0; i < res.results.selected.length; i++) {
    const c = res.results.selected[i];
    lines.push(`[${i + 1}] [[${c.nodeId.slice(0, 8)}]]`);
    lines.push(`    L2: ${c.l2Summary ?? c.l1Preview ?? c.l0Preview ?? 'N/A'}`);
    if (c.lineRange) {
      lines.push(`    Citation: lines ${c.lineRange.start}-${c.lineRange.end}`);
    }
  }
  lines.push('───────────────────────────────');
  lines.push(`Context: ${res.assembled.totalTokens} tokens, ${res.assembled.citations.length} citations`);
  return lines.join('\n');
}

export function formatStatus(status: StatusResponse): string {
  const lines: string[] = [];
  lines.push(`ECHO Core ${status.version}`);
  lines.push(`Nodes: ${status.nodeCount.toLocaleString()} | Sources: ${status.sourceCount.toLocaleString()} | Pending jobs: ${status.jobCount.pending}`);
  lines.push(`Index: ${status.indexStatus.vectorCount.toLocaleString()} vectors | Last indexed: ${status.indexStatus.lastIndexed}`);
  return lines.join('\n');
}

export function formatJobs(jobs: JobResponse[]): string {
  const lines: string[] = [];
  lines.push('ID          Type          Status      Progress');
  lines.push('─────────────────────────────────────────────');
  for (const j of jobs) {
    const progress = j.progress !== undefined ? `${j.progress}%` : '-';
    lines.push(`${j.id.slice(0, 11).padEnd(11)} ${j.type.padEnd(13)} ${j.status.padEnd(11)} ${progress}`);
  }
  return lines.join('\n');
}

export function formatIngestResult(sourceId: string, rootHash: string, jobs: string[]): string {
  const lines: string[] = [];
  lines.push(`Source registered: ${sourceId} → ${rootHash}`);
  for (const jobId of jobs) {
    lines.push(`Job ${jobId} queued for L1 generation`);
  }
  return lines.join('\n');
}

export function formatConfig(config: unknown): string {
  return JSON.stringify(config, null, 2);
}

export function formatRecoverResult(hash: string, sourceId: string): string {
  return `Recovered: ${hash} → ${sourceId}`;
}
