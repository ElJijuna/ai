import type {
  LanguageDetectorStatic,
  LanguageModelStatic,
  ModelContextRegistry,
  ProofreaderStatic,
  RewriterStatic,
  SummarizerStatic,
  TranslatorStatic,
  WriterStatic,
} from './types/chrome-ai';

/**
 * Ambient globals for Chrome's built-in AI APIs. These are experimental and may not
 * exist at runtime -- every access in this library is feature-detected first.
 */
declare global {
  // eslint-disable-next-line no-var
  var LanguageModel: LanguageModelStatic | undefined;
  // eslint-disable-next-line no-var
  var Summarizer: SummarizerStatic | undefined;
  // eslint-disable-next-line no-var
  var Writer: WriterStatic | undefined;
  // eslint-disable-next-line no-var
  var Rewriter: RewriterStatic | undefined;
  // eslint-disable-next-line no-var
  var Translator: TranslatorStatic | undefined;
  // eslint-disable-next-line no-var
  var LanguageDetector: LanguageDetectorStatic | undefined;
  // eslint-disable-next-line no-var
  var Proofreader: ProofreaderStatic | undefined;

  interface Navigator {
    modelContext?: ModelContextRegistry;
  }
}
