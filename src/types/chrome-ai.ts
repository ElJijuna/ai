/**
 * Structural mirrors of Chrome's built-in AI APIs (Prompt API, Summarizer, Writer,
 * Rewriter, Translator, Language Detector, Proofreader) and the emerging WebMCP
 * `document.modelContext` surface (`navigator.modelContext` on older builds; see
 * {@link ModelContextRegistry}).
 *
 * These browser APIs are experimental, ship behind flags / origin trials, and their
 * shapes may drift as the specs stabilize. This module is intentionally not part of
 * the package's public API (see {@link "../index" | the package entry point}) so that
 * upstream spec churn does not become a breaking change for consumers of this library.
 *
 * @internal
 */

import type { MessageContentPart, ModalityExpectation, ModelParams } from '../types.js';

export type AIAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

export interface AIDownloadProgressEvent extends Event {
  readonly loaded: number;
}

export interface AICreateMonitor {
  addEventListener: (
    type: 'downloadprogress',
    listener: (event: AIDownloadProgressEvent) => void,
  ) => void;
}

export type AIMessageRole = 'system' | 'user' | 'assistant';

export interface AIMessage {
  role: AIMessageRole;
  content: string | MessageContentPart[];
}

export interface LanguageModelTool<Args = unknown, Result = unknown> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: Args) => Promise<Result> | Result;
}

export interface LanguageModelCreateOptions {
  initialPrompts?: AIMessage[];
  temperature?: number;
  topK?: number;
  tools?: LanguageModelTool[];
  expectedInputs?: ModalityExpectation[];
  expectedOutputs?: ModalityExpectation[];
  signal?: AbortSignal;
  monitor?: (monitor: AICreateMonitor) => void;
}

export interface LanguageModelPromptOptions {
  signal?: AbortSignal;
  responseConstraint?: Record<string, unknown>;
}

export interface LanguageModelSession extends EventTarget {
  prompt: (input: string | AIMessage[], options?: LanguageModelPromptOptions) => Promise<string>;
  promptStreaming: (
    input: string | AIMessage[],
    options?: LanguageModelPromptOptions,
  ) => ReadableStream<string>;
  append?: (messages: AIMessage[]) => Promise<void>;
  clone: (options?: { signal?: AbortSignal }) => Promise<LanguageModelSession>;
  destroy: () => void;
  measureInputUsage?: (
    input: string | AIMessage[],
    options?: LanguageModelPromptOptions,
  ) => Promise<number>;
  readonly inputUsage?: number;
  readonly inputQuota?: number;
}

export interface LanguageModelStatic {
  availability: (options?: Partial<LanguageModelCreateOptions>) => Promise<AIAvailability>;
  create: (options?: LanguageModelCreateOptions) => Promise<LanguageModelSession>;
  params: () => Promise<ModelParams | null>;
}

export interface SummarizerCreateOptions {
  sharedContext?: string;
  type?: 'key-points' | 'tldr' | 'teaser' | 'headline';
  format?: 'markdown' | 'plain-text';
  length?: 'short' | 'medium' | 'long';
  signal?: AbortSignal;
  monitor?: (monitor: AICreateMonitor) => void;
}

export interface SummarizerSession {
  summarize: (
    input: string,
    options?: { context?: string; signal?: AbortSignal },
  ) => Promise<string>;
  summarizeStreaming: (
    input: string,
    options?: { context?: string; signal?: AbortSignal },
  ) => ReadableStream<string>;
  destroy: () => void;
}

export interface SummarizerStatic {
  availability: (options?: Partial<SummarizerCreateOptions>) => Promise<AIAvailability>;
  create: (options?: SummarizerCreateOptions) => Promise<SummarizerSession>;
}

export interface WriterCreateOptions {
  tone?: 'formal' | 'neutral' | 'casual';
  format?: 'markdown' | 'plain-text';
  length?: 'short' | 'medium' | 'long';
  sharedContext?: string;
  signal?: AbortSignal;
  monitor?: (monitor: AICreateMonitor) => void;
}

export interface WriterSession {
  write: (input: string, options?: { context?: string; signal?: AbortSignal }) => Promise<string>;
  writeStreaming: (
    input: string,
    options?: { context?: string; signal?: AbortSignal },
  ) => ReadableStream<string>;
  destroy: () => void;
}

export interface WriterStatic {
  availability: (options?: Partial<WriterCreateOptions>) => Promise<AIAvailability>;
  create: (options?: WriterCreateOptions) => Promise<WriterSession>;
}

export interface RewriterCreateOptions {
  tone?: 'as-is' | 'more-formal' | 'more-casual';
  format?: 'as-is' | 'markdown' | 'plain-text';
  length?: 'as-is' | 'shorter' | 'longer';
  sharedContext?: string;
  signal?: AbortSignal;
  monitor?: (monitor: AICreateMonitor) => void;
}

export interface RewriterSession {
  rewrite: (input: string, options?: { context?: string; signal?: AbortSignal }) => Promise<string>;
  rewriteStreaming: (
    input: string,
    options?: { context?: string; signal?: AbortSignal },
  ) => ReadableStream<string>;
  destroy: () => void;
}

export interface RewriterStatic {
  availability: (options?: Partial<RewriterCreateOptions>) => Promise<AIAvailability>;
  create: (options?: RewriterCreateOptions) => Promise<RewriterSession>;
}

export interface TranslatorCreateOptions {
  sourceLanguage: string;
  targetLanguage: string;
  signal?: AbortSignal;
  monitor?: (monitor: AICreateMonitor) => void;
}

export interface TranslatorSession {
  translate: (input: string, options?: { signal?: AbortSignal }) => Promise<string>;
  translateStreaming: (input: string, options?: { signal?: AbortSignal }) => ReadableStream<string>;
  destroy: () => void;
}

export interface TranslatorStatic {
  availability: (options: Partial<TranslatorCreateOptions>) => Promise<AIAvailability>;
  create: (options: TranslatorCreateOptions) => Promise<TranslatorSession>;
}

export interface LanguageDetectorResult {
  detectedLanguage: string;
  confidence: number;
}

export interface LanguageDetectorSession {
  detect: (input: string, options?: { signal?: AbortSignal }) => Promise<LanguageDetectorResult[]>;
  destroy: () => void;
}

export interface LanguageDetectorStatic {
  availability: (options?: { signal?: AbortSignal }) => Promise<AIAvailability>;
  create: (options?: {
    signal?: AbortSignal;
    monitor?: (monitor: AICreateMonitor) => void;
  }) => Promise<LanguageDetectorSession>;
}

export interface ProofreaderCorrection {
  startIndex: number;
  endIndex: number;
  correction: string;
  type?: string;
  explanation?: string;
}

export interface ProofreaderResult {
  correctedInput: string;
  corrections: ProofreaderCorrection[];
}

export interface ProofreaderCreateOptions {
  includeCorrectionTypes?: boolean;
  includeCorrectionExplanations?: boolean;
  expectedInputLanguages?: string[];
  signal?: AbortSignal;
  monitor?: (monitor: AICreateMonitor) => void;
}

export interface ProofreaderSession {
  proofread: (input: string, options?: { signal?: AbortSignal }) => Promise<ProofreaderResult>;
  destroy: () => void;
}

export interface ProofreaderStatic {
  availability: (options?: Partial<ProofreaderCreateOptions>) => Promise<AIAvailability>;
  create: (options?: ProofreaderCreateOptions) => Promise<ProofreaderSession>;
}

/** A tool exposed through the experimental WebMCP `document.modelContext` registry. */
export interface WebMCPTool<Args = unknown, Result = unknown> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: Args) => Promise<Result> | Result;
}

export interface ModelContextRegistry {
  registerTool: (tool: WebMCPTool) => () => void;
}
