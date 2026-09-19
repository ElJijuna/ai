import { describe, expect, it, vi } from 'vitest';
import { proofread } from '../src/actions/proofread.js';
import { AIFeatureNotSupportedError } from '../src/errors.js';

describe('proofread', () => {
  it('throws AIFeatureNotSupportedError when the browser has no Proofreader', async () => {
    await expect(proofread('Ths is a tset.')).rejects.toThrow(AIFeatureNotSupportedError);
  });

  it('proofreads the text, forwards options to create(), and destroys the session afterwards', async () => {
    const destroy = vi.fn();
    const proofreadFn = vi.fn(() =>
      Promise.resolve({
        correctedInput: 'This is a test.',
        corrections: [{ startIndex: 0, endIndex: 3, correction: 'This', explanation: 'Spelling' }],
      }),
    );
    const create = vi.fn(() => Promise.resolve({ proofread: proofreadFn, destroy }));

    globalThis.Proofreader = { availability: vi.fn(), create };

    const { signal } = new AbortController();
    const result = await proofread('Ths is a tset.', {
      includeExplanations: true,
      expectedLanguages: ['en'],
      signal,
    });

    expect(result.correctedInput).toBe('This is a test.');
    expect(create).toHaveBeenCalledWith({
      includeCorrectionExplanations: true,
      expectedInputLanguages: ['en'],
      signal,
    });
    expect(proofreadFn).toHaveBeenCalledWith('Ths is a tset.', { signal });
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('destroys the session even when proofread() rejects', async () => {
    const destroy = vi.fn();

    globalThis.Proofreader = {
      availability: vi.fn(),
      create: vi.fn(() =>
        Promise.resolve({ proofread: vi.fn(() => Promise.reject(new Error('boom'))), destroy }),
      ),
    };

    await expect(proofread('text')).rejects.toThrow('boom');
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
