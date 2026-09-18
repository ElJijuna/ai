import { describe, expect, it, vi } from 'vitest';
import { checkAllAvailability, checkAvailability, isReady } from '../src/availability.js';
import { installMockLanguageModel } from './mocks/chrome-ai.js';

describe('checkAvailability', () => {
  it('reports unsupported when the global API does not exist', async () => {
    const info = await checkAvailability('languageModel');

    expect(info).toEqual({ feature: 'languageModel', state: 'unsupported', supported: false });
  });

  it('reports the browser-provided state when the API exists', async () => {
    installMockLanguageModel({ availability: 'downloadable' });
    const info = await checkAvailability('languageModel');

    expect(info).toEqual({ feature: 'languageModel', state: 'downloadable', supported: true });
  });

  it('reports unknown when the availability check throws (e.g. missing required options)', async () => {
    globalThis.Translator = {
      availability: vi.fn(() => Promise.reject(new TypeError('sourceLanguage is required'))),
      create: vi.fn(),
    };
    const info = await checkAvailability('translator');

    expect(info).toEqual({ feature: 'translator', state: 'unknown', supported: true });
  });
});

describe('checkAllAvailability', () => {
  it('checks every known feature', async () => {
    installMockLanguageModel({ availability: 'available' });
    const results = await checkAllAvailability();

    expect(Object.keys(results).sort()).toEqual(
      [
        'languageModel',
        'summarizer',
        'writer',
        'rewriter',
        'translator',
        'languageDetector',
        'proofreader',
      ].sort(),
    );
    expect(results.languageModel.state).toBe('available');
    expect(results.summarizer.state).toBe('unsupported');
  });
});

describe('isReady', () => {
  it('is true only when state is available', () => {
    expect(isReady({ feature: 'languageModel', state: 'available', supported: true })).toBe(true);
    expect(isReady({ feature: 'languageModel', state: 'downloadable', supported: true })).toBe(
      false,
    );
  });
});
