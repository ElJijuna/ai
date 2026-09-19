import { describe, expect, it, vi } from 'vitest';
import { detectLanguage } from '../src/actions/detectLanguage.js';
import { AIFeatureNotSupportedError } from '../src/errors.js';

describe('detectLanguage', () => {
  it('throws AIFeatureNotSupportedError when the browser has no LanguageDetector', async () => {
    await expect(detectLanguage('Bonjour')).rejects.toThrow(AIFeatureNotSupportedError);
  });

  it('detects the language and destroys the detector afterwards', async () => {
    const destroy = vi.fn();
    const detect = vi.fn(() => Promise.resolve([{ detectedLanguage: 'fr', confidence: 0.98 }]));

    globalThis.LanguageDetector = {
      availability: vi.fn(),
      create: vi.fn(() => Promise.resolve({ detect, destroy })),
    };

    const { signal } = new AbortController();
    const result = await detectLanguage('Bonjour', { signal });

    expect(result).toEqual([{ detectedLanguage: 'fr', confidence: 0.98 }]);
    expect(detect).toHaveBeenCalledWith('Bonjour', { signal });
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('destroys the detector even when detect() rejects', async () => {
    const destroy = vi.fn();
    const detect = vi.fn(() => Promise.reject(new Error('boom')));

    globalThis.LanguageDetector = {
      availability: vi.fn(),
      create: vi.fn(() => Promise.resolve({ detect, destroy })),
    };

    await expect(detectLanguage('???')).rejects.toThrow('boom');
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
