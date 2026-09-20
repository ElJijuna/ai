import { WebContext } from '../context/WebContext.js';
import { AIFeatureNotSupportedError, AIFeatureUnavailableError } from '../errors.js';
import {
  type LanguageModelBackend,
  resolveLanguageModelBackend,
} from '../providers/resolveLanguageModel.js';
import { DEFAULT_WEBGPU_TOOL_MODEL } from '../providers/webgpuLanguageModel.js';
import type { AIMessage, LanguageModelSession } from '../types/chrome-ai.js';
import type {
  AgentConfig,
  AgentMessage,
  DownloadProgress,
  PageContext,
  SendOptions,
  Tool,
  WebGPUFallbackConfig,
} from '../types.js';
import { createDownloadMonitor } from '../utils/download.js';
import { normalizeTextStream, toAsyncIterable } from '../utils/stream.js';
import { buildSystemPrompt } from './systemPrompt.js';

/** Options for {@link Agent.preload}: everything relevant to *which model loads*, nothing about the chat session itself (scope/context/instructions don't affect what downloads). */
export interface PreloadOptions {
  /** Tools the eventual agent will register -- affects the tools-aware default model (see {@link Agent.create}). */
  tools?: Tool[];
  webgpu?: WebGPUFallbackConfig;
  onDownloadProgress?: (progress: DownloadProgress) => void;
  /** Aborts the download/initialization. */
  signal?: AbortSignal;
}

function toPromptInput(message: AgentMessage): string | AIMessage[] {
  if (typeof message === 'string') {
    return message;
  }

  return [{ role: 'user', content: message }];
}

/**
 * A single conversational session with the on-device model: a wrapped Chrome
 * Prompt API session plus the mutable {@link WebContext} feeding it. Create one
 * through {@link AIOrchestrator.createAgent} rather than directly, so it inherits
 * the orchestrator's shared scope, context, and tools.
 */
export class Agent {
  readonly #session: LanguageModelSession;
  readonly #context: WebContext;
  readonly #unsubscribe: () => void;
  readonly #onQuotaOverflow: (() => void) | undefined;
  readonly #model: string | undefined;
  #contextDirty = false;

  private constructor(
    session: LanguageModelSession,
    context: WebContext,
    onQuotaOverflow?: () => void,
    model?: string,
  ) {
    this.#session = session;
    this.#context = context;
    this.#onQuotaOverflow = onQuotaOverflow;
    this.#model = model;
    this.#unsubscribe = context.onChange(() => {
      this.#contextDirty = true;
    });
  }

  /**
   * Resolves the backend for a call that may register `tools`: web-llm rejects `tools`
   * outright for models outside its small function-calling allowlist (a hard error, not
   * just unreliable), so a caller registering tools needs a capable model by default --
   * unless it explicitly picked one.
   */
  static async #resolveBackend(config: {
    webgpu?: WebGPUFallbackConfig;
    tools?: Tool[];
  }): Promise<LanguageModelBackend> {
    const webgpuModel =
      config.webgpu?.model ?? (config.tools?.length ? DEFAULT_WEBGPU_TOOL_MODEL : undefined);
    const backend = await resolveLanguageModelBackend({ model: webgpuModel });

    if (!backend) {
      throw new AIFeatureNotSupportedError('languageModel');
    }

    return backend;
  }

  /**
   * Starts downloading/initializing the model without building a full chat session --
   * so it's already warm by the time the user sends a first message, instead of making
   * them wait through the download. Only the model-selection-relevant options apply
   * (`tools`, `webgpu`, `onDownloadProgress`, `signal`); scope/context/instructions only
   * affect the system prompt, not what downloads, so they're not accepted here.
   *
   * Like `createAgent()`, triggering an actual download typically still needs a user
   * gesture on many configurations -- call this from a real interaction (opening a chat
   * panel, hovering the chat button) rather than unconditionally on page load.
   *
   * On the WebGPU fallback, the underlying engine is cached by model id (see
   * {@link Agent.create}), so this is genuinely reusable: a later `createAgent()` call
   * for the same model resolves near-instantly instead of redownloading. On Chrome, the
   * downloaded model is a shared on-device asset outliving any one session, so the
   * throwaway session this creates is destroyed immediately once ready.
   */
  static async preload(options: PreloadOptions = {}): Promise<void> {
    const backend = await Agent.#resolveBackend(options);

    try {
      const session = await backend.api.create({
        tools: options.tools,
        signal: options.signal,
        monitor: createDownloadMonitor('languageModel', options.onDownloadProgress),
      });

      session.destroy();
    } catch (cause) {
      throw new AIFeatureUnavailableError(
        'languageModel',
        cause instanceof Error ? cause.message : undefined,
      );
    }
  }

  /** @internal */
  static async create(config: AgentConfig = {}): Promise<Agent> {
    const backend = await Agent.#resolveBackend(config);
    const context = new WebContext(config.context);
    const systemPrompt = buildSystemPrompt({
      scope: config.scope,
      instructions: config.instructions,
      contextText: context.toPromptText(),
    });
    const initialPrompts: AIMessage[] = systemPrompt
      ? [{ role: 'system', content: systemPrompt }]
      : [];

    try {
      const session = await backend.api.create({
        initialPrompts,
        temperature: config.temperature,
        topK: config.topK,
        tools: config.tools,
        expectedInputs: config.expectedInputs,
        expectedOutputs: config.expectedOutputs,
        signal: config.signal,
        monitor: createDownloadMonitor('languageModel', config.onDownloadProgress),
      });

      if (config.onQuotaOverflow) {
        session.addEventListener('quotaoverflow', config.onQuotaOverflow);
      }

      return new Agent(session, context, config.onQuotaOverflow, backend.model);
    } catch (cause) {
      throw new AIFeatureUnavailableError(
        'languageModel',
        cause instanceof Error ? cause.message : undefined,
      );
    }
  }

  /** The context currently attached to this agent. */
  get context(): Readonly<PageContext> {
    return this.#context.value;
  }

  /**
   * The web-llm model id backing this agent, when it's running on the WebGPU fallback
   * (e.g. `'Llama-3.2-3B-Instruct-q4f16_1-MLC'`). `undefined` on Chrome's built-in AI --
   * Gemini Nano has no public model id to report.
   */
  get model(): string | undefined {
    return this.#model;
  }

  /** Replaces the agent's context. Takes effect on the next `send`/`stream` call. */
  setContext(context: PageContext): void {
    this.#context.set(context);
  }

  /** Merges `patch` into the agent's context. Takes effect on the next `send`/`stream` call. */
  updateContext(patch: Partial<PageContext>): void {
    this.#context.update(patch);
  }

  /**
   * Sends a message and resolves with the full reply. `message` is plain text, or
   * multimodal content parts (`{ type: 'image' | 'audio' | 'text', value }`) for a
   * model created with matching `expectedInputs`.
   */
  async send(message: AgentMessage, options: SendOptions = {}): Promise<string> {
    await this.#flushContext();
    const { signal, responseConstraint } = options;

    return this.#session.prompt(toPromptInput(message), { signal, responseConstraint });
  }

  /** Sends a message and yields the reply incrementally as it is generated. */
  async *stream(message: AgentMessage, options: SendOptions = {}): AsyncGenerator<string> {
    await this.#flushContext();
    const { signal, responseConstraint, raw } = options;
    const rawStream = this.#session.promptStreaming(toPromptInput(message), {
      signal,
      responseConstraint,
    });

    if (raw) {
      yield* toAsyncIterable(rawStream);

      return;
    }

    yield* normalizeTextStream(rawStream);
  }

  /**
   * Estimates how much of the input quota `message` would use, without sending it.
   * `undefined` when the browser doesn't support this check.
   */
  async measureInputUsage(message: AgentMessage): Promise<number | undefined> {
    if (typeof this.#session.measureInputUsage !== 'function') {
      return undefined;
    }

    return this.#session.measureInputUsage(toPromptInput(message));
  }

  /**
   * Branches this conversation into a new independent {@link Agent} that shares the
   * history and system prompt so far. Useful for exploring multiple replies to the
   * same point in a conversation without paying to reprocess the shared prefix.
   */
  async clone(options: { signal?: AbortSignal } = {}): Promise<Agent> {
    const clonedSession = await this.#session.clone(options);

    if (this.#onQuotaOverflow) {
      clonedSession.addEventListener('quotaoverflow', this.#onQuotaOverflow);
    }

    return new Agent(
      clonedSession,
      new WebContext(this.#context.value),
      this.#onQuotaOverflow,
      this.#model,
    );
  }

  /** Approximate input token usage/quota for this session, when the browser reports it. */
  get usage(): { inputUsage?: number; inputQuota?: number } {
    return { inputUsage: this.#session.inputUsage, inputQuota: this.#session.inputQuota };
  }

  /** Frees the underlying session. Call this once you are done with the agent. */
  destroy(): void {
    this.#unsubscribe();

    if (this.#onQuotaOverflow) {
      this.#session.removeEventListener('quotaoverflow', this.#onQuotaOverflow);
    }

    this.#session.destroy();
  }

  async #flushContext(): Promise<void> {
    if (!this.#contextDirty) {
      return;
    }

    this.#contextDirty = false;
    const text = this.#context.toPromptText();

    if (!text || typeof this.#session.append !== 'function') {
      return;
    }

    await this.#session.append([{ role: 'user', content: `[Context update]\n${text}` }]);
  }
}
