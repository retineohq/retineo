/**
 * ECHO Core — Interactive Prompt Helpers
 * Readline-based single-question prompts with default values.
 *
 * Kept dependency-free: stdlib `readline` only.
 */

import { createInterface, type Interface } from 'readline';
import { Writable, Readable } from 'stream';

export interface PromptOptions {
  /** Visible question text, e.g. "Select model [1-3, default 1]" */
  question: string;
  /** Default value when the user presses Enter */
  defaultValue?: string;
  /** Hide user input (for API keys) */
  hidden?: boolean;
}

export interface ChoiceOptions<T = string> {
  question: string;
  choices: Array<{ label: string; value: T; description?: string }>;
  defaultIndex?: number;
}

/**
 * Create a single readline interface over the provided streams.
 * Caller is responsible for `rl.close()`.
 */
function makeRl(input: Readable, output: Writable): Interface {
  return createInterface({ input, output, terminal: true });
}

/**
 * Ask a single question and return the answer (or default on empty input).
 * If `hidden` is true, input is suppressed character-by-character (best-effort).
 */
export function ask(
  options: PromptOptions,
  streams: { input?: Readable; output?: Writable } = {}
): Promise<string> {
  const input = streams.input ?? process.stdin;
  const output = streams.output ?? process.stderr;
  const rl = makeRl(input, output);

  return new Promise((resolve) => {
    const q = options.defaultValue
      ? `${options.question} [${options.defaultValue}]: `
      : `${options.question}: `;
    output.write(q);

    if (options.hidden) {
      // Best-effort: read raw, but don't echo back. Node readline will still
      // display the input on a TTY unless we mute. Use raw mode workaround.
      const stdin = input as NodeJS.ReadStream;
      const wasRaw = stdin.isRaw;
      if (stdin.isTTY) stdin.setRawMode?.(true);

      let buf = '';
      const onData = (ch: Buffer | string) => {
        const s = typeof ch === 'string' ? ch : ch.toString('utf-8');
        for (const c of s) {
          const code = c.charCodeAt(0);
          if (code === 0x03) {
            // Ctrl-C
            if (stdin.isTTY && wasRaw !== undefined) stdin.setRawMode?.(wasRaw);
            rl.close();
            process.exit(130);
          } else if (code === 0x0d || code === 0x0a) {
            // Enter
            output.write('\n');
            if (stdin.isTTY && wasRaw !== undefined) stdin.setRawMode?.(wasRaw);
            stdin.removeListener('data', onData);
            rl.close();
            resolve(buf.length > 0 ? buf : (options.defaultValue ?? ''));
            return;
          } else if (code === 0x7f || code === 0x08) {
            // Backspace
            if (buf.length > 0) {
              buf = buf.slice(0, -1);
              output.write('\b \b');
            }
          } else if (code >= 0x20) {
            buf += c;
            output.write('*');
          }
        }
      };
      stdin.on('data', onData);
      return;
    }

    rl.once('line', (line) => {
      const trimmed = line.trim();
      resolve(trimmed.length > 0 ? trimmed : (options.defaultValue ?? ''));
    });
  });
}

/**
 * Ask the user to pick one of `choices`. Returns the chosen value.
 */
export async function choose<T = string>(options: ChoiceOptions<T>): Promise<T> {
  const defaultIdx = options.defaultIndex ?? 0;
  // Print choices on separate lines
  for (let i = 0; i < options.choices.length; i++) {
    const c = options.choices[i];
    const marker = i === defaultIdx ? '>' : ' ';
    const line = `  ${marker} [${i + 1}] ${c.label}${c.description ? `  (${c.description})` : ''}`;
    process.stderr.write(line + '\n');
  }
  const ans = await ask({
    question: options.question,
    defaultValue: String(defaultIdx + 1),
  });
  const idx = Math.max(0, Math.min(options.choices.length - 1, parseInt(ans, 10) - 1));
  return options.choices[idx]!.value;
}

/**
 * Ask yes/no. Default if Enter pressed.
 */
export async function confirm(question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? 'Y/n' : 'y/N';
  const ans = await ask({ question: `${question} [${hint}]`, defaultValue: defaultYes ? 'y' : 'n' });
  const v = ans.trim().toLowerCase();
  if (v === '') return defaultYes;
  if (v === 'y' || v === 'yes') return true;
  if (v === 'n' || v === 'no') return false;
  return defaultYes;
}
