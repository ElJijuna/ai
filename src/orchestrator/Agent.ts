import { WebContext } from '../context/WebContext.js';
import { AIFeatureNotSupportedError, AIFeatureUnavailableError } from '../errors.js';
import type { AIMessage, LanguageModelSession } from '../types/chrome-ai.js';
import type { AgentConfig, PageContext, SendOptions } from '../types.js';
import { createDownloadMonitor } from '../utils/download.js';
import { normalizeTextStream, toAsyncIterable } from '../utils/stream.js';
import { buildSystemPrompt } from './systemPrompt.js';

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
  #contextDirty = false;

  private constructor(session: LanguageModelSession, context: WebContext) {
    this.#session = session;
    this.#context = context;
    this.#unsubscribe = context.onChange(() => {
      this.#contextDirty = true;
    });
  }

  /** @internal */
  static async create(config: AgentConfig = {}): Promise<Agent> {
    if (typeof globalThis.LanguageModel === 'undefined') {
      throw new AIFeatureNotSupportedError('languageModel');
    }

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
      const session = await globalThis.LanguageModel.create({
        initialPrompts,
        temperature: config.temperature,
        topK: config.topK,
        tools: config.tools,
        signal: config.signal,
        monitor: createDownloadMonitor('languageModel', config.onDownloadProgress),
      });

      return new Agent(session, context);
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

  /** Replaces the agent's context. Takes effect on the next `send`/`stream` call. */
  setContext(context: PageContext): void {
    this.#context.set(context);
  }

  /** Merges `patch` into the agent's context. Takes effect on the next `send`/`stream` call. */
  updateContext(patch: Partial<PageContext>): void {
    this.#context.update(patch);
  }

  /** Sends a message and resolves with the full reply. */
  async send(message: string, options: SendOptions = {}): Promise<string> {
    await this.#flushContext();
    const { signal, responseConstraint } = options;

    return this.#session.prompt(message, { signal, responseConstraint });
  }

  /** Sends a message and yields the reply incrementally as it is generated. */
  async *stream(message: string, options: SendOptions = {}): AsyncGenerator<string> {
    await this.#flushContext();
    const { signal, responseConstraint, raw } = options;
    const rawStream = this.#session.promptStreaming(message, { signal, responseConstraint });

    if (raw) {
      yield* toAsyncIterable(rawStream);

      return;
    }

    yield* normalizeTextStream(rawStream);
  }

  /**
   * Branches this conversation into a new independent {@link Agent} that shares the
   * history and system prompt so far. Useful for exploring multiple replies to the
   * same point in a conversation without paying to reprocess the shared prefix.
   */
  async clone(options: { signal?: AbortSignal } = {}): Promise<Agent> {
    const clonedSession = await this.#session.clone(options);

    return new Agent(clonedSession, new WebContext(this.#context.value));
  }

  /** Approximate input token usage/quota for this session, when the browser reports it. */
  get usage(): { inputUsage?: number; inputQuota?: number } {
    return { inputUsage: this.#session.inputUsage, inputQuota: this.#session.inputQuota };
  }

  /** Frees the underlying session. Call this once you are done with the agent. */
  destroy(): void {
    this.#unsubscribe();
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
