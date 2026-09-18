import { AIFeatureNotSupportedError } from '../errors.js';
import { normalizeTextStream } from '../utils/stream.js';

export interface SummarizeOptions {
  type?: 'key-points' | 'tldr' | 'teaser' | 'headline';
  format?: 'markdown' | 'plain-text';
  length?: 'short' | 'medium' | 'long';
  /** Background the summarizer should always know, e.g. "product reviews for a camera shop". */
  sharedContext?: string;
  /** Extra context specific to this one call. */
  context?: string;
  signal?: AbortSignal;
}

/** Summarizes `text` using Chrome's Summarizer API. */
export async function summarize(text: string, options: SummarizeOptions = {}): Promise<string> {
  if (typeof globalThis.Summarizer === 'undefined') {
    throw new AIFeatureNotSupportedError('summarizer');
  }

  const { context, signal, ...createOptions } = options;
  const summarizer = await globalThis.Summarizer.create(createOptions);

  try {
    return await summarizer.summarize(text, { context, signal });
  } finally {
    summarizer.destroy();
  }
}

/** Streaming variant of {@link summarize}. */
export async function* summarizeStream(
  text: string,
  options: SummarizeOptions = {},
): AsyncGenerator<string> {
  if (typeof globalThis.Summarizer === 'undefined') {
    throw new AIFeatureNotSupportedError('summarizer');
  }

  const { context, signal, ...createOptions } = options;
  const summarizer = await globalThis.Summarizer.create(createOptions);

  try {
    yield* normalizeTextStream(summarizer.summarizeStreaming(text, { context, signal }));
  } finally {
    summarizer.destroy();
  }
}
