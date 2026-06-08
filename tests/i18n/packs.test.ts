/**
 * Language Pack Tests
 */

import { describe, it, expect } from 'vitest';
import { DefaultLanguagePackRegistry } from '../../packages/core/src/i18n/registry.js';
import { enPack } from '../../packages/core/src/i18n/packs/en.js';
import { ruPack } from '../../packages/core/src/i18n/packs/ru.js';
import { zhPack } from '../../packages/core/src/i18n/packs/zh.js';

describe('DefaultLanguagePackRegistry', () => {
  const registry = new DefaultLanguagePackRegistry();

  it('lists built-in packs', () => {
    const codes = registry.list();
    expect(codes).toContain('en');
    expect(codes).toContain('ru');
    expect(codes).toContain('zh');
  });

  it('gets English pack', () => {
    const pack = registry.get('en');
    expect(pack).toBeDefined();
    expect(pack!.code).toBe('en');
    expect(pack!.name).toBe('English');
  });

  it('gets Russian pack', () => {
    const pack = registry.get('ru');
    expect(pack).toBeDefined();
    expect(pack!.code).toBe('ru');
    expect(pack!.name).toBe('Русский');
  });

  it('gets Chinese pack', () => {
    const pack = registry.get('zh');
    expect(pack).toBeDefined();
    expect(pack!.code).toBe('zh');
    expect(pack!.name).toBe('中文');
  });

  it('resolves English prompts', () => {
    const prompt = registry.resolvePrompt('en', 'intentClassification');
    expect(prompt).toBeDefined();
    expect(prompt).toContain('VAGUE');
  });

  it('resolves Russian prompts', () => {
    const prompt = registry.resolvePrompt('ru', 'intentClassification');
    expect(prompt).toBeDefined();
    expect(prompt).toContain('VAGUE');
  });

  it('resolves Chinese prompts', () => {
    const prompt = registry.resolvePrompt('zh', 'intentClassification');
    expect(prompt).toBeDefined();
    expect(prompt).toContain('VAGUE');
  });

  it('returns undefined for unknown code', () => {
    expect(registry.get('ja')).toBeUndefined();
    expect(registry.resolvePrompt('ja', 'intentClassification')).toBeUndefined();
  });

  it('allows registering new packs', () => {
    const custom = {
      code: 'de',
      name: 'Deutsch',
      prompts: {
        intentClassification: 'German intent prompt',
        entityExtraction: 'German entity prompt',
        l2Generation: 'German L2 prompt',
        contextAssembly: 'German context prompt',
      },
      search: { defaultThreshold: 0.75, keywordBoost: 1, semanticBoost: 1 },
    };
    registry.register(custom);
    expect(registry.list()).toContain('de');
    expect(registry.resolvePrompt('de', 'intentClassification')).toBe('German intent prompt');
  });
});

describe('Pack search tuning', () => {
  it('English has default threshold 0.5', () => {
    expect(enPack.search.defaultThreshold).toBe(0.5);
  });

  it('Russian has lower threshold 0.72', () => {
    expect(ruPack.search.defaultThreshold).toBe(0.72);
  });

  it('Chinese has lower threshold 0.7', () => {
    expect(zhPack.search.defaultThreshold).toBe(0.7);
  });

  it('Russian has higher keyword boost', () => {
    expect(ruPack.search.keywordBoost).toBe(1.1);
  });

  it('Chinese has higher keyword boost', () => {
    expect(zhPack.search.keywordBoost).toBe(1.2);
  });
});

describe('Pack script regex', () => {
  it('Russian pack matches Cyrillic', () => {
    expect(ruPack.scriptRegex!.test('Привет')).toBe(true);
    expect(ruPack.scriptRegex!.test('Hello')).toBe(false);
  });

  it('Chinese pack matches CJK', () => {
    expect(zhPack.scriptRegex!.test('你好')).toBe(true);
    expect(zhPack.scriptRegex!.test('Hello')).toBe(false);
  });
});
