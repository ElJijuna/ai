import { AIFeatureNotSupportedError } from '../errors.js';
import { normalizeTextStream } from '../utils/stream.js';

export interface RewriteOptions {
  tone?: 'as-is' | 'more-formal' | 'more-casual';
  format?: 'as-is' | 'markdown' | 'plain-text';
  length?: 'as-is' | 'shorter' | 'longer';
  sharedContext?: string;
  context?: string;
  signal?: AbortSignal;
}

/** Rewrites `text` using Chrome's Rewriter API. */
export async function rewrite(text: string, options: RewriteOptions = {}): Promise<string> {
  if (typeof globalThis.Rewriter === 'undefined') {
    throw new AIFeatureNotSupportedError('rewriter');
  }

  const { context, signal, ...createOptions } = options;
  const rewriter = await globalThis.Rewriter.create(createOptions);

  try {
    return await rewriter.rewrite(text, { context, signal });
  } finally {
    rewriter.destroy();
  }
}

/** Streaming variant of {@link rewrite}. */
export async function* rewriteStream(
  text: string,
  options: RewriteOptions = {},
): AsyncGenerator<string> {
  if (typeof globalThis.Rewriter === 'undefined') {
    throw new AIFeatureNotSupportedError('rewriter');
  }

  const { context, signal, ...createOptions } = options;
  const rewriter = await globalThis.Rewriter.create(createOptions);

  try {
    yield* normalizeTextStream(rewriter.rewriteStreaming(text, { context, signal }));
  } finally {
    rewriter.destroy();
  }
}
