import { AIFeatureNotSupportedError } from '../errors.js';
import { normalizeTextStream } from '../utils/stream.js';

export interface TranslateOptions {
  /** BCP 47 source language tag, e.g. `'en'`. */
  from: string;
  /** BCP 47 target language tag, e.g. `'es'`. */
  to: string;
  signal?: AbortSignal;
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
