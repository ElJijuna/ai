import { AIFeatureNotSupportedError } from '../errors.js';
import { normalizeTextStream } from '../utils/stream.js';

export interface WriteOptions {
  tone?: 'formal' | 'neutral' | 'casual';
  format?: 'markdown' | 'plain-text';
  length?: 'short' | 'medium' | 'long';
  sharedContext?: string;
  context?: string;
  signal?: AbortSignal;
}

/** Drafts new text from `prompt` using Chrome's Writer API. */
export async function write(prompt: string, options: WriteOptions = {}): Promise<string> {
  if (typeof globalThis.Writer === 'undefined') {
    throw new AIFeatureNotSupportedError('writer');
  }

  const { context, signal, ...createOptions } = options;
  const writer = await globalThis.Writer.create(createOptions);

  try {
    return await writer.write(prompt, { context, signal });
  } finally {
    writer.destroy();
  }
}

/** Streaming variant of {@link write}. */
export async function* writeStream(
  prompt: string,
  options: WriteOptions = {},
): AsyncGenerator<string> {
  if (typeof globalThis.Writer === 'undefined') {
    throw new AIFeatureNotSupportedError('writer');
  }

  const { context, signal, ...createOptions } = options;
  const writer = await globalThis.Writer.create(createOptions);

  try {
    yield* normalizeTextStream(writer.writeStreaming(prompt, { context, signal }));
  } finally {
    writer.destroy();
  }
}
