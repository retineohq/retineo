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

  it('formatDoctor produces lines', async () => {
    const result = await runDoctor();
    const out = formatDoctor(result);
    expect(out).toContain('ECHO Core Dependency Check');
    expect(out).toContain('Node.js');
  });

  it('ok is true when Node.js present', async () => {
    const result = await runDoctor();
    expect(result.ok).toBe(true);
  });
});
