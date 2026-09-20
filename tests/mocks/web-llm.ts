import { vi } from 'vitest';

interface MockChatMessage {
  role: string;
  content: unknown;
  tool_calls?: unknown[];
  tool_call_id?: string;
}

export interface MockChatRequest {
  messages: MockChatMessage[];
  temperature?: number;
  tools?: unknown[];
  response_format?: { type: string; schema?: string };
  stream?: boolean;
}

export interface MockChatResponse {
  choices: Array<{ message: { content: string | null; tool_calls?: unknown[] } }>;
}

export interface MockChatChunk {
  choices: Array<{ delta: { content?: string; tool_calls?: unknown[] } }>;
}

// eslint-disable-next-line @typescript-eslint/require-await -- async generator; yielding plain values still needs no `await`.
async function* toAsyncIterable<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item;
  }
}

/** Wraps canned chunks into the async-iterable shape `engine.chat.completions.create({ stream: true })` resolves to. */
export function chunkStream(chunks: MockChatChunk[]): AsyncIterable<MockChatChunk> {
  return toAsyncIterable(chunks);
}

/** A fake `MLCEngine` whose `chat.completions.create()` is driven by a handler you control. */
export function createMockEngine(
  handleCreate: (request: MockChatRequest) => MockChatResponse | AsyncIterable<MockChatChunk>,
): { chat: { completions: { create: ReturnType<typeof vi.fn> } } } {
  return {
    chat: {
      completions: {
        create: vi.fn((request: MockChatRequest) => Promise.resolve(handleCreate(request))),
      },
    },
  };
}

/** Mocks the optional `@mlc-ai/web-llm` peer dependency for the current test's module registry. */
export function installMockWebLLM(createEngine: () => unknown): ReturnType<typeof vi.fn> {
  const createMLCEngine = vi.fn(
    (
      _modelId: string,
      engineConfig?: { initProgressCallback?: (report: { progress: number }) => void },
    ) => {
      engineConfig?.initProgressCallback?.({ progress: 1 });

      return Promise.resolve(createEngine());
    },
  );

  vi.doMock('@mlc-ai/web-llm', () => ({ CreateMLCEngine: createMLCEngine }));

  return createMLCEngine;
}

/** Simulates the optional `@mlc-ai/web-llm` peer dependency not being installed. */
export function installMissingWebLLM(): void {
  vi.doMock('@mlc-ai/web-llm', () => {
    throw new Error("Cannot find module '@mlc-ai/web-llm'");
  });
}

export function stubWebGPUSupport(supported: boolean): void {
  const nav = globalThis.navigator as unknown as { gpu?: unknown };

  if (supported) {
    nav.gpu = {};
  } else {
    delete nav.gpu;
  }
}
