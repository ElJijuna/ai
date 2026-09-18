import { describe, expect, it, vi } from 'vitest';
import { AIFeatureNotSupportedError } from '../src/errors.js';
import { Agent } from '../src/orchestrator/Agent.js';
import { createMockLanguageModelSession, installMockLanguageModel } from './mocks/chrome-ai.js';

describe('Agent.create', () => {
  it('throws AIFeatureNotSupportedError when the browser has no LanguageModel', async () => {
    await expect(Agent.create()).rejects.toThrow(AIFeatureNotSupportedError);
  });

  it('seeds the session with a system prompt built from scope, instructions, and context', async () => {
    const { static: mock } = installMockLanguageModel();

    await Agent.create({
      scope: { site: 'example.com' },
      instructions: 'Be concise.',
      context: { title: 'Home' },
    });

    expect(mock.create).toHaveBeenCalledTimes(1);
    const [[options]] = vi.mocked(mock.create).mock.calls;
    const systemMessage = options?.initialPrompts?.[0];

    expect(systemMessage?.role).toBe('system');
    expect(systemMessage?.content).toContain('example.com');
    expect(systemMessage?.content).toContain('Be concise.');
    expect(systemMessage?.content).toContain('title: Home');
  });
});

describe('Agent#send / stream', () => {
  it('delegates send() to the underlying session', async () => {
    const session = createMockLanguageModelSession();

    installMockLanguageModel({ session });
    const agent = await Agent.create();
    const reply = await agent.send('hello');

    expect(reply).toBe('reply to: hello');
    expect(session.prompt).toHaveBeenCalledWith('hello', {
      signal: undefined,
      responseConstraint: undefined,
    });
  });

  it('normalizes streaming chunks into deltas by default', async () => {
    const session = createMockLanguageModelSession();

    installMockLanguageModel({ session });
    const agent = await Agent.create();
    const chunks: string[] = [];

    for await (const chunk of agent.stream('hi')) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['Hel', 'lo', '!']);
  });

  it('yields raw chunks when options.raw is true', async () => {
    const session = createMockLanguageModelSession();

    installMockLanguageModel({ session });
    const agent = await Agent.create();
    const chunks: string[] = [];

    for await (const chunk of agent.stream('hi', { raw: true })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['Hel', 'Hello', 'Hello!']);
  });
});

describe('Agent#updateContext', () => {
  it('flushes pending context via session.append() before the next send()', async () => {
    const session = createMockLanguageModelSession();

    installMockLanguageModel({ session });
    const agent = await Agent.create();

    agent.updateContext({ title: 'Pricing' });
    expect(session.append).not.toHaveBeenCalled();

    await agent.send('what changed?');
    expect(session.append).toHaveBeenCalledTimes(1);
    // biome-ignore lint/style/noNonNullAssertion: the mock always defines append.
    const [[[contextMessage]]] = vi.mocked(session.append!).mock.calls;

    expect(contextMessage.role).toBe('user');
    expect(contextMessage.content).toContain('title: Pricing');
  });

  it('does not call append() again if the context has not changed since the last flush', async () => {
    const session = createMockLanguageModelSession();

    installMockLanguageModel({ session });
    const agent = await Agent.create({ context: { title: 'Home' } });

    agent.updateContext({ title: 'Pricing' });
    await agent.send('one');
    await agent.send('two');

    expect(session.append).toHaveBeenCalledTimes(1);
  });
});

describe('Agent#destroy', () => {
  it('destroys the underlying session', async () => {
    const session = createMockLanguageModelSession();

    installMockLanguageModel({ session });
    const agent = await Agent.create();

    agent.destroy();
    expect(session.destroy).toHaveBeenCalledTimes(1);
  });
});
