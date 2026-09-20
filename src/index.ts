export type {
  LanguageDetectorResult,
  ProofreaderCorrection,
  ProofreaderResult,
  ProofreadOptions,
  RewriteOptions,
  SummarizeOptions,
  TranslateOptions,
  WriteOptions,
} from './actions/index.js';
export {
  detectLanguage,
  isTranslationAvailable,
  proofread,
  rewrite,
  rewriteStream,
  summarize,
  summarizeStream,
  translate,
  translateStream,
  write,
  writeStream,
} from './actions/index.js';
export { checkAllAvailability, checkAvailability, isReady } from './availability.js';
export type { ContextListener } from './context/WebContext.js';
export { captureDocumentContext, WebContext } from './context/WebContext.js';
export { AIFeatureNotSupportedError, AIFeatureUnavailableError, AILibError } from './errors.js';
export { Agent } from './orchestrator/Agent.js';
export { AIOrchestrator } from './orchestrator/AIOrchestrator.js';
export { defineTool } from './tools/defineTool.js';
export { exposeToolsToPage, isWebMCPAvailable } from './tools/webmcp.js';
export type { WebSearchResult, WebSearchToolOptions } from './tools/webSearch.js';
export { defineWebSearchTool } from './tools/webSearch.js';
export type {
  AgentConfig,
  AgentMessage,
  AIAvailabilityState,
  AIFeatureName,
  AudioContentPart,
  AvailabilityInfo,
  DownloadProgress,
  ImageContentPart,
  MessageContentPart,
  ModalityExpectation,
  ModelParams,
  OrchestratorConfig,
  PageContext,
  ScopeConfig,
  ScopeMode,
  SendOptions,
  TextContentPart,
  Tool,
  WebGPUFallbackConfig,
} from './types.js';
