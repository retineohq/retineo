/**
 * ECHO Core — Language Pack Registry
 * Phase 4: Load built-in packs, resolve by code, allow config overrides.
 */

import type { LanguagePack } from './language-pack.js';
import { enPack } from './packs/en.js';
import { ruPack } from './packs/ru.js';
import { zhPack } from './packs/zh.js';

export interface LanguagePackRegistry {
  register(pack: LanguagePack): void;
  get(code: string): LanguagePack | undefined;
  list(): string[];
  resolvePrompt(code: string, promptName: keyof LanguagePack['prompts']): string | undefined;
}

export class DefaultLanguagePackRegistry implements LanguagePackRegistry {
  private packs = new Map<string, LanguagePack>();

  constructor() {
    this.register(enPack);
    this.register(ruPack);
    this.register(zhPack);
  }

  register(pack: LanguagePack): void {
    this.packs.set(pack.code, pack);
  }

  get(code: string): LanguagePack | undefined {
    return this.packs.get(code);
  }

  list(): string[] {
    return Array.from(this.packs.keys());
  }

  resolvePrompt(code: string, promptName: keyof LanguagePack['prompts']): string | undefined {
    const pack = this.packs.get(code);
    if (!pack) return undefined;
    return pack.prompts[promptName];
  }
}
