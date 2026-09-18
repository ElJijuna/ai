import { describe, expect, it, vi } from 'vitest';
import { AIOrchestrator } from '../src/orchestrator/AIOrchestrator.js';
import { defineTool } from '../src/tools/defineTool.js';
import { createMockLanguageModelSession, installMockLanguageModel } from './mocks/chrome-ai.js';

describe('AIOrchestrator.isAvailable', () => {
  it('reports unsupported when nothing is installed', async () => {
    const ai = new AIOrchestrator();
    const info = await ai.isAvailable();

    expect(info.supported).toBe(false);
  });
});

describe('AIOrchestrator.createAgent', () => {
  it('merges the orchestrator scope, shared context, and registered tools into new agents', async () => {
    const { static: mock } = installMockLanguageModel();
    const tool = defineTool({
      name: 'getPrice',
      description: 'Returns the current price.',
      inputSchema: { type: 'object', properties: {} },
      execute: () => ({ price: 42 }),
    });
    const ai = new AIOrchestrator({
      scope: { site: 'shop.example' },
      context: { title: 'Home' },
      tools: [tool],
    });

    await ai.createAgent({ context: { section: 'pricing' } });

    const [[options]] = vi.mocked(mock.create).mock.calls;
    const systemMessage = options?.initialPrompts?.[0];

    expect(systemMessage?.content).toContain('shop.example');
    expect(systemMessage?.content).toContain('title: Home');
    expect(systemMessage?.content).toContain('section: pricing');
    expect(options?.tools).toEqual([tool]);
  });

  it('destroyAgents() destroys every agent it created', async () => {
    const sessionA = createMockLanguageModelSession();
    const sessionB = createMockLanguageModelSession();

    installMockLanguageModel({ session: sessionA });
    const ai = new AIOrchestrator();

    await ai.createAgent();

    installMockLanguageModel({ session: sessionB });
    await ai.createAgent();

    ai.destroyAgents();
    expect(sessionA.destroy).toHaveBeenCalledTimes(1);
    expect(sessionB.destroy).toHaveBeenCalledTimes(1);
  });
});

describe('AIOrchestrator context broadcasting', () => {
  it('pushes updateContext()/setContext() to every live agent', async () => {
    const session = createMockLanguageModelSession();

    installMockLanguageModel({ session });
    const ai = new AIOrchestrator();
    const agent = await ai.createAgent();

    ai.updateContext({ title: 'Pricing' });
    expect(agent.context).toEqual({ title: 'Pricing' });

    ai.setContext({ title: 'Checkout' });
    expect(agent.context).toEqual({ title: 'Checkout' });
  });
});

describe('AIOrchestrator default actions', () => {
  it('summarize() injects a sharedContext derived from scope when none is given', async () => {
    const create = vi.fn(() =>
      Promise.resolve({
        summarize: vi.fn(() => Promise.resolve('a summary')),
        summarizeStreaming: vi.fn(),
        destroy: vi.fn(),
      }),
    );

    globalThis.Summarizer = { availability: vi.fn(), create };

    const ai = new AIOrchestrator({ scope: { description: 'an online camera shop' } });
    const result = await ai.summarize('long text');

    expect(result).toBe('a summary');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ sharedContext: 'an online camera shop' }),
    );
  });
});
