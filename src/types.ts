/** The Chrome built-in AI surfaces this library knows how to talk to. */
export type AIFeatureName =
  | 'languageModel'
  | 'summarizer'
  | 'writer'
  | 'rewriter'
  | 'translator'
  | 'languageDetector'
  | 'proofreader';

/**
 * Fine-grained readiness of a feature, mirroring Chrome's own `Availability` enum
 * plus two states this library adds: `unsupported` (the API does not exist in this
 * browser at all) and `unknown` (existence confirmed, but a per-configuration check
 * -- e.g. a translator language pair -- was not supplied).
 */
export type AIAvailabilityState =
  | 'unavailable'
  | 'downloadable'
  | 'downloading'
  | 'available'
  | 'unsupported'
  | 'unknown';

export interface AvailabilityInfo {
  readonly feature: AIFeatureName;
  readonly state: AIAvailabilityState;
  /** Whether the browser exposes this API surface at all, independent of `state`. */
  readonly supported: boolean;
  /**
   * Which backend served this check. Always `'chrome'` today, except for
   * `'languageModel'`, which reports `'webgpu'` when Chrome's built-in AI isn't
   * present but the optional WebGPU fallback is (see {@link WebGPUFallbackConfig}).
   * Omitted when `supported` is `false`.
   */
  readonly backend?: 'chrome' | 'webgpu';
  /**
   * The web-llm model id that would load, when `backend` is `'webgpu'` (e.g.
   * `'Llama-3.2-3B-Instruct-q4f16_1-MLC'`). `undefined` for `'chrome'` -- Gemini Nano
   * has no public model id -- and for `'languageModel'` calls that didn't resolve a
   * WebGPU backend. Pass `{ model }` in `checkAvailability`'s `options` (or
   * `AgentConfig.webgpu`/`OrchestratorConfig.webgpu`) to check/pin a specific one.
   */
  readonly model?: string;
}

/** How strictly an {@link Agent} should stay on-topic for the site it runs on. */
export type ScopeMode = 'strict' | 'guided' | 'off';

export interface ScopeConfig {
  /** `'strict'` refuses anything unrelated, `'guided'` (default) prefers on-topic answers, `'off'` disables the guard. */
  mode?: ScopeMode;
  /** Defaults to `location.hostname`. */
  site?: string;
  /** A short description of what the site/app is about, injected into the system prompt. */
  description?: string;
  allowedTopics?: string[];
  disallowedTopics?: string[];
  /** Overrides the default "I can only help with this site" refusal instruction. */
  refusalMessage?: string;
}

/** Free-form structured context handed to the model (page metadata, app state, etc). */
export type PageContext = Record<string, unknown>;

export interface DownloadProgress {
  feature: AIFeatureName;
  /** Fraction downloaded, from 0 to 1. */
  loaded: number;
}

export interface Tool<Args = unknown, Result = unknown> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: Args) => Promise<Result> | Result;
}

export interface TextContentPart {
  type: 'text';
  value: string;
}

export interface ImageContentPart {
  type: 'image';
  value: ImageBitmapSource;
}

export interface AudioContentPart {
  type: 'audio';
  value: AudioBuffer | Blob | ArrayBuffer;
}

/** One part of a multimodal message sent to the Prompt API. */
export type MessageContentPart = TextContentPart | ImageContentPart | AudioContentPart;

/** What you pass to `Agent.send()`/`stream()`: plain text, or multimodal content parts. */
export type AgentMessage = string | MessageContentPart[];

/** A modality (and, for text, languages) an agent expects to send or receive. */
export interface ModalityExpectation {
  type: 'text' | 'image' | 'audio';
  languages?: string[];
}

/** Valid `temperature`/`topK` ranges for the Prompt API on this device. */
export interface ModelParams {
  defaultTopK: number;
  maxTopK: number;
  defaultTemperature: number;
  maxTemperature: number;
}

export interface SendOptions {
  signal?: AbortSignal;
  /** A JSON schema the model's reply must conform to (structured output). */
  responseConstraint?: Record<string, unknown>;
  /**
   * `stream()` only. Chrome's streaming chunks have carried both cumulative and
   * incremental text across API versions; by default this library normalizes them
   * into incremental deltas. Pass `raw: true` to receive chunks exactly as the
   * browser emits them.
   */
  raw?: boolean;
}

/**
 * Configures the optional WebGPU fallback used for the Prompt API when Chrome's
 * built-in AI isn't present (see the "WebGPU fallback" section of the README).
 * Ignored entirely when Chrome's built-in AI serves the request.
 */
export interface WebGPUFallbackConfig {
  /**
   * A model id from `@mlc-ai/web-llm`'s prebuilt list
   * (https://github.com/mlc-ai/web-llm/blob/main/src/config.ts). Defaults to
   * `'Llama-3.2-3B-Instruct-q4f16_1-MLC'` (~2.3GB VRAM) -- or, if the agent registers
   * `tools`, to `'Hermes-3-Llama-3.1-8B-q4f16_1-MLC'` (~4.9GB VRAM) instead, since
   * web-llm hard-rejects tool calling for models outside its small allowlist. An
   * explicit override for an agent with `tools` must itself be one of that allowlist
   * (`webllm.functionCallingModelIds`), or `createAgent()` throws
   * `AIFeatureUnavailableError` before downloading anything.
   */
  model?: string;
}

export interface AgentConfig {
  /** Extra system instructions, appended after the site-scope guard. */
  instructions?: string;
  scope?: ScopeConfig;
  context?: PageContext;
  tools?: Tool[];
  temperature?: number;
  topK?: number;
  /** Declare non-text modalities this agent will send, e.g. `[{ type: 'image' }]`. */
  expectedInputs?: ModalityExpectation[];
  /** Declare non-text modalities this agent expects back. */
  expectedOutputs?: ModalityExpectation[];
  onDownloadProgress?: (progress: DownloadProgress) => void;
  /** Called when Chrome starts dropping earlier turns because the context window is full. */
  onQuotaOverflow?: () => void;
  /** Aborts session creation, including an in-flight model download. */
  signal?: AbortSignal;
  /** Configures the optional WebGPU fallback; overrides the orchestrator's default. */
  webgpu?: WebGPUFallbackConfig;
}

export interface OrchestratorConfig {
  scope?: ScopeConfig;
  context?: PageContext;
  tools?: Tool[];
  /** Also register tools on `document.modelContext` (WebMCP; falls back to `navigator.modelContext` on older Chrome builds) when the page exposes it. */
  exposeToolsToPage?: boolean;
  onDownloadProgress?: (progress: DownloadProgress) => void;
  /** Default WebGPU fallback config for every agent this orchestrator creates; overridable per-agent. */
  webgpu?: WebGPUFallbackConfig;
}
