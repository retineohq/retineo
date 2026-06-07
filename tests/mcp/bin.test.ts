/**
 * ECHO Core — MCP Bin Entry Point Tests
 */

import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import path from 'path';

describe('echo-mcp bin', () => {
  it('bin file exists', () => {
    const binPath = path.join(process.cwd(), 'bin', 'echo-mcp.js');
    expect(existsSync(binPath)).toBe(true);
  });

  it('exports EchoMCPServer from dist', async () => {
    const { EchoMCPServer } = await import('../../packages/core/src/mcp/server.js');
    expect(EchoMCPServer).toBeDefined();
  });
});
