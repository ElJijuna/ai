import { describe, expect, it, vi } from 'vitest';
import { rewrite, rewriteStream } from '../src/actions/rewrite.js';
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

describe('rewrite', () => {
  it('throws AIFeatureNotSupportedError when the browser has no Rewriter', async () => {
    await expect(rewrite('draft')).rejects.toThrow(AIFeatureNotSupportedError);
  });

  it('rewrites the text, splitting context/signal from the create() options, and destroys afterwards', async () => {
    const destroy = vi.fn();
    const rewriteFn = vi.fn(() => Promise.resolve('a nicer draft'));
    const create = vi.fn(() =>
      Promise.resolve({ rewrite: rewriteFn, rewriteStreaming: vi.fn(), destroy }),
    );

    globalThis.Rewriter = { availability: vi.fn(), create };

    const { signal } = new AbortController();
    const result = await rewrite('draft', {
      tone: 'more-formal',
      sharedContext: 'product reviews',
      context: 'for a landing page',
      signal,
    });

    expect(result).toBe('a nicer draft');
    expect(create).toHaveBeenCalledWith({ tone: 'more-formal', sharedContext: 'product reviews' });
    expect(rewriteFn).toHaveBeenCalledWith('draft', { context: 'for a landing page', signal });
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});

describe('rewriteStream', () => {
  it('throws AIFeatureNotSupportedError when the browser has no Rewriter', async () => {
    await expect(collect(rewriteStream('draft'))).rejects.toThrow(AIFeatureNotSupportedError);
  });

  it('yields normalized deltas and destroys the session once the stream ends', async () => {
    const destroy = vi.fn();

    globalThis.Rewriter = {
      availability: vi.fn(),
      create: vi.fn(() =>
        Promise.resolve({
          rewrite: vi.fn(),
          rewriteStreaming: vi.fn(() => streamFrom(['A', 'A nic', 'A nicer draft'])),
          destroy,
        }),
      ),
    };

    const chunks = await collect(rewriteStream('draft'));

    expect(chunks.join('')).toBe('A nicer draft');
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
