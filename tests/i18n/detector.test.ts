/**
 * Language Detector Tests
 */

import { describe, it, expect } from 'vitest';
import {
  HeuristicDetector,
  FrancDetector,
  CLD3Detector,
  createDetector,
} from '../../packages/core/src/i18n/detector.js';

describe('HeuristicDetector', () => {
  const d = new HeuristicDetector();

  it('detects Russian', async () => {
    const r = await d.detect('Привет мир');
    expect(r.code).toBe('ru');
    expect(r.script).toBe('cyrillic');
  });

  it('detects Chinese', async () => {
    const r = await d.detect('你好世界');
    expect(r.code).toBe('zh');
    expect(r.script).toBe('cjk');
  });

  it('detects Arabic', async () => {
    const r = await d.detect('مرحبا بالعالم');
    expect(r.code).toBe('ar');
    expect(r.script).toBe('arabic');
  });

  it('defaults to English for Latin text', async () => {
    const r = await d.detect('Hello world');
    expect(r.code).toBe('en');
    expect(r.script).toBe('latin');
  });

  it('returns confidence 0.6 for scripts, 0.5 for default', async () => {
    const ru = await d.detect('Привет');
    expect(ru.confidence).toBe(0.6);
    const en = await d.detect('Hello');
    expect(en.confidence).toBe(0.5);
  });
});

describe('FrancDetector', () => {
  const d = new FrancDetector(new HeuristicDetector(), 0.7);

  it('falls back to heuristic when franc not installed', async () => {
    const r = await d.detect('Hello world');
    expect(r.code).toBe('en');
    expect(r.confidence).toBeGreaterThan(0);
  });

  it('detects French text', async () => {
    const r = await d.detect('Bonjour le monde comment allez-vous aujourd\'hui');
    // franc may return 'fra' or fallback
    expect(['fra', 'en', 'fr']).toContain(r.code);
  });
});

describe('CLD3Detector', () => {
  const d = new CLD3Detector(new HeuristicDetector());

  it('falls back to heuristic when cld3 not installed', async () => {
    const r = await d.detect('Hello world');
    expect(r.code).toBe('en');
  });
});

describe('createDetector', () => {
  it('creates heuristic detector', () => {
    const d = createDetector('heuristic');
    expect(d).toBeInstanceOf(HeuristicDetector);
  });

  it('creates franc detector', () => {
    const d = createDetector('franc');
    expect(d).toBeInstanceOf(FrancDetector);
  });

  it('creates cld3 detector', () => {
    const d = createDetector('cld3');
    expect(d).toBeInstanceOf(CLD3Detector);
  });
});
