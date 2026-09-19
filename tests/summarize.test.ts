import { describe, expect, it, vi } from 'vitest';
import { summarize, summarizeStream } from '../src/actions/summarize.js';
import { AIFeatureNotSupportedError } from '../src/errors.js';

function streamFrom(chunks: string[]): ReadableStream<string> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }

      controller.close();
    },
  });
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];

  for await (const value of iterable) {
    out.push(value);
  }

  return out;
}

describe('summarize', () => {
  it('throws AIFeatureNotSupportedError when the browser has no Summarizer', async () => {
    await expect(summarize('long text')).rejects.toThrow(AIFeatureNotSupportedError);
  });

  it('summarizes the text, splitting context/signal from the create() options, and destroys afterwards', async () => {
    const destroy = vi.fn();
    const summarizeFn = vi.fn(() => Promise.resolve('a short summary'));
    const create = vi.fn(() =>
      Promise.resolve({ summarize: summarizeFn, summarizeStreaming: vi.fn(), destroy }),
    );

    globalThis.Summarizer = { availability: vi.fn(), create };

    const { signal } = new AbortController();
    const result = await summarize('long text', {
      type: 'tldr',
      sharedContext: 'product reviews',
      context: 'for a listing page',
      signal,
    });

    expect(result).toBe('a short summary');
    expect(create).toHaveBeenCalledWith({ type: 'tldr', sharedContext: 'product reviews' });
    expect(summarizeFn).toHaveBeenCalledWith('long text', {
      context: 'for a listing page',
      signal,
    });
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});

describe('summarizeStream', () => {
  it('throws AIFeatureNotSupportedError when the browser has no Summarizer', async () => {
    await expect(collect(summarizeStream('long text'))).rejects.toThrow(AIFeatureNotSupportedError);
  });

  it('yields normalized deltas and destroys the session once the stream ends', async () => {
    const destroy = vi.fn();

    globalThis.Summarizer = {
      availability: vi.fn(),
      create: vi.fn(() =>
        Promise.resolve({
          summarize: vi.fn(),
          summarizeStreaming: vi.fn(() => streamFrom(['A', 'A sh', 'A short summary'])),
          destroy,
        }),
      ),
    };

    const chunks = await collect(summarizeStream('long text'));

    expect(chunks.join('')).toBe('A short summary');
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
