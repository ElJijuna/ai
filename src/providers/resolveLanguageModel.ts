import type { LanguageModelStatic } from '../types/chrome-ai.js';
import {
  createWebGPULanguageModelStatic,
  DEFAULT_WEBGPU_MODEL,
  isWebGPUBackendInstalled,
  isWebGPUSupported,
} from './webgpuLanguageModel.js';

export interface LanguageModelBackend {
  kind: 'chrome' | 'webgpu';
  api: LanguageModelStatic;
  /** The web-llm model id actually in use. `undefined` for `'chrome'` -- Gemini Nano has no public model id to report. */
  model?: string;
}

/**
 * Resolves which `LanguageModel`-shaped API should serve the Prompt API: Chrome's
 * built-in `LanguageModel` global when present, otherwise the optional WebGPU
 * fallback -- engaged only when the browser supports WebGPU *and* the optional
 * `@mlc-ai/web-llm` peer dependency is installed. Used by {@link Agent},
 * {@link checkAvailability}, and `AIOrchestrator.getModelParams()` so all three stay
 * consistent about which backend is actually serving a given browser, without any
 * change to their public signatures.
 */
export async function resolveLanguageModelBackend(
  config: { model?: string } = {},
): Promise<LanguageModelBackend | undefined> {
  if (typeof globalThis.LanguageModel !== 'undefined') {
    return { kind: 'chrome', api: globalThis.LanguageModel };
  }

  if (!isWebGPUSupported() || !(await isWebGPUBackendInstalled())) {
    return undefined;
  }

  const model = config.model ?? DEFAULT_WEBGPU_MODEL;

  return { kind: 'webgpu', model, api: createWebGPULanguageModelStatic(model) };
}
