import { describe, expect, it, vi } from 'vitest';
import { write, writeStream } from '../src/actions/write.js';
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

describe('write', () => {
  it('throws AIFeatureNotSupportedError when the browser has no Writer', async () => {
    await expect(write('a product announcement')).rejects.toThrow(AIFeatureNotSupportedError);
  });

  it('drafts the text, splitting context/signal from the create() options, and destroys afterwards', async () => {
    const destroy = vi.fn();
    const writeFn = vi.fn(() => Promise.resolve('Introducing our new lens.'));
    const create = vi.fn(() =>
      Promise.resolve({ write: writeFn, writeStreaming: vi.fn(), destroy }),
    );

    globalThis.Writer = { availability: vi.fn(), create };

    const { signal } = new AbortController();
    const result = await write('a product announcement', {
      tone: 'formal',
      sharedContext: 'camera shop',
      context: 'for the homepage',
      signal,
    });

    expect(result).toBe('Introducing our new lens.');
    expect(create).toHaveBeenCalledWith({ tone: 'formal', sharedContext: 'camera shop' });
    expect(writeFn).toHaveBeenCalledWith('a product announcement', {
      context: 'for the homepage',
      signal,
    });
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});

describe('writeStream', () => {
  it('throws AIFeatureNotSupportedError when the browser has no Writer', async () => {
    await expect(collect(writeStream('a product announcement'))).rejects.toThrow(
      AIFeatureNotSupportedError,
    );
  });

  it('yields normalized deltas and destroys the session once the stream ends', async () => {
    const destroy = vi.fn();

    globalThis.Writer = {
      availability: vi.fn(),
      create: vi.fn(() =>
        Promise.resolve({
          write: vi.fn(),
          writeStreaming: vi.fn(() => streamFrom(['In', 'Introd', 'Introducing our new lens.'])),
          destroy,
        }),
      ),
    };

    const chunks = await collect(writeStream('a product announcement'));

    expect(chunks.join('')).toBe('Introducing our new lens.');
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
