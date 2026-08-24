/**
 * Orphan metric: documents with no links and no backlinks.
 *
 * Connectivity is now derived from three sources:
 * - explicit `semanticLinks` on the node (embedding/LLM edges);
 * - text references parsed from L0/L1 markdown: `[[wikilinks]]`,
 *   `[text](path)` and bare "см. `file.md`"-style references;
 * - inbound chunk references from the Registry (`getChildSegments`)
 *   plus basename mentions of a document in other documents' L2 summaries.
 */

import path from 'path';
import type { Hash } from '../../domain/types.js';
import type { MetricResult, MetricDetail, HealthAnalyzerDeps } from '../types.js';

interface Entry {
  contentHash: Hash;
  externalId?: string;
}

interface DocInfo {
  hash: Hash;
  basenames: Set<string>;
  semanticTargets: Set<Hash>;
  outboundRefs: Set<string>;
  inbound: Set<Hash>;
  l2Summary: string;
}

const WIKILINK_RE = /\[\[([^[\]|#]+)/g;
const MD_LINK_RE = /\[[^\]]*\]\(([^)\s]+)\)/g;
const CODE_REF_RE = /`([^`\n]*?)([A-Za-zА-Яа-яЁё0-9_./\\-]+\.(?:md|markdown|mdx|txt))`/gi;
const PLAIN_REF_RE = /(?:^|[\s([{>])([A-Za-zА-Яа-яЁё0-9_./\\-]+\.(?:md|markdown|mdx|txt))(?=[\s.,;:!?)\]}>]|$)/gi;

/** Normalize a link target / file path to a comparable basename without extension. */
export function normalizeReference(raw: string): string {
  const withoutAnchor = raw.split('#')[0].trim().replace(/\\/g, '/');
  if (!withoutAnchor) return '';
  const base = path.basename(withoutAnchor).trim();
  const ext = path.extname(base);
  return (ext ? base.slice(0, -ext.length) : base).toLowerCase();
}

/** Extract normalized text-reference basenames from markdown content. */
export function extractTextReferences(text: string): string[] {
  const found = new Set<string>();

  const addMatch = (target: string): void => {
    const normalized = normalizeReference(target);
    if (normalized) found.add(normalized);
  };

  for (const m of text.matchAll(WIKILINK_RE)) addMatch(m[1]);
  for (const m of text.matchAll(MD_LINK_RE)) addMatch(m[1]);
  for (const m of text.matchAll(CODE_REF_RE)) addMatch(m[2]);
  for (const m of text.matchAll(PLAIN_REF_RE)) addMatch(m[1]);

  return Array.from(found);
}

function mentionBoundaryRegex(basename: string): RegExp {
  const escaped = basename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}([^\\p{L}\\p{N}_]|$)`, 'u');
}

function summaryMentions(summary: string, basenames: Set<string>): boolean {
  if (!summary || basenames.size === 0) return false;
  const lower = summary.toLowerCase();
  for (const basename of basenames) {
    if (basename.length < 3) continue; // too short → too noisy for prose mentions
    if (mentionBoundaryRegex(basename).test(lower)) return true;
  }
  return false;
}

export async function orphans(
  entries: Entry[],
  cas: HealthAnalyzerDeps['cas'],
  registry: HealthAnalyzerDeps['registry']
): Promise<MetricResult<Hash[]>> {
  const orphanHashes: Hash[] = [];
  const details: MetricDetail[] = [];

  // Basename → document hashes, so text references can be resolved to edges.
  const basenameToHashes = new Map<string, Set<Hash>>();
  for (const entry of entries) {
    if (!entry.externalId) continue;
    const base = normalizeReference(entry.externalId);
    if (!base) continue;
    let set = basenameToHashes.get(base);
    if (!set) {
      set = new Set();
      basenameToHashes.set(base, set);
    }
    set.add(entry.contentHash);
  }

  // Pass 1: read each document once; collect semantic edges, text refs, summaries.
  const docs = new Map<Hash, DocInfo>();
  for (const entry of entries) {
    const hash = entry.contentHash;
    const info: DocInfo = {
      hash,
      basenames: new Set(entry.externalId ? [normalizeReference(entry.externalId)] : []),
      semanticTargets: new Set(),
      outboundRefs: new Set(),
      inbound: new Set(),
      l2Summary: '',
    };

    if (cas.exists(hash)) {
      try {
        const obj = await cas.readObject(hash);
        for (const link of obj.node.semanticLinks ?? []) {
          if (link.targetHash && link.targetHash !== hash) info.semanticTargets.add(link.targetHash);
        }
        const text = `${obj.artifacts.content ?? ''}\n${obj.artifacts.l1 ?? ''}`;
        for (const ref of extractTextReferences(text)) info.outboundRefs.add(ref);
        info.l2Summary = obj.artifacts.l2?.summary ?? '';
      } catch {
        // treat as no links
      }
    }
    docs.set(hash, info);
  }

  // Pass 2: resolve inbound edges.
  for (const info of docs.values()) {
    // semantic edges
    for (const target of info.semanticTargets) {
      docs.get(target)?.inbound.add(info.hash);
    }
    // text-reference edges resolved to known documents
    for (const ref of info.outboundRefs) {
      for (const target of basenameToHashes.get(ref) ?? []) {
        if (target !== info.hash) docs.get(target)?.inbound.add(info.hash);
      }
    }
    // basename mentions in other documents' L2 summaries
    for (const other of docs.values()) {
      if (other.hash === info.hash) continue;
      if (summaryMentions(info.l2Summary, other.basenames)) {
        docs.get(other.hash)?.inbound.add(info.hash);
      }
    }
  }

  for (const info of docs.values()) {
    const hasLinks = info.semanticTargets.size > 0 || info.outboundRefs.size > 0;
    const hasBacklinks = registry.getChildSegments(info.hash).length > 0 || info.inbound.size > 0;

    if (!hasLinks && !hasBacklinks) {
      orphanHashes.push(info.hash);
      details.push({ hash: info.hash, reason: 'no links and no inbound references' });
    }
  }

  return { name: 'orphans', value: orphanHashes, details };
}
