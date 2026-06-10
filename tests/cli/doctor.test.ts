/**
 * CLI Doctor Command Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { runDoctor, formatDoctor } from '../../packages/core/src/cli/doctor.js';

describe('doctor', () => {
  it('returns checks array', async () => {
    const result = await runDoctor();
    expect(result.checks.length).toBeGreaterThan(0);
    expect(result.checks.some((c) => c.name.startsWith('Node.js'))).toBe(true);
  });

  it('Node.js is installed and required', async () => {
    const result = await runDoctor();
    const node = result.checks.find((c) => c.name.startsWith('Node.js'));
    expect(node).toBeDefined();
    expect(node!.required).toBe(true);
    expect(node!.installed).toBe(true);
  });

  it('includes whisper.cpp check', async () => {
    const result = await runDoctor();
    const whisper = result.checks.find((c) => c.name === 'whisper.cpp');
    expect(whisper).toBeDefined();
    expect(whisper!.required).toBe(false);
  });

  it('includes whisper model check', async () => {
    const result = await runDoctor();
    const model = result.checks.find((c) => c.name === 'whisper model');
    expect(model).toBeDefined();
    expect(model!.required).toBe(false);
  });

  it('includes Whisper API key check as optional', async () => {
    const result = await runDoctor();
    const key = result.checks.find((c) => c.name === 'Whisper API key');
    expect(key).toBeDefined();
    expect(key!.required).toBe(false);
  });

  it('formatDoctor produces lines', async () => {
    const result = await runDoctor();
    const out = formatDoctor(result);
    expect(out).toContain('RETINEO Core Dependency Check');
    expect(out).toContain('Node.js');
    expect(out).toContain('whisper.cpp');
    expect(out).toContain('whisper model');
  });

  it('ok is true when Node.js present', async () => {
    const result = await runDoctor();
    expect(result.ok).toBe(true);
  });
});
