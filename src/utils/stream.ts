export async function* toAsyncIterable<T>(stream: ReadableStream<T>): AsyncGenerator<T> {
  const reader = stream.getReader();

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        return;
      }

      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Normalizes a Chrome AI text stream into incremental deltas.
 *
 * Chrome's streaming chunks have carried both cumulative full-text-so-far and
 * incremental deltas across different API versions. This detects which shape a
 * chunk uses (by checking whether it extends the text accumulated so far) and
 * always yields the incremental delta, so consumers can append chunks blindly.
 */
export async function* normalizeTextStream(stream: ReadableStream<string>): AsyncGenerator<string> {
  let accumulated = '';

  for await (const chunk of toAsyncIterable(stream)) {
    if (chunk.length >= accumulated.length && chunk.startsWith(accumulated)) {
      const delta = chunk.slice(accumulated.length);

      accumulated = chunk;

      if (delta) {
        yield delta;
      }
    } else {
      accumulated += chunk;
      yield chunk;
    }
  }
}
