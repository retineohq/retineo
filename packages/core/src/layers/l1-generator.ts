/**
 * RETINEO Core — L1 Generator
 * Phase 3: Rule-based structural parser for markdown.
 * Splits content into sections (headings) and chunks.
 */

import { computeHash } from '../storage/cas.js';

export interface Section {
  level: number;
  title: string;
  lineStart: number;
  lineEnd: number;
  children: Section[];
}

export interface Chunk {
  id: string;
  lineStart: number;
  lineEnd: number;
  charStart: number;
  charEnd: number;
  heading?: string;
  contentHash?: string;
}

export interface L1Index {
  title?: string;
  sections: Section[];
  chunks: Chunk[];
}

export interface L1Result {
  markdown: string;
  index: L1Index;
}

export interface L1SourceContext {
  uri: string;
  mimeType: string;
}

export interface L1Generator {
  generate(content: string, context?: L1SourceContext): Promise<L1Result>;
}

export interface L1GeneratorOptions {
  maxLinesPerChunk?: number;
  generatorId?: string;
  version?: string;
}

const DEFAULT_OPTIONS: Required<L1GeneratorOptions> = {
  maxLinesPerChunk: 512,
  generatorId: 'outline-parser',
  version: '1.0.0',
};

const HEADING_RE = /^(#{1,6})\s+(.+)$/;

function basenameFromUri(uri: string): string {
  try {
    const url = new URL(uri);
    const pathname = url.pathname;
    return pathname.split('/').pop() ?? uri;
  } catch {
    return uri.split('/').pop() ?? uri;
  }
}

function humanizeFilename(name: string): string {
  const withoutExt = name.replace(/\.[^.]+$/, '');
  return withoutExt
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTitle(lines: string[], context?: L1SourceContext): string {
  const firstHeading = parseHeadings(lines)[0];
  if (firstHeading) {
    return firstHeading.title;
  }
  const firstNonEmpty = lines.find((l) => l.trim().length > 0);
  if (firstNonEmpty) {
    return firstNonEmpty.trim();
  }
  if (context?.uri) {
    const name = basenameFromUri(context.uri);
    if (name) return humanizeFilename(name);
  }
  return 'Untitled Document';
}

function parseHeadings(lines: string[]): Array<{ level: number; title: string; lineIndex: number }> {
  const headings: Array<{ level: number; title: string; lineIndex: number }> = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const m = HEADING_RE.exec(line);
    if (m) {
      headings.push({ level: m[1].length, title: m[2].trim(), lineIndex: i });
    }
  }

  return headings;
}

function buildSectionTree(
  headings: Array<{ level: number; title: string; lineIndex: number }>,
  totalLines: number
): Section[] {
  if (headings.length === 0) return [];

  // If first heading is level 1, treat it as document title; its children are the top sections
  const titleIsRoot = headings[0].level === 1;
  const startIndex = titleIsRoot ? 1 : 0;

  const root: Section[] = [];
  const stack: Section[] = [];

  for (let i = startIndex; i < headings.length; i++) {
    const h = headings[i];
    const nextLine = headings[i + 1]?.lineIndex ?? totalLines;
    const section: Section = {
      level: h.level,
      title: h.title,
      lineStart: h.lineIndex,
      lineEnd: nextLine - 1,
      children: [],
    };

    while (stack.length > 0 && stack[stack.length - 1].level >= h.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      root.push(section);
    } else {
      stack[stack.length - 1].children.push(section);
    }
    stack.push(section);
  }

  return root;
}

const BOUNDARY_RES = [
  /^\d{4}-\d{2}-\d{2}/, // ISO date at line start
  /^ECHO .+ COMPLETE/i,
  /^STATUS:/i,
  /^\*\*STATUS:\*\*/i,
];

function isBoundaryLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return false;
  return BOUNDARY_RES.some((re) => re.test(trimmed));
}

function shouldSegmentPlainText(lines: string[]): boolean {
  const nonEmpty = lines.filter((l) => l.trim().length > 0).length;
  const markerCount = lines.filter(isBoundaryLine).length;
  return markerCount >= 3 && markerCount / Math.max(nonEmpty, 1) >= 0.2;
}

function segmentPlainText(
  lines: string[]
): Array<{ level: number; title: string; lineIndex: number }> {
  const headings: Array<{ level: number; title: string; lineIndex: number }> = [];
  let prevBlank = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const blank = trimmed.length === 0;
    const boundary = isBoundaryLine(line);
    const doubleBlank = blank && prevBlank;

    if (boundary || doubleBlank) {
      const title = boundary ? trimmed : `Segment ${headings.length + 1}`;
      headings.push({ level: 2, title, lineIndex: i });
    }

    prevBlank = blank;
  }

  return headings;
}

function splitRangeIntoChunks(
  lines: string[],
  startLine: number,
  endLine: number,
  maxLinesPerChunk: number,
  heading?: string,
  idOffset = 1
): Chunk[] {
  const chunks: Chunk[] = [];
  let chunkId = idOffset;
  let currentStart = startLine;
  let currentLineCount = 0;
  let inCodeBlock = false;

  for (let li = startLine; li < endLine; li++) {
    const line = lines[li];
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
    }

    currentLineCount++;

    const atEnd = li === endLine - 1;
    const shouldSplit = currentLineCount >= maxLinesPerChunk && !inCodeBlock;

    if (shouldSplit || atEnd) {
      const chunkEnd = atEnd ? endLine : li + 1;
      const text = lines.slice(currentStart, chunkEnd).join('\n');
      chunks.push({
        id: `chunk-${String(chunkId++).padStart(3, '0')}`,
        lineStart: currentStart,
        lineEnd: chunkEnd - 1,
        charStart: lines.slice(0, currentStart).join('\n').length + (currentStart > 0 ? 1 : 0),
        charEnd: lines.slice(0, chunkEnd).join('\n').length + (chunkEnd > 0 ? 1 : 0) - 1,
        heading,
        contentHash: computeHash(text),
      });
      currentStart = chunkEnd;
      currentLineCount = 0;
    }
  }

  return chunks;
}

function buildChunks(
  lines: string[],
  headings: Array<{ level: number; title: string; lineIndex: number }>,
  maxLinesPerChunk: number
): Chunk[] {
  if (lines.length === 0) return [];

  // No headings: chunk the whole text by size.
  if (headings.length === 0) {
    return splitRangeIntoChunks(lines, 0, lines.length, maxLinesPerChunk);
  }

  const chunks: Chunk[] = [];
  const titleIsRoot = headings[0].level === 1;

  // Single H1: chunk body after the title. The chunk starts at the H1 line so
  // the marker is rendered right after the title in the L1 markdown.
  if (titleIsRoot && headings.length === 1) {
    const h = headings[0];
    const bodyStart = h.lineIndex + 1;
    if (bodyStart < lines.length) {
      return splitRangeIntoChunks(lines, h.lineIndex, lines.length, maxLinesPerChunk, h.title);
    }
    return [];
  }

  let chunkId = 1;

  // Intro text before the first non-title heading.
  if (titleIsRoot && headings.length > 1) {
    const introStart = 0;
    const introEnd = headings[1].lineIndex;
    if (introEnd > introStart) {
      const introChunks = splitRangeIntoChunks(lines, introStart, introEnd, maxLinesPerChunk);
      for (const c of introChunks) {
        c.id = `chunk-${String(chunkId++).padStart(3, '0')}`;
      }
      chunks.push(...introChunks);
    }
  }

  for (let hi = 0; hi < headings.length; hi++) {
    const h = headings[hi];
    // Skip the document title itself; its body is covered by the intro chunk.
    if (titleIsRoot && h.level === 1 && hi === 0) continue;

    const startLine = h.lineIndex;
    const endLine = headings[hi + 1]?.lineIndex ?? lines.length;
    const sectionChunks = splitRangeIntoChunks(lines, startLine, endLine, maxLinesPerChunk, h.title, chunkId);
    for (const c of sectionChunks) {
      c.id = `chunk-${String(chunkId++).padStart(3, '0')}`;
    }
    chunks.push(...sectionChunks);
  }

  return chunks;
}

function buildL1Markdown(
  lines: string[],
  headings: Array<{ level: number; title: string; lineIndex: number }>,
  chunks: Chunk[],
  title: string,
  opts: Required<L1GeneratorOptions>
): string {
  const parts: string[] = [
    '---',
    `generator: "${opts.generatorId}"`,
    `version: "${opts.version}"`,
    `sectionCount: ${headings.length || 1}`,
    `chunkCount: ${chunks.length}`,
    '---',
    '',
  ];

  if (headings.length === 0) {
    parts.push('# ' + title);
    parts.push('');
    let chunkIndex = 0;
    for (let li = 0; li < lines.length; li++) {
      if (chunkIndex < chunks.length && chunks[chunkIndex].lineStart === li) {
        parts.push(`<!-- chunk: ${chunks[chunkIndex].id} -->`);
        chunkIndex++;
      }
      parts.push(lines[li]);
    }
    return parts.join('\n');
  }

  // Map chunk id to heading for insertion
  const chunkMap = new Map<number, string>();
  for (const c of chunks) {
    chunkMap.set(c.lineStart, c.id);
  }

  for (let hi = 0; hi < headings.length; hi++) {
    const h = headings[hi];
    const nextLine = headings[hi + 1]?.lineIndex ?? lines.length;
    parts.push(`${'#'.repeat(h.level)} ${h.title}`);
    parts.push('');

    const chunkId = chunkMap.get(h.lineIndex);
    if (chunkId) {
      parts.push(`<!-- chunk: ${chunkId} -->`);
    }

    for (let li = h.lineIndex + 1; li < nextLine; li++) {
      parts.push(lines[li]);
    }
    parts.push('');
  }

  return parts.join('\n');
}

export class DefaultL1Generator implements L1Generator {
  private opts: Required<L1GeneratorOptions>;

  constructor(options?: L1GeneratorOptions) {
    this.opts = { ...DEFAULT_OPTIONS, ...options };
  }

  async generate(content: string, context?: L1SourceContext): Promise<L1Result> {
    const trimmed = content.trim();
    if (trimmed.length === 0) {
      const title = context?.uri ? humanizeFilename(basenameFromUri(context.uri)) : 'Untitled Document';
      return {
        markdown: [
          '---',
          `generator: "${this.opts.generatorId}"`,
          `version: "${this.opts.version}"`,
          'sectionCount: 0',
          'chunkCount: 0',
          'isEmpty: true',
          '---',
          '',
          '# ' + title,
        ].join('\n'),
        index: {
          title,
          sections: [],
          chunks: [],
        },
      };
    }

    const lines = content.split('\n');
    let headings = parseHeadings(lines);

    // For plain-text logs without markdown headings, try heuristic segmentation.
    if (headings.length === 0 && shouldSegmentPlainText(lines)) {
      headings = segmentPlainText(lines);
    }

    const title = extractTitle(lines, context);
    const sections = buildSectionTree(headings, lines.length);
    const chunks = buildChunks(lines, headings, this.opts.maxLinesPerChunk);
    const markdown = buildL1Markdown(lines, headings, chunks, title, this.opts);

    return {
      markdown,
      index: {
        title,
        sections,
        chunks,
      },
    };
  }
}
