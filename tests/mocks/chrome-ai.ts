import { vi } from 'vitest';
import type {
  AIAvailability,
  AIMessage,
  LanguageModelSession,
  LanguageModelStatic,
} from '../../src/types/chrome-ai.js';

export function createMockLanguageModelSession(
  overrides: Partial<LanguageModelSession> = {},
): LanguageModelSession {
  const session: LanguageModelSession = {
    prompt: vi.fn((input: string | AIMessage[]) =>
      Promise.resolve(`reply to: ${typeof input === 'string' ? input : JSON.stringify(input)}`),
    ),
    promptStreaming: vi.fn(() => {
      return new ReadableStream<string>({
        start(controller) {
          controller.enqueue('Hel');
          controller.enqueue('Hello');
          controller.enqueue('Hello!');
          controller.close();
        },
      });
    }),
    append: vi.fn(() => Promise.resolve()),
    clone: vi.fn(() => Promise.resolve(createMockLanguageModelSession(overrides))),
    destroy: vi.fn(),
    inputUsage: 0,
    inputQuota: 1000,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
    ...overrides,
  };

  return session;
}

export function installMockLanguageModel(
  options: { availability?: AIAvailability; session?: LanguageModelSession } = {},
): { static: LanguageModelStatic; session: LanguageModelSession } {
  const session = options.session ?? createMockLanguageModelSession();
  const staticApi: LanguageModelStatic = {
    availability: vi.fn(() => Promise.resolve(options.availability ?? 'available')),
    create: vi.fn(() => Promise.resolve(session)),
    params: vi.fn(() =>
      Promise.resolve({
        defaultTopK: 3,
        maxTopK: 8,
        defaultTemperature: 1,
        maxTemperature: 2,
      }),
    ),
  };

  globalThis.LanguageModel = staticApi;

  return { static: staticApi, session };
}
