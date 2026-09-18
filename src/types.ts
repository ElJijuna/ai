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

export interface AgentConfig {
  /** Extra system instructions, appended after the site-scope guard. */
  instructions?: string;
  scope?: ScopeConfig;
  context?: PageContext;
  tools?: Tool[];
  temperature?: number;
  topK?: number;
  onDownloadProgress?: (progress: DownloadProgress) => void;
  /** Aborts session creation, including an in-flight model download. */
  signal?: AbortSignal;
}

export interface OrchestratorConfig {
  scope?: ScopeConfig;
  context?: PageContext;
  tools?: Tool[];
  /** Also register tools on `navigator.modelContext` (WebMCP) when the page exposes it. */
  exposeToolsToPage?: boolean;
  onDownloadProgress?: (progress: DownloadProgress) => void;
}
