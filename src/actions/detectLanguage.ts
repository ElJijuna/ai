import { AIFeatureNotSupportedError } from '../errors.js';
import type { LanguageDetectorResult } from '../types/chrome-ai.js';

export type { LanguageDetectorResult };

/** Detects the likely language(s) of `text` using Chrome's Language Detector API. */
export async function detectLanguage(
  text: string,
  options: { signal?: AbortSignal } = {},
): Promise<LanguageDetectorResult[]> {
  if (typeof globalThis.LanguageDetector === 'undefined') {
    throw new AIFeatureNotSupportedError('languageDetector');
  }

  const detector = await globalThis.LanguageDetector.create({ signal: options.signal });

  try {
    return await detector.detect(text, { signal: options.signal });
  } finally {
    detector.destroy();
  }
}
