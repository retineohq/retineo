/**
 * L1 Generator Tests
 */

import { describe, it, expect } from 'vitest';
import { DefaultL1Generator } from '../../packages/core/src/layers/l1-generator.js';

describe('DefaultL1Generator', () => {
  const gen = new DefaultL1Generator();

  it('parses headings into sections and chunks', async () => {
    const content = '# Title\n\nIntro text.\n\n## Section A\n\nBody A.\n\n## Section B\n\nBody B.';
    const result = await gen.generate(content);

    expect(result.index.title).toBe('Title');
    expect(result.index.sections).toHaveLength(2);
    expect(result.index.sections[0].title).toBe('Section A');
    expect(result.index.sections[0].level).toBe(2);
    expect(result.index.chunks).toHaveLength(3); // intro + Section A + Section B
    expect(result.index.chunks[0].heading).toBeUndefined(); // intro chunk
    expect(result.index.chunks[1].heading).toBe('Section A');
    expect(result.index.chunks[2].heading).toBe('Section B');
  });

  it('handles no headings → single chunk', async () => {
    const content = 'Just some plain text without any headings.';
    const result = await gen.generate(content);

    expect(result.index.sections).toHaveLength(0);
    expect(result.index.chunks).toHaveLength(1);
    expect(result.index.chunks[0].id).toBe('chunk-001');
    expect(result.markdown).toContain('chunk-001');
  });

  it('preserves code blocks and does not split inside them', async () => {
    const lines: string[] = [];
    lines.push('# Title');
    lines.push('');
    lines.push('```js');
    for (let i = 0; i < 600; i++) {
      lines.push(`const x${i} = ${i};`);
    }
    lines.push('```');
    lines.push('');
    lines.push('## After code');
    lines.push('text');

    const content = lines.join('\n');
    const result = await gen.generate(content);

    // Code block lines should be inside one chunk
    const chunkWithCode = result.index.chunks.find((c) => c.lineStart <= 3 && c.lineEnd >= 603);
    expect(chunkWithCode).toBeDefined();
  });

  it('splits long sections into multiple chunks', async () => {
    const lines: string[] = [];
    lines.push('# Title');
    lines.push('');
    lines.push('## Long Section');
    for (let i = 0; i < 600; i++) {
      lines.push(`Line ${i}`);
    }

    const content = lines.join('\n');
    const result = await gen.generate(content);

    const sectionChunks = result.index.chunks.filter((c) => c.heading === 'Long Section');
    expect(sectionChunks.length).toBeGreaterThan(1);
  });

  it('outputs YAML frontmatter in markdown', async () => {
    const content = '# Doc\n\nText.';
    const result = await gen.generate(content);

    expect(result.markdown.startsWith('---')).toBe(true);
    expect(result.markdown).toContain('generator: "outline-parser"');
    expect(result.markdown).toContain('sectionCount:');
    expect(result.markdown).toContain('chunkCount:');
  });

  it('builds nested section tree', async () => {
    const content = '# Root\n## A\n### A1\n### A2\n## B\n';
    const result = await gen.generate(content);

    expect(result.index.sections[0].children).toHaveLength(2);
    expect(result.index.sections[0].children[0].title).toBe('A1');
    expect(result.index.sections[0].children[1].title).toBe('A2');
    expect(result.index.sections[1].title).toBe('B');
  });
});
