import { describe, expect, it } from 'vitest';
import { normalizeTextStream, toAsyncIterable } from '../src/utils/stream.js';

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

describe('toAsyncIterable', () => {
  it('yields every chunk from a ReadableStream', async () => {
    const result = await collect(toAsyncIterable(streamFrom(['a', 'b', 'c'])));

    expect(result).toEqual(['a', 'b', 'c']);
  });
});

describe('normalizeTextStream', () => {
  it('converts cumulative chunks into incremental deltas', async () => {
    const result = await collect(normalizeTextStream(streamFrom(['Hel', 'Hello', 'Hello!'])));

    expect(result).toEqual(['Hel', 'lo', '!']);
    expect(result.join('')).toBe('Hello!');
  });

  it('passes incremental chunks through unchanged', async () => {
    const result = await collect(normalizeTextStream(streamFrom(['Hel', 'lo', '!'])));

    expect(result).toEqual(['Hel', 'lo', '!']);
    expect(result.join('')).toBe('Hello!');
  });
});
