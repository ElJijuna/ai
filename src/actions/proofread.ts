import { AIFeatureNotSupportedError } from '../errors.js';
import type { ProofreaderCorrection, ProofreaderResult } from '../types/chrome-ai.js';

export type { ProofreaderCorrection, ProofreaderResult };

export interface ProofreadOptions {
  includeExplanations?: boolean;
  expectedLanguages?: string[];
  signal?: AbortSignal;
}

/** Proofreads `text` using Chrome's Proofreader API. */
export async function proofread(
  text: string,
  options: ProofreadOptions = {},
): Promise<ProofreaderResult> {
  if (typeof globalThis.Proofreader === 'undefined') {
    throw new AIFeatureNotSupportedError('proofreader');
  }

  const proofreader = await globalThis.Proofreader.create({
    includeCorrectionExplanations: options.includeExplanations,
    expectedInputLanguages: options.expectedLanguages,
    signal: options.signal,
  });

  try {
    return await proofreader.proofread(text, { signal: options.signal });
  } finally {
    proofreader.destroy();
  }
}
