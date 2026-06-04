/**
 * ECHO Core — Language Detector
 * Phase 4: franc + heuristic fallback. CLD3 stub for optional future use.
 */

export interface DetectedLanguage {
  code: string;
  confidence: number;
  script: string;
}

export interface LanguageDetector {
  detect(text: string): Promise<DetectedLanguage>;
}

// Heuristic script detection
const SCRIPT_PATTERNS: Array<{ script: string; regex: RegExp; code: string }> = [
  { script: 'cyrillic', regex: /[\u0400-\u04FF]/, code: 'ru' },
  { script: 'cjk', regex: /[\u4E00-\u9FFF\u3400-\u4DBF]/, code: 'zh' },
  { script: 'arabic', regex: /[\u0600-\u06FF]/, code: 'ar' },
  { script: 'devanagari', regex: /[\u0900-\u097F]/, code: 'hi' },
  { script: 'korean', regex: /[\uAC00-\uD7AF]/, code: 'ko' },
  { script: 'japanese', regex: /[\u3040-\u309F\u30A0-\u30FF]/, code: 'ja' },
];

function heuristicDetect(text: string): DetectedLanguage {
  for (const p of SCRIPT_PATTERNS) {
    if (p.regex.test(text)) {
      return { code: p.code, confidence: 0.6, script: p.script };
    }
  }
  return { code: 'en', confidence: 0.5, script: 'latin' };
}

/** Heuristic-only detector (no deps). */
export class HeuristicDetector implements LanguageDetector {
  async detect(text: string): Promise<DetectedLanguage> {
    return heuristicDetect(text);
  }
}

/** Franc-based detector. Falls back to heuristic if franc unavailable or low confidence. */
export class FrancDetector implements LanguageDetector {
  private fallback: LanguageDetector;
  private confidenceThreshold: number;

  constructor(fallback?: LanguageDetector, confidenceThreshold = 0.7) {
    this.fallback = fallback ?? new HeuristicDetector();
    this.confidenceThreshold = confidenceThreshold;
  }

  async detect(text: string): Promise<DetectedLanguage> {
    try {
      // Dynamic import so franc remains optional at runtime
      const mod = await import('franc') as unknown as { franc?: (t: string) => string };
      const francFn = mod.franc;
      if (!francFn) {
        return this.fallback.detect(text);
      }
      const code = francFn(text);
      if (!code || code === 'und') {
        return this.fallback.detect(text);
      }
      // franc does not give confidence; we estimate based on text length
      const confidence = text.length > 20 ? 0.85 : 0.65;
      if (confidence < this.confidenceThreshold) {
        const fb = await this.fallback.detect(text);
        if (fb.confidence > confidence) return fb;
      }
      return { code, confidence, script: 'unknown' };
    } catch {
      return this.fallback.detect(text);
    }
  }
}

/** CLD3 detector stub. Requires optional `cld3` package. */
export class CLD3Detector implements LanguageDetector {
  private fallback: LanguageDetector;

  constructor(fallback?: LanguageDetector) {
    this.fallback = fallback ?? new HeuristicDetector();
  }

  async detect(text: string): Promise<DetectedLanguage> {
    try {
      // cld3 is an optional heavy dependency; stub dynamic import
      // @ts-expect-error cld3 is an optional dependency
      const cld3 = await import('cld3') as unknown as { findLanguage?: (t: string) => { language: string; is_reliable: boolean; proportion: number } };
      if (!cld3.findLanguage) {
        return this.fallback.detect(text);
      }
      const result = cld3.findLanguage(text);
      const confidence = result.is_reliable ? 0.95 : result.proportion;
      return { code: result.language, confidence, script: 'unknown' };
    } catch {
      return this.fallback.detect(text);
    }
  }
}

/** Factory to create detector from config string. */
export function createDetector(
  provider: 'franc' | 'cld3' | 'heuristic',
  confidenceThreshold = 0.7
): LanguageDetector {
  const heuristic = new HeuristicDetector();
  switch (provider) {
    case 'franc':
      return new FrancDetector(heuristic, confidenceThreshold);
    case 'cld3':
      return new CLD3Detector(heuristic);
    case 'heuristic':
    default:
      return heuristic;
  }
}
