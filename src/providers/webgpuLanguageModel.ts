/**
 * The optional WebGPU fallback: a `LanguageModelStatic`/`LanguageModelSession`-shaped
 * adapter over `@mlc-ai/web-llm`'s `MLCEngine`, so {@link Agent} and
 * {@link checkAvailability} can serve the Prompt API in browsers that support WebGPU
 * but don't expose Chrome's built-in `LanguageModel` (Firefox, Safari, non-Chrome
 * Chromium builds, or Chrome on unsupported hardware).
 *
 * `@mlc-ai/web-llm` is an optional peer dependency, loaded via a dynamic `import()`
 * only when this path is actually engaged -- consumers who never install it see no
 * behavior change at all (see the "WebGPU fallback" section of the README).
 *
 * The web-llm surface used here (an OpenAI-style `chat.completions.create()`) is
 * typed by hand below instead of imported from `@mlc-ai/web-llm` itself: that
 * package's shipped `.d.ts` re-exports its `ChatCompletion*` types through an
 * extension-less `export * from "./openai_api_protocols/index"`, which several
 * TypeScript versions under this repo's `moduleResolution: "nodenext"` fail to
 * resolve, collapsing those types (and anything that structurally touches them, like
 * `MLCEngine["chat"]`) to `unknown`. The shapes below mirror web-llm 0.2.x's real
 * runtime objects; see https://github.com/mlc-ai/web-llm for the source of truth.
 *
 * @internal
 */

import { AIFeatureUnavailableError } from '../errors.js';
import type {
  AIAvailability,
  AICreateMonitor,
  AIDownloadProgressEvent,
  AIMessage,
  LanguageModelCreateOptions,
  LanguageModelPromptOptions,
  LanguageModelSession,
  LanguageModelStatic,
  LanguageModelTool,
} from '../types/chrome-ai.js';

interface WebLLMToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

type WebLLMMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: WebLLMToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string };

interface WebLLMTool {
  type: 'function';
  function: { name: string; description?: string; parameters?: Record<string, unknown> };
}

interface WebLLMChatCompletion {
  choices: Array<{ message: { content: string | null; tool_calls?: WebLLMToolCall[] } }>;
}

interface WebLLMChatCompletionChunkDelta {
  content?: string | null;
  tool_calls?: Array<{
    index: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }>;
}

interface WebLLMChatCompletionChunk {
  choices: Array<{ delta: WebLLMChatCompletionChunkDelta }>;
}

interface WebLLMChatRequestBase {
  messages: WebLLMMessage[];
  temperature?: number;
  tools?: WebLLMTool[];
  response_format?: { type: 'json_object'; schema: string };
}

interface WebLLMEngine {
  chat: {
    completions: {
      create(request: WebLLMChatRequestBase & { stream?: false }): Promise<WebLLMChatCompletion>;
      create(
        request: WebLLMChatRequestBase & { stream: true },
      ): Promise<AsyncIterable<WebLLMChatCompletionChunk>>;
    };
  };
}

interface WebLLMModule {
  CreateMLCEngine: (
    modelId: string,
    engineConfig?: { initProgressCallback?: (report: { progress: number }) => void },
  ) => Promise<WebLLMEngine>;
  /** Model ids web-llm allows to receive `ChatCompletionRequest.tools` at all -- passing tools to any other model is a hard error, not just unreliable. */
  functionCallingModelIds: string[];
}

/** A small, broadly-compatible instruct model (~2.3GB VRAM) used when no `webgpu.model` override is given. */
export const DEFAULT_WEBGPU_MODEL = 'Llama-3.2-3B-Instruct-q4f16_1-MLC';

/**
 * Used instead of {@link DEFAULT_WEBGPU_MODEL} when the agent registers tools and no
 * explicit `webgpu.model` override is given: web-llm rejects `ChatCompletionRequest.tools`
 * outright for models outside its `functionCallingModelIds` allowlist, so the small
 * default model can't be used as-is. ~4.9GB VRAM -- notably heavier than the plain default.
 */
export const DEFAULT_WEBGPU_TOOL_MODEL = 'Hermes-3-Llama-3.1-8B-q4f16_1-MLC';

/** Bounds the client-side tool-call loop (web-llm has no built-in equivalent to Chrome's in-browser tool execution). */
const MAX_TOOL_ROUNDS = 4;

export function isWebGPUSupported(): boolean {
  return typeof navigator !== 'undefined' && (navigator as { gpu?: unknown }).gpu !== undefined;
}

let webllmModulePromise: Promise<WebLLMModule> | undefined;

function loadWebLLM(): Promise<WebLLMModule> {
  // The ignore comments keep bundlers (Vite/webpack) from trying to statically resolve
  // this truly-optional specifier at build time for consumers who never install it --
  // see the "WebGPU fallback" section of the README if your bundler still complains.
  webllmModulePromise ??= import(
    /* webpackIgnore: true */ /* @vite-ignore */ '@mlc-ai/web-llm'
  ) as unknown as Promise<WebLLMModule>;

  return webllmModulePromise;
}

/** `true` once the optional `@mlc-ai/web-llm` peer dependency has been confirmed loadable. */
export async function isWebGPUBackendInstalled(): Promise<boolean> {
  try {
    await loadWebLLM();

    return true;
  } catch {
    return false;
  }
}

const engineCache = new Map<string, Promise<WebLLMEngine>>();

async function loadEngine(
  webllm: WebLLMModule,
  modelId: string,
  onProgress: (loaded: number) => void,
): Promise<WebLLMEngine> {
  const cached = engineCache.get(modelId);

  if (cached) {
    return cached;
  }

  const enginePromise = webllm.CreateMLCEngine(modelId, {
    initProgressCallback: (report) => onProgress(report.progress),
  });

  engineCache.set(modelId, enginePromise);

  try {
    return await enginePromise;
  } catch (error) {
    engineCache.delete(modelId);

    throw error;
  }
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError');
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw abortReason(signal);
  }
}

function awaitWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return promise;
  }

  throwIfAborted(signal);

  const abortPromise = new Promise<never>((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(abortReason(signal)), { once: true });
  });

  return Promise.race([promise, abortPromise]);
}

/** Adapts Chrome's `monitor(m) { m.addEventListener('downloadprogress', ...) }` shape to web-llm's plain callback. */
function createProgressEmitter(
  monitor?: (target: AICreateMonitor) => void,
): (loaded: number) => void {
  if (!monitor) {
    return () => {};
  }

  const target = new EventTarget();

  monitor(target as unknown as AICreateMonitor);

  return (loaded: number) => {
    const event = new Event('downloadprogress') as AIDownloadProgressEvent;

    Object.defineProperty(event, 'loaded', { value: loaded, configurable: true });
    target.dispatchEvent(event);
  };
}

function toWebLLMMessage(message: AIMessage): WebLLMMessage {
  if (typeof message.content !== 'string') {
    throw new AIFeatureUnavailableError(
      'languageModel',
      'the WebGPU fallback only supports text messages for now -- image/audio content parts require ' +
        "Chrome's built-in AI (check availability().backend before offering photo/voice input)",
    );
  }

  if (message.role === 'system') {
    return { role: 'system', content: message.content };
  }

  if (message.role === 'assistant') {
    return { role: 'assistant', content: message.content };
  }

  return { role: 'user', content: message.content };
}

function toWebLLMMessages(messages: AIMessage[]): WebLLMMessage[] {
  return messages.map(toWebLLMMessage);
}

/**
 * Builds the initial history from `Agent`'s `initialPrompts` (the site-scope guard,
 * `instructions`, and context, seeded as a single system message). When tools are
 * registered, web-llm's hardcoded function-calling support (currently every model in
 * `functionCallingModelIds`) reserves the system role for its own tool-definition
 * prompt and throws `CustomSystemPromptError` if any caller message also uses it -- so
 * here the system message is folded into a user/assistant preamble instead, which
 * still gets the scoping/instructions/context to the model without occupying that slot.
 */
function buildInitialHistory(
  initialPrompts: AIMessage[] | undefined,
  hasTools: boolean,
): WebLLMMessage[] {
  if (!initialPrompts?.length) {
    return [];
  }

  const messages = toWebLLMMessages(initialPrompts);

  if (!hasTools) {
    return messages;
  }

  return messages.flatMap((message) =>
    message.role === 'system'
      ? [
          { role: 'user' as const, content: message.content },
          { role: 'assistant' as const, content: 'Understood.' },
        ]
      : [message],
  );
}

function toPromptTurn(input: string | AIMessage[]): WebLLMMessage[] {
  return typeof input === 'string' ? [{ role: 'user', content: input }] : toWebLLMMessages(input);
}

function toWebLLMTool(tool: LanguageModelTool): WebLLMTool {
  return {
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
  };
}

async function executeTool(
  toolsByName: Map<string, LanguageModelTool>,
  call: { name: string; arguments: string },
): Promise<unknown> {
  const tool = toolsByName.get(call.name);

  if (!tool) {
    return { error: `Unknown tool "${call.name}"` };
  }

  try {
    return await tool.execute(JSON.parse(call.arguments || '{}'));
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

interface RoundOptions {
  temperature?: number;
  tools?: LanguageModelTool[];
  responseConstraint?: Record<string, unknown>;
  signal?: AbortSignal;
}

function buildResponseFormat(
  responseConstraint: Record<string, unknown> | undefined,
  hasTools: boolean,
): { type: 'json_object'; schema: string } | undefined {
  if (!responseConstraint) {
    return undefined;
  }

  if (hasTools) {
    // web-llm's hardcoded function-calling support sets its own response_format for the
    // tool-call schema and throws (`CustomResponseFormatError`) if the request already
    // has one -- so this combination has no way to honor both at once.
    throw new AIFeatureUnavailableError(
      'languageModel',
      "the WebGPU fallback can't combine `responseConstraint` with `tools` in the same " +
        'call -- web-llm reserves the response format for its own tool-calling schema.',
    );
  }

  return { type: 'json_object', schema: JSON.stringify(responseConstraint) };
}

/** Non-streaming prompt: runs the tool-call loop to completion and returns the final text reply. */
async function runToolLoop(
  engine: WebLLMEngine,
  history: WebLLMMessage[],
  turn: WebLLMMessage[],
  options: RoundOptions,
): Promise<{ reply: string; history: WebLLMMessage[] }> {
  const toolsByName = new Map((options.tools ?? []).map((tool) => [tool.name, tool]));
  const chatTools = options.tools?.length ? options.tools.map(toWebLLMTool) : undefined;

  let conversation = [...history, ...turn];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    throwIfAborted(options.signal);

    const completion = await engine.chat.completions.create({
      messages: conversation,
      temperature: options.temperature,
      tools: chatTools,
      response_format: buildResponseFormat(options.responseConstraint, Boolean(chatTools)),
      stream: false,
    });
    const message = completion.choices[0]?.message;
    const toolCalls = message?.tool_calls;

    if (!toolCalls?.length) {
      const reply = message?.content ?? '';

      return { reply, history: [...conversation, { role: 'assistant', content: reply }] };
    }

    conversation = [
      ...conversation,
      { role: 'assistant', content: message.content, tool_calls: toolCalls },
    ];

    for (const call of toolCalls) {
      const result = await executeTool(toolsByName, call.function);

      conversation = [
        ...conversation,
        { role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) },
      ];
    }
  }

  throw new AIFeatureUnavailableError(
    'languageModel',
    'exceeded the maximum number of tool-call rounds',
  );
}

/**
 * Streaming prompt. When no tools are attached, yields deltas live as web-llm emits
 * them. When tools are attached, a round that ends in a tool call is executed and
 * re-issued silently (its partial text may just be function-call syntax, not a
 * user-facing reply); only the final, tool-free round is yielded -- as one chunk,
 * once it's complete, since we can't know a round is tool-free until it ends.
 */
async function* streamToolLoop(
  engine: WebLLMEngine,
  history: WebLLMMessage[],
  turn: WebLLMMessage[],
  options: RoundOptions,
): AsyncGenerator<string, WebLLMMessage[]> {
  const toolsByName = new Map((options.tools ?? []).map((tool) => [tool.name, tool]));
  const chatTools = options.tools?.length ? options.tools.map(toWebLLMTool) : undefined;

  let conversation = [...history, ...turn];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    throwIfAborted(options.signal);

    const stream = await engine.chat.completions.create({
      messages: conversation,
      temperature: options.temperature,
      tools: chatTools,
      response_format: buildResponseFormat(options.responseConstraint, Boolean(chatTools)),
      stream: true,
    });

    let content = '';

    const toolCallsByIndex = new Map<number, { id?: string; name: string; arguments: string }>();

    for await (const chunk of stream) {
      throwIfAborted(options.signal);
      const delta = chunk.choices[0]?.delta;

      if (delta?.content) {
        content += delta.content;

        if (!chatTools) {
          yield delta.content;
        }
      }

      for (const toolCallDelta of delta?.tool_calls ?? []) {
        const existing = toolCallsByIndex.get(toolCallDelta.index) ?? { name: '', arguments: '' };

        existing.id ??= toolCallDelta.id;
        existing.name += toolCallDelta.function?.name ?? '';
        existing.arguments += toolCallDelta.function?.arguments ?? '';
        toolCallsByIndex.set(toolCallDelta.index, existing);
      }
    }

    if (toolCallsByIndex.size === 0) {
      if (chatTools) {
        yield content;
      }

      return [...conversation, { role: 'assistant', content }];
    }

    const toolCalls: WebLLMToolCall[] = [...toolCallsByIndex.entries()].map(([index, call]) => ({
      id: call.id ?? String(index),
      type: 'function',
      function: { name: call.name, arguments: call.arguments },
    }));

    conversation = [
      ...conversation,
      { role: 'assistant', content: content || null, tool_calls: toolCalls },
    ];

    for (const call of toolCalls) {
      const result = await executeTool(toolsByName, call.function);

      conversation = [
        ...conversation,
        { role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) },
      ];
    }
  }

  throw new AIFeatureUnavailableError(
    'languageModel',
    'exceeded the maximum number of tool-call rounds',
  );
}

class WebGPULanguageModelSession extends EventTarget implements LanguageModelSession {
  #engine: WebLLMEngine;
  #history: WebLLMMessage[];
  readonly #temperature: number | undefined;
  readonly #tools: LanguageModelTool[] | undefined;

  constructor(
    engine: WebLLMEngine,
    history: WebLLMMessage[],
    temperature: number | undefined,
    tools: LanguageModelTool[] | undefined,
  ) {
    super();
    this.#engine = engine;
    this.#history = history;
    this.#temperature = temperature;
    this.#tools = tools;
  }

  async prompt(
    input: string | AIMessage[],
    options: LanguageModelPromptOptions = {},
  ): Promise<string> {
    const { reply, history } = await runToolLoop(this.#engine, this.#history, toPromptTurn(input), {
      temperature: this.#temperature,
      tools: this.#tools,
      responseConstraint: options.responseConstraint,
      signal: options.signal,
    });

    this.#history = history;

    return reply;
  }

  promptStreaming(
    input: string | AIMessage[],
    options: LanguageModelPromptOptions = {},
  ): ReadableStream<string> {
    const generator = streamToolLoop(this.#engine, this.#history, toPromptTurn(input), {
      temperature: this.#temperature,
      tools: this.#tools,
      responseConstraint: options.responseConstraint,
      signal: options.signal,
    });

    return new ReadableStream<string>({
      pull: async (controller) => {
        try {
          const { value, done } = await generator.next();

          if (done) {
            this.#history = value;
            controller.close();

            return;
          }

          controller.enqueue(value);
        } catch (error) {
          controller.error(error);
        }
      },
      cancel: () => {
        void generator.return([]);
      },
    });
  }

  append(messages: AIMessage[]): Promise<void> {
    this.#history = [...this.#history, ...toWebLLMMessages(messages)];

    return Promise.resolve();
  }

  clone(): Promise<LanguageModelSession> {
    return Promise.resolve(
      new WebGPULanguageModelSession(
        this.#engine,
        [...this.#history],
        this.#temperature,
        this.#tools,
      ),
    );
  }

  destroy(): void {
    // The underlying engine is cached and shared across every session created for this
    // model id (reloading/redownloading it per agent would be prohibitively slow), so
    // destroying a session only drops this agent's own conversation history.
  }
}

async function createSession(
  webllm: WebLLMModule,
  modelId: string,
  options: LanguageModelCreateOptions,
): Promise<LanguageModelSession> {
  throwIfAborted(options.signal);

  // Checked before loading the engine (not on first send()/stream()) so a mismatched
  // model+tools combo fails fast with an actionable message instead of after a multi-GB
  // download, and surfaces as this library's own AIFeatureUnavailableError rather than
  // web-llm's raw internal error -- Agent.create()'s existing try/catch wraps whatever
  // this throws.
  if (options.tools?.length && !webllm.functionCallingModelIds.includes(modelId)) {
    throw new Error(
      `model "${modelId}" doesn't support tools on the WebGPU fallback. Pass ` +
        `webgpu: { model: '...' } with one of: ${webllm.functionCallingModelIds.join(', ')} ` +
        '-- or create the agent without tools.',
    );
  }

  const onProgress = createProgressEmitter(options.monitor);
  const engine = await awaitWithAbort(loadEngine(webllm, modelId, onProgress), options.signal);
  const history = buildInitialHistory(options.initialPrompts, Boolean(options.tools?.length));

  return new WebGPULanguageModelSession(engine, history, options.temperature, options.tools);
}

/** Builds a `LanguageModelStatic` bound to a specific web-llm model id. */
export function createWebGPULanguageModelStatic(modelId: string): LanguageModelStatic {
  return {
    availability: (): Promise<AIAvailability> => {
      if (!isWebGPUSupported()) {
        return Promise.resolve('unavailable');
      }

      return Promise.resolve(engineCache.has(modelId) ? 'available' : 'downloadable');
    },
    create: async (options = {}) => createSession(await loadWebLLM(), modelId, options),
    // web-llm has no equivalent to Chrome's temperature/topK bounds; report unsupported.
    params: () => Promise.resolve(null),
  };
}
