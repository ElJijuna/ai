import { resolveLanguageModelBackend } from './providers/resolveLanguageModel.js';
import type { AIFeatureName, AvailabilityInfo } from './types.js';

const GLOBAL_NAME_BY_FEATURE: Record<AIFeatureName, string> = {
  languageModel: 'LanguageModel',
  summarizer: 'Summarizer',
  writer: 'Writer',
  rewriter: 'Rewriter',
  translator: 'Translator',
  languageDetector: 'LanguageDetector',
  proofreader: 'Proofreader',
};

interface FeatureApi {
  availability?: (options?: unknown) => Promise<string>;
}

function getFeatureApi(feature: AIFeatureName): FeatureApi | undefined {
  const globalName = GLOBAL_NAME_BY_FEATURE[feature];

  return (globalThis as unknown as Record<string, FeatureApi | undefined>)[globalName];
}

/**
 * Checks whether a Chrome built-in AI feature is supported and, when it is, how
 * ready it is to use (`available`, `downloadable`, `downloading`, or `unavailable`).
 *
 * For `'languageModel'`, when Chrome's own API isn't present, this also checks the
 * optional WebGPU fallback (see the "WebGPU fallback" section of the README) --
 * `result.backend`/`result.model` say which one answered and which model would load.
 * Note this call doesn't know about `tools`, so it won't reflect the heavier
 * function-calling default `Agent.create({ tools })` would pick without an override.
 *
 * @param feature - Which built-in AI surface to check. Defaults to `'languageModel'`.
 * @param options - Feature-specific availability options, e.g. `{ sourceLanguage, targetLanguage }` for `'translator'`, or `{ model }` to check a specific WebGPU model id.
 */
export async function checkAvailability(
  feature: AIFeatureName = 'languageModel',
  options?: Record<string, unknown>,
): Promise<AvailabilityInfo> {
  const api = getFeatureApi(feature);

  if (api && typeof api.availability === 'function') {
    try {
      const state = (await api.availability(options)) as AvailabilityInfo['state'];

      return { feature, state, supported: true, backend: 'chrome' };
    } catch {
      // Some task APIs (e.g. the translator) require configuration -- such as a
      // language pair -- before they can report a concrete state.
      return { feature, state: 'unknown', supported: true, backend: 'chrome' };
    }
  }

  if (feature === 'languageModel') {
    const backend = await resolveLanguageModelBackend({ model: getModelOverride(options) });

    if (backend) {
      const state = (await backend.api.availability(options)) as AvailabilityInfo['state'];

      return { feature, state, supported: true, backend: backend.kind, model: backend.model };
    }
  }

  return { feature, state: 'unsupported', supported: false };
}

function getModelOverride(options?: Record<string, unknown>): string | undefined {
  const model = options?.model;

  return typeof model === 'string' ? model : undefined;
}

/** Runs {@link checkAvailability} for every known feature in parallel. */
export async function checkAllAvailability(): Promise<Record<AIFeatureName, AvailabilityInfo>> {
  const features = Object.keys(GLOBAL_NAME_BY_FEATURE) as AIFeatureName[];
  const results = await Promise.all(features.map((feature) => checkAvailability(feature)));

  return Object.fromEntries(results.map((info) => [info.feature, info])) as Record<
    AIFeatureName,
    AvailabilityInfo
  >;
}

/** `true` when a feature's model is fully downloaded and ready to use immediately. */
export function isReady(info: AvailabilityInfo): boolean {
  return info.state === 'available';
}
