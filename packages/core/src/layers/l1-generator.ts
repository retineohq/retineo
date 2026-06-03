/**
 * ECHO Core — L1 Generator
 * Phase 3: Rule-based structural parser for markdown.
 * Splits content into sections (headings) and chunks.
 */

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

export interface L1Generator {
  generate(content: string): Promise<L1Result>;
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

function buildChunks(
  lines: string[],
  headings: Array<{ level: number; title: string; lineIndex: number }>,
  maxLinesPerChunk: number
): Chunk[] {
  const chunks: Chunk[] = [];

  if (headings.length === 0) {
    const text = lines.join('\n');
    chunks.push({
      id: 'chunk-001',
      lineStart: 0,
      lineEnd: lines.length - 1,
      charStart: 0,
      charEnd: text.length,
    });
    return chunks;
  }

  let chunkId = 1;
  let inCodeBlock = false;
  const titleIsRoot = headings[0].level === 1;

  // Chunk intro text before first non-title heading
  if (titleIsRoot && headings.length > 1) {
    const introStart = 0;
    const introEnd = headings[1].lineIndex;
    if (introEnd > introStart) {
      const text = lines.slice(introStart, introEnd).join('\n');
      chunks.push({
        id: `chunk-${String(chunkId++).padStart(3, '0')}`,
        lineStart: introStart,
        lineEnd: introEnd - 1,
        charStart: 0,
        charEnd: text.length,
      });
    }
  }

  for (let hi = 0; hi < headings.length; hi++) {
    const h = headings[hi];
    // Skip level-1 title chunk
    if (titleIsRoot && h.level === 1 && hi === 0) continue;

    const startLine = h.lineIndex;
    const endLine = headings[hi + 1]?.lineIndex ?? lines.length;
    const sectionLines = endLine - startLine;

    if (sectionLines <= maxLinesPerChunk) {
      const text = lines.slice(startLine, endLine).join('\n');
      chunks.push({
        id: `chunk-${String(chunkId++).padStart(3, '0')}`,
        lineStart: startLine,
        lineEnd: endLine - 1,
        charStart: lines.slice(0, startLine).join('\n').length + (startLine > 0 ? 1 : 0),
        charEnd: lines.slice(0, endLine).join('\n').length + (endLine > 0 ? 1 : 0) - 1,
        heading: h.title,
      });
    } else {
      // Split long section into multiple chunks, respecting code blocks
      let currentStart = startLine;
      let currentLineCount = 0;

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
            heading: h.title,
          });
          currentStart = chunkEnd;
          currentLineCount = 0;
        }
      }
    }
  }

  return chunks;
}

function buildL1Markdown(
  lines: string[],
  headings: Array<{ level: number; title: string; lineIndex: number }>,
  chunks: Chunk[],
  opts: Required<L1GeneratorOptions>
): string {
  const title = headings[0]?.title ?? 'Untitled Document';
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
    parts.push('<!-- chunk: chunk-001 -->');
    parts.push(lines.join('\n'));
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

  async generate(content: string): Promise<L1Result> {
    const lines = content.split('\n');
    const headings = parseHeadings(lines);
    const sections = buildSectionTree(headings, lines.length);
    const chunks = buildChunks(lines, headings, this.opts.maxLinesPerChunk);
    const markdown = buildL1Markdown(lines, headings, chunks, this.opts);

    return {
      markdown,
      index: {
        title: headings[0]?.title,
        sections,
        chunks,
      },
    };
  }
}
