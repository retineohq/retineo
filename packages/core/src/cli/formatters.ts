/**
 * RETINEO Core — CLI Formatters
 * Phase 5: Output formatters for CLI commands.
 */

import type { SearchResponse, StatusResponse, JobResponse } from '../bridge/types.js';
import type { Section } from '../layers/l1-generator.js';

interface DocHitPayload {
  sourceHash: string;
  sourcePath: string;
  score: number;
  l2Summary: string;
  navTree: Section[] | null;
}

export function formatSearchResult(res: SearchResponse & { documentHits?: DocHitPayload[] }, options?: { json?: boolean }): string {
  if (options?.json) {
    return JSON.stringify(res, null, 2);
  }
  const lines: string[] = [];
  lines.push(`Query: "${res.query}" (detected: ${res.language}, intent: ${res.intent})`);
  lines.push('───────────────────────────────');

  // DocumentHit tree format
  if (res.documentHits && res.documentHits.length > 0) {
    for (const doc of res.documentHits) {
      const sourceName = doc.sourcePath.split('/').pop() ?? doc.sourcePath;
      lines.push(`Document ${sourceName} (score: ${doc.score.toFixed(2)})`);
      if (doc.navTree && doc.navTree.length > 0) {
        renderSections(doc.navTree, lines, '');
      } else {
        lines.push(`  └── L2: ${doc.l2Summary.slice(0, 120)}${doc.l2Summary.length > 120 ? '...' : ''}`);
      }
      lines.push('');
    }
  } else {
    // Fallback: old citation format
    for (let i = 0; i < res.results.selected.length; i++) {
      const c = res.results.selected[i];
      lines.push(`[${i + 1}] [[${c.nodeId.slice(0, 8)}]]`);
      lines.push(`    L2: ${c.l2Summary ?? c.l1Preview ?? c.l0Preview ?? 'N/A'}`);
      if (c.lineRange) {
        lines.push(`    Citation: lines ${c.lineRange.start}-${c.lineRange.end}`);
      }
    }
  }

  lines.push('───────────────────────────────');
  lines.push(`Context: ${res.assembled.totalTokens} tokens, ${res.assembled.citations.length} citations`);
  return lines.join('\n');
}

function renderSections(sections: Section[], lines: string[], prefix: string): void {
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    const isLast = i === sections.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    lines.push(`${prefix}${connector}§ ${s.title}`);
    if (s.children.length > 0) {
      const childPrefix = `${prefix}${isLast ? '    ' : '│   '}`;
      renderSections(s.children, lines, childPrefix);
    }
  }
}

export function formatStatus(status: StatusResponse): string {
  const lines: string[] = [];
  lines.push(`RETINEO Core ${status.version}`);
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
