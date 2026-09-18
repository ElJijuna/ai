import type {
  LanguageDetectorStatic,
  LanguageModelStatic,
  ModelContextRegistry,
  ProofreaderStatic,
  RewriterStatic,
  SummarizerStatic,
  TranslatorStatic,
  WriterStatic,
} from './types/chrome-ai.js';

/**
 * Ambient globals for Chrome's built-in AI APIs. These are experimental and may not
 * exist at runtime -- every access in this library is feature-detected first.
 */
declare global {
  var LanguageModel: LanguageModelStatic | undefined;

  var Summarizer: SummarizerStatic | undefined;

  var Writer: WriterStatic | undefined;

  var Rewriter: RewriterStatic | undefined;

  var Translator: TranslatorStatic | undefined;

  var LanguageDetector: LanguageDetectorStatic | undefined;

  var Proofreader: ProofreaderStatic | undefined;

  interface Navigator {
    modelContext?: ModelContextRegistry;
  }
}
