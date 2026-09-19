import { afterEach } from 'vitest';

const CHROME_AI_GLOBALS = [
  'LanguageModel',
  'Summarizer',
  'Writer',
  'Rewriter',
  'Translator',
  'LanguageDetector',
  'Proofreader',
];

afterEach(() => {
  for (const name of CHROME_AI_GLOBALS) {
    delete (globalThis as Record<string, unknown>)[name];
  }

  const nav = globalThis.navigator as { modelContext?: unknown } | undefined;

  if (nav) {
    delete nav.modelContext;
  }

  const doc = globalThis.document as { modelContext?: unknown } | undefined;

  if (doc) {
    delete doc.modelContext;
  }
});
