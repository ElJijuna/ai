import * as actions from '../actions/index.js';
import { checkAvailability } from '../availability.js';
import { captureDocumentContext, WebContext } from '../context/WebContext.js';
import { exposeToolsToPage } from '../tools/webmcp.js';
import type {
  AgentConfig,
  AIFeatureName,
  AvailabilityInfo,
  ModelParams,
  OrchestratorConfig,
  PageContext,
  ScopeConfig,
  Tool,
} from '../types.js';
import { Agent } from './Agent.js';

/**
 * The single entry point for a site: holds shared scope, context, and tools, spawns
 * {@link Agent} chat sessions that inherit them, and exposes friendly one-shot
 * actions (summarize, write, rewrite, translate, detect language, proofread).
 *
 * @example
 * ```ts
 * const ai = new AIOrchestrator({
 *   scope: { site: 'example.com', description: 'an online camera shop' },
 * });
 *
 * if ((await ai.isAvailable()).supported) {
 *   const agent = await ai.createAgent();
 *   console.log(await agent.send('What lenses do you carry?'));
 * }
 * ```
 */
export class AIOrchestrator {
  readonly #scope?: ScopeConfig;
  readonly #context: WebContext;
  readonly #tools = new Map<string, Tool>();
  readonly #onDownloadProgress: OrchestratorConfig['onDownloadProgress'];
  readonly #exposeToolsToPage: boolean;
  readonly #agents = new Set<Agent>();
  #unexposeTools: (() => void) | undefined;

  constructor(config: OrchestratorConfig = {}) {
    this.#scope = config.scope;
    this.#context = new WebContext(config.context);
    this.#onDownloadProgress = config.onDownloadProgress;
    this.#exposeToolsToPage = config.exposeToolsToPage ?? false;

    for (const tool of config.tools ?? []) {
      this.#tools.set(tool.name, tool);
    }

    this.#syncToolsToPage();
  }

  /** Checks whether a Chrome built-in AI feature is supported and ready. */
  isAvailable(feature: AIFeatureName = 'languageModel'): Promise<AvailabilityInfo> {
    return checkAvailability(feature);
  }

  /** Whether translating between two specific languages is supported and ready. */
  isTranslationAvailable(options: actions.TranslateOptions): Promise<AvailabilityInfo> {
    return actions.isTranslationAvailable(options);
  }

  /** Valid `temperature`/`topK` ranges for the Prompt API on this device, or `null` if unsupported. */
  getModelParams(): Promise<ModelParams | null> {
    if (typeof globalThis.LanguageModel === 'undefined') {
      return Promise.resolve(null);
    }

    return globalThis.LanguageModel.params();
  }

  /** The context currently shared by this orchestrator and every agent it created. */
  get context(): Readonly<PageContext> {
    return this.#context.value;
  }

  /** Replaces the shared context and immediately pushes it to every live agent. */
  setContext(context: PageContext): void {
    this.#context.set(context);
    this.#broadcast((agent) => agent.setContext(context));
  }

  /** Merges `patch` into the shared context and immediately pushes it to every live agent. */
  updateContext(patch: Partial<PageContext>): void {
    this.#context.update(patch);
    this.#broadcast((agent) => agent.updateContext(patch));
  }

  /** Convenience: seeds the shared context from the current page's URL, title, meta description, and selection. */
  captureContextFromDocument(): void {
    this.updateContext(captureDocumentContext());
  }

  /** Adds (or replaces) a tool available to every agent created from now on. */
  registerTool(tool: Tool): void {
    this.#tools.set(tool.name, tool);
    this.#syncToolsToPage();
  }

  registerTools(tools: Tool[]): void {
    for (const tool of tools) {
      this.#tools.set(tool.name, tool);
    }

    this.#syncToolsToPage();
  }

  unregisterTool(name: string): void {
    this.#tools.delete(name);
    this.#syncToolsToPage();
  }

  /**
   * Creates a new chat {@link Agent}. It inherits the orchestrator's scope and
   * shared context/tools, both mergeable with per-agent overrides.
   */
  async createAgent(overrides: AgentConfig = {}): Promise<Agent> {
    const agent = await Agent.create({
      scope: overrides.scope ?? this.#scope,
      instructions: overrides.instructions,
      context: { ...this.#context.value, ...overrides.context },
      tools: [...this.#tools.values(), ...(overrides.tools ?? [])],
      temperature: overrides.temperature,
      topK: overrides.topK,
      expectedInputs: overrides.expectedInputs,
      expectedOutputs: overrides.expectedOutputs,
      onDownloadProgress: overrides.onDownloadProgress ?? this.#onDownloadProgress,
      onQuotaOverflow: overrides.onQuotaOverflow,
      signal: overrides.signal,
    });

    this.#agents.add(agent);

    return agent;
  }

  /** Destroys every agent this orchestrator has created. */
  destroyAgents(): void {
    for (const agent of this.#agents) {
      agent.destroy();
    }

    this.#agents.clear();
  }

  async summarize(text: string, options: actions.SummarizeOptions = {}): Promise<string> {
    return actions.summarize(text, { sharedContext: this.#defaultSharedContext(), ...options });
  }

  async write(prompt: string, options: actions.WriteOptions = {}): Promise<string> {
    return actions.write(prompt, { sharedContext: this.#defaultSharedContext(), ...options });
  }

  async rewrite(text: string, options: actions.RewriteOptions = {}): Promise<string> {
    return actions.rewrite(text, { sharedContext: this.#defaultSharedContext(), ...options });
  }

  async translate(text: string, options: actions.TranslateOptions): Promise<string> {
    return actions.translate(text, options);
  }

  async detectLanguage(text: string): Promise<actions.LanguageDetectorResult[]> {
    return actions.detectLanguage(text);
  }

  async proofread(
    text: string,
    options: actions.ProofreadOptions = {},
  ): Promise<actions.ProofreaderResult> {
    return actions.proofread(text, options);
  }

  #defaultSharedContext(): string | undefined {
    if (this.#scope?.description) {
      return this.#scope.description;
    }

    return this.#scope?.site ? `This is the website ${this.#scope.site}.` : undefined;
  }

  #broadcast(apply: (agent: Agent) => void): void {
    for (const agent of this.#agents) {
      try {
        apply(agent);
      } catch {
        // The agent was likely already destroyed; drop it so future broadcasts skip it.
        this.#agents.delete(agent);
      }
    }
  }

  #syncToolsToPage(): void {
    this.#unexposeTools?.();
    this.#unexposeTools = this.#exposeToolsToPage
      ? exposeToolsToPage([...this.#tools.values()])
      : undefined;
  }
}
