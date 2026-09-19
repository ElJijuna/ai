import { describe, expect, it, vi } from 'vitest';
import { isTranslationAvailable, translate, translateStream } from '../src/actions/translate.js';
import { AIFeatureNotSupportedError } from '../src/errors.js';
import type {
  AIAvailability,
  AIDownloadProgressEvent,
  TranslatorCreateOptions,
} from '../src/types/chrome-ai.js';

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

describe('isTranslationAvailable', () => {
  it('reports unsupported when the browser has no Translator', async () => {
    const info = await isTranslationAvailable({ from: 'en', to: 'es' });

    expect(info).toEqual({ feature: 'translator', state: 'unsupported', supported: false });
  });

  it('reports the pair-specific state when the browser supports it', async () => {
    const availability = vi.fn<() => Promise<AIAvailability>>(() =>
      Promise.resolve('downloadable'),
    );

    globalThis.Translator = { availability, create: vi.fn() };

    const info = await isTranslationAvailable({ from: 'en', to: 'es' });

    expect(info).toEqual({ feature: 'translator', state: 'downloadable', supported: true });
    expect(availability).toHaveBeenCalledWith({ sourceLanguage: 'en', targetLanguage: 'es' });
  });

  it('reports unknown when the availability check throws', async () => {
    globalThis.Translator = {
      availability: vi.fn(() => Promise.reject(new TypeError('unsupported pair'))),
      create: vi.fn(),
    };

    const info = await isTranslationAvailable({ from: 'xx', to: 'yy' });

    expect(info).toEqual({ feature: 'translator', state: 'unknown', supported: true });
  });
});

describe('translate', () => {
  it('throws AIFeatureNotSupportedError when the browser has no Translator', async () => {
    await expect(translate('Hello', { from: 'en', to: 'es' })).rejects.toThrow(
      AIFeatureNotSupportedError,
    );
  });

  it('reports download progress through onDownloadProgress', async () => {
    globalThis.Translator = {
      availability: vi.fn(),
      create: vi.fn((options: TranslatorCreateOptions) => {
        options.monitor?.({
          addEventListener: (_type, listener) => {
            listener({ loaded: 0.5 } as AIDownloadProgressEvent);
          },
        });

        return Promise.resolve({
          translate: vi.fn(() => Promise.resolve('Hola')),
          translateStreaming: vi.fn(),
          destroy: vi.fn(),
        });
      }),
    };

    const onDownloadProgress = vi.fn();
    const result = await translate('Hello', { from: 'en', to: 'es', onDownloadProgress });

    expect(result).toBe('Hola');
    expect(onDownloadProgress).toHaveBeenCalledWith({ feature: 'translator', loaded: 0.5 });
  });
});

describe('translateStream', () => {
  it('throws AIFeatureNotSupportedError when the browser has no Translator', async () => {
    await expect(collect(translateStream('Hello', { from: 'en', to: 'es' }))).rejects.toThrow(
      AIFeatureNotSupportedError,
    );
  });

  it('yields normalized deltas and destroys the session once the stream ends', async () => {
    const destroy = vi.fn();

    globalThis.Translator = {
      availability: vi.fn(),
      create: vi.fn(() =>
        Promise.resolve({
          translate: vi.fn(),
          translateStreaming: vi.fn(() => streamFrom(['H', 'Ho', 'Hola'])),
          destroy,
        }),
      ),
    };

    const chunks = await collect(translateStream('Hello', { from: 'en', to: 'es' }));

    expect(chunks.join('')).toBe('Hola');
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
