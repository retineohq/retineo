/**
 * Image OCR Adapter Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import os from 'os';
import { DefaultAdapterManager } from '../../packages/core/src/adapters/manager.js';
import { DefaultAdapterProcessRunner } from '../../packages/core/src/adapters/runner.js';

let tmpDir: string;
let adaptersDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'echo-img-'));
  adaptersDir = path.join(tmpDir, 'adapters');
  mkdirSync(adaptersDir);

  const srcDir = path.join(process.cwd(), 'packages/core/adapters/image');
  const destDir = path.join(adaptersDir, 'image');
  mkdirSync(destDir);
  const { readFileSync } = require('fs');
  writeFileSync(
    path.join(destDir, 'manifest.json'),
    readFileSync(path.join(srcDir, 'manifest.json'))
  );
  writeFileSync(
    path.join(destDir, 'adapter.js'),
    readFileSync(path.join(srcDir, 'adapter.js'))
  );
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// Helper to create a minimal valid PNG (1x1 red pixel)
function createMinimalPNG(): Buffer {
  // PNG signature
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  // IHDR chunk: width=1, height=1, bit depth=8, color type=2 (RGB), compression=0, filter=0, interlace=0
  const ihdrData = Buffer.from([0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00]);
  const ihdrLen = Buffer.alloc(4);
  ihdrLen.writeUInt32BE(ihdrData.length, 0);
  const ihdrType = Buffer.from('IHDR');
  const ihdrCrc = Buffer.alloc(4);
  const zlib = require('zlib');
  const crc = require('crypto').createHash('md5'); // not real CRC, but pngcheck will fail; tesseract.js may still accept
  // Actually compute proper CRC32 for PNG
  function crc32(buf: Buffer): number {
    let c = ~0;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let j = 0; j < 8; j++) {
        c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
      }
    }
    return ~c >>> 0;
  }
  const ihdrCrcVal = crc32(Buffer.concat([ihdrType, ihdrData]));
  ihdrCrc.writeUInt32BE(ihdrCrcVal, 0);
  const ihdr = Buffer.concat([ihdrLen, ihdrType, ihdrData, ihdrCrc]);

  // IDAT: compressed image data (filter byte 0 + RGB pixel 255,0,0)
  const raw = Buffer.from([0x00, 0xff, 0x00, 0x00]);
  const compressed = zlib.deflateSync(raw);
  const idatLen = Buffer.alloc(4);
  idatLen.writeUInt32BE(compressed.length, 0);
  const idatType = Buffer.from('IDAT');
  const idatCrc = Buffer.alloc(4);
  const idatCrcVal = crc32(Buffer.concat([idatType, compressed]));
  idatCrc.writeUInt32BE(idatCrcVal, 0);
  const idat = Buffer.concat([idatLen, idatType, compressed, idatCrc]);

  // IEND
  const iendLen = Buffer.alloc(4, 0);
  const iendType = Buffer.from('IEND');
  const iendCrc = Buffer.alloc(4);
  const iendCrcVal = crc32(iendType);
  iendCrc.writeUInt32BE(iendCrcVal, 0);
  const iend = Buffer.concat([iendLen, iendType, iendCrc]);

  return Buffer.concat([signature, ihdr, idat, iend]);
}

describe('image adapter', () => {
  it('loads from manifest', async () => {
    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();
    expect(manager.list()).toContain('image');
  });

  it('resolves .png by extension', async () => {
    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();
    const id = await manager.resolve('/tmp/photo.png');
    expect(id).toBe('image');
  });

  it('resolves .jpg by extension', async () => {
    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();
    const id = await manager.resolve('/tmp/photo.jpg');
    expect(id).toBe('image');
  });

  it('returns empty content for blank image', async () => {
    const filePath = path.join(tmpDir, 'blank.png');
    writeFileSync(filePath, createMinimalPNG());

    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();

    const result = await manager.ingest(filePath);
    expect(result.content).toBe('');
    expect(result.metadata.blocks.length).toBe(0);
  });

  it('returns error for unsupported format', async () => {
    const filePath = path.join(tmpDir, 'photo.gif');
    writeFileSync(filePath, Buffer.from('GIF89a'));

    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();

    // Manager resolves by mimeType before calling adapter — gif is not supported
    await expect(manager.ingest(filePath, 'image/gif')).rejects.toThrow('No adapter found');
  });

  it('returns error for missing file', async () => {
    const filePath = path.join(tmpDir, 'missing.png');

    const runner = new DefaultAdapterProcessRunner(tmpDir);
    const manager = new DefaultAdapterManager(adaptersDir, runner);
    await manager.loadBuiltIn();

    await expect(manager.ingest(filePath)).rejects.toThrow('File not found');
  });

  it('manifest has status: stable', () => {
    const { readFileSync } = require('fs');
    const manifest = JSON.parse(
      readFileSync(path.join(adaptersDir, 'image', 'manifest.json'), 'utf-8')
    );
    expect(manifest.status).toBe('stable');
  });
});
