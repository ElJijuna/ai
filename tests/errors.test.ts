import { describe, expect, it } from 'vitest';
import {
  AIFeatureNotSupportedError,
  AIFeatureUnavailableError,
  AILibError,
} from '../src/errors.js';

describe('AIFeatureNotSupportedError', () => {
  it('names the missing feature and carries the AILibError name', () => {
    const error = new AIFeatureNotSupportedError('summarizer');

    expect(error).toBeInstanceOf(AILibError);
    expect(error.name).toBe('AIFeatureNotSupportedError');
    expect(error.message).toContain('"summarizer"');
    expect(error.message).toContain('isAvailable()');
  });
});

describe('AIFeatureUnavailableError', () => {
  it('includes the reason when one is given', () => {
    const error = new AIFeatureUnavailableError('languageModel', 'insufficient storage');

    expect(error.name).toBe('AIFeatureUnavailableError');
    expect(error.message).toBe('"languageModel" is unavailable: insufficient storage');
  });

  it('falls back to a bare period when no reason is given', () => {
    const error = new AIFeatureUnavailableError('languageModel');

    expect(error.message).toBe('"languageModel" is unavailable.');
  });
});
