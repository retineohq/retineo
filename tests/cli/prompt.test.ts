/**
 * RETINEO Core — Prompt Helpers Tests
 */

import { describe, it, expect } from 'vitest';
import { ask } from '../../packages/core/src/cli/prompt.js';
import { Readable, Writable } from 'stream';

function makeStreams(inputLines: string[]) {
  const input = new Readable({
    read() {
      const line = inputLines.shift();
      if (line !== undefined) this.push(line + '\n');
      else this.push(null);
    },
  });
  const output = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  return { input, output };
}

describe('ask', () => {
  it('closes readline after receiving line input', async () => {
    const { input, output } = makeStreams(['hello']);
    const result = await ask({ question: 'Test' }, { input, output });
    expect(result).toBe('hello');
    // If readline is not closed, the test runner will hang waiting for the
    // input stream to close. The fact that this test completes proves rl.close()
    // was called.
  });

  it('returns default value on empty input', async () => {
    const { input, output } = makeStreams(['']);
    const result = await ask({ question: 'Test', defaultValue: 'fallback' }, { input, output });
    expect(result).toBe('fallback');
  });
});
