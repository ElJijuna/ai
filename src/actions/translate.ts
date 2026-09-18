import { AIFeatureNotSupportedError } from '../errors.js';
import type { AvailabilityInfo } from '../types.js';
import { normalizeTextStream } from '../utils/stream.js';

export interface TranslateOptions {
  /** BCP 47 source language tag, e.g. `'en'`. */
  from: string;
  /** BCP 47 target language tag, e.g. `'es'`. */
  to: string;
  signal?: AbortSignal;
}

/**
 * Checks whether this specific `from`/`to` language pair is supported and ready,
 * unlike the generic `isAvailable('translator')`, whose result doesn't depend on a
 * language pair and so can't tell you whether a given pair still needs a download.
 */
export async function isTranslationAvailable(
  options: Pick<TranslateOptions, 'from' | 'to'>,
): Promise<AvailabilityInfo> {
  if (typeof globalThis.Translator === 'undefined') {
    return { feature: 'translator', state: 'unsupported', supported: false };
  }

  try {
    const state = await globalThis.Translator.availability({
      sourceLanguage: options.from,
      targetLanguage: options.to,
    });

    return { feature: 'translator', state, supported: true };
  } catch {
    return { feature: 'translator', state: 'unknown', supported: true };
  }
}

/** Translates `text` using Chrome's Translator API. */
export async function translate(text: string, options: TranslateOptions): Promise<string> {
  if (typeof globalThis.Translator === 'undefined') {
    throw new AIFeatureNotSupportedError('translator');
  }

  const translator = await globalThis.Translator.create({
    sourceLanguage: options.from,
    targetLanguage: options.to,
    signal: options.signal,
  });

  try {
    return await translator.translate(text, { signal: options.signal });
  } finally {
    translator.destroy();
  }
}

/** Streaming variant of {@link translate}. */
export async function* translateStream(
  text: string,
  options: TranslateOptions,
): AsyncGenerator<string> {
  if (typeof globalThis.Translator === 'undefined') {
    throw new AIFeatureNotSupportedError('translator');
  }

  const translator = await globalThis.Translator.create({
    sourceLanguage: options.from,
    targetLanguage: options.to,
    signal: options.signal,
  });

  try {
    yield* normalizeTextStream(translator.translateStreaming(text, { signal: options.signal }));
  } finally {
    translator.destroy();
  }
}
