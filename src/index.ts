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
export { checkAllAvailability, checkAvailability, isReady } from './availability.js';
export type { ContextListener } from './context/WebContext.js';
export { captureDocumentContext, WebContext } from './context/WebContext.js';
export { AIFeatureNotSupportedError, AIFeatureUnavailableError, AILibError } from './errors.js';
export { Agent } from './orchestrator/Agent.js';
export { AIOrchestrator } from './orchestrator/AIOrchestrator.js';
export { defineTool } from './tools/defineTool.js';
export { exposeToolsToPage, isWebMCPAvailable } from './tools/webmcp.js';
export type {
  AgentConfig,
  AIAvailabilityState,
  AIFeatureName,
  AvailabilityInfo,
  DownloadProgress,
  OrchestratorConfig,
  PageContext,
  ScopeConfig,
  ScopeMode,
  SendOptions,
  Tool,
} from './types.js';
