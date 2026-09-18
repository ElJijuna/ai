import { describe, expect, it, vi } from 'vitest';
import { isTranslationAvailable } from '../src/actions/translate.js';
import type { AIAvailability } from '../src/types/chrome-ai.js';

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
