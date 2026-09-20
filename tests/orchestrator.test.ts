import { describe, expect, it, vi } from 'vitest';
import { AIFeatureNotSupportedError } from '../src/errors.js';
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

describe('AIOrchestrator.isTranslationAvailable', () => {
  it('delegates to the translate action', async () => {
    const ai = new AIOrchestrator();
    const info = await ai.isTranslationAvailable({ from: 'en', to: 'es' });

    expect(info).toEqual({ feature: 'translator', state: 'unsupported', supported: false });
  });
});

describe('AIOrchestrator.context', () => {
  it('exposes the shared context via the context getter', () => {
    const ai = new AIOrchestrator({ context: { title: 'Home' } });

    expect(ai.context).toEqual({ title: 'Home' });
  });
});

describe('AIOrchestrator.captureContextFromDocument', () => {
  it('seeds the shared context from the current document', () => {
    document.title = 'Pricing';
    const ai = new AIOrchestrator();

    ai.captureContextFromDocument();

    expect(ai.context).toMatchObject({ title: 'Pricing' });
    document.title = '';
  });
});

describe('AIOrchestrator tool management', () => {
  it('registerTool()/registerTools()/unregisterTool() shape the tool set passed to new agents', async () => {
    const { static: mock } = installMockLanguageModel();
    const toolA = defineTool({
      name: 'a',
      description: 'A',
      inputSchema: { type: 'object', properties: {} },
      execute: () => 1,
    });
    const toolB = defineTool({
      name: 'b',
      description: 'B',
      inputSchema: { type: 'object', properties: {} },
      execute: () => 2,
    });
    const ai = new AIOrchestrator();

    ai.registerTool(toolA);
    ai.registerTools([toolB]);
    await ai.createAgent();

    const firstCall = vi.mocked(mock.create).mock.calls[0]?.[0];

    expect(firstCall?.tools).toEqual([toolA, toolB]);

    ai.unregisterTool('a');
    await ai.createAgent();

    const secondCall = vi.mocked(mock.create).mock.calls[1]?.[0];

    expect(secondCall?.tools).toEqual([toolB]);
  });
});

describe('AIOrchestrator.preload', () => {
  it('warms the model with registered tools merged in, without creating a chat session', async () => {
    const { static: mock, session } = installMockLanguageModel();
    const toolA = defineTool({
      name: 'a',
      description: 'A',
      inputSchema: { type: 'object', properties: {} },
      execute: () => 1,
    });
    const ai = new AIOrchestrator();

    ai.registerTool(toolA);
    await ai.preload();

    expect(mock.create).toHaveBeenCalledTimes(1);
    const [[options]] = vi.mocked(mock.create).mock.calls;

    expect(options?.tools).toEqual([toolA]);
    expect(options?.initialPrompts).toBeUndefined();
    expect(session.destroy).toHaveBeenCalledTimes(1);
  });

  it('throws AIFeatureNotSupportedError when unsupported, same as createAgent()', async () => {
    const ai = new AIOrchestrator();

    await expect(ai.preload()).rejects.toThrow(AIFeatureNotSupportedError);
  });
});

describe('AIOrchestrator.getModelParams', () => {
  it('resolves to null when LanguageModel is not supported', async () => {
    const ai = new AIOrchestrator();

    await expect(ai.getModelParams()).resolves.toBeNull();
  });

  it('delegates to LanguageModel.params() when supported', async () => {
    installMockLanguageModel();
    const ai = new AIOrchestrator();

    await expect(ai.getModelParams()).resolves.toEqual({
      defaultTopK: 3,
      maxTopK: 8,
      defaultTemperature: 1,
      maxTemperature: 2,
    });
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

  it('drops an agent from future broadcasts if applying an update to it throws', async () => {
    installMockLanguageModel();
    const ai = new AIOrchestrator();
    const agentA = await ai.createAgent();
    const agentB = await ai.createAgent();

    agentA.setContext = vi.fn(() => {
      throw new Error('destroyed');
    });
    const setContextB = vi.spyOn(agentB, 'setContext');

    expect(() => ai.setContext({ title: 'Pricing' })).not.toThrow();
    expect(setContextB).toHaveBeenCalledWith({ title: 'Pricing' });

    ai.setContext({ title: 'Checkout' });
    // eslint-disable-next-line @typescript-eslint/unbound-method -- agentA.setContext is a vi.fn() mock, not a real bound method.
    expect(agentA.setContext).toHaveBeenCalledTimes(1);
    expect(setContextB).toHaveBeenCalledTimes(2);
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

  it('write() derives sharedContext from scope.site when no description is given', async () => {
    const create = vi.fn(() =>
      Promise.resolve({
        write: vi.fn(() => Promise.resolve('draft copy')),
        writeStreaming: vi.fn(),
        destroy: vi.fn(),
      }),
    );

    globalThis.Writer = { availability: vi.fn(), create };

    const ai = new AIOrchestrator({ scope: { site: 'shop.example' } });
    const result = await ai.write('a product blurb');

    expect(result).toBe('draft copy');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ sharedContext: 'This is the website shop.example.' }),
    );
  });

  it('rewrite() has no sharedContext when scope has neither description nor site', async () => {
    const create = vi.fn(() =>
      Promise.resolve({
        rewrite: vi.fn(() => Promise.resolve('nicer draft')),
        rewriteStreaming: vi.fn(),
        destroy: vi.fn(),
      }),
    );

    globalThis.Rewriter = { availability: vi.fn(), create };

    const ai = new AIOrchestrator();
    const result = await ai.rewrite('draft text');

    expect(result).toBe('nicer draft');
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ sharedContext: undefined }));
  });

  it('translate() delegates directly to the translate action', async () => {
    globalThis.Translator = {
      availability: vi.fn(),
      create: vi.fn(() =>
        Promise.resolve({
          translate: vi.fn(() => Promise.resolve('Hola')),
          translateStreaming: vi.fn(),
          destroy: vi.fn(),
        }),
      ),
    };

    const ai = new AIOrchestrator();

    await expect(ai.translate('Hello', { from: 'en', to: 'es' })).resolves.toBe('Hola');
  });

  it('detectLanguage() delegates directly to the detectLanguage action', async () => {
    globalThis.LanguageDetector = {
      availability: vi.fn(),
      create: vi.fn(() =>
        Promise.resolve({
          detect: vi.fn(() => Promise.resolve([{ detectedLanguage: 'en', confidence: 0.9 }])),
          destroy: vi.fn(),
        }),
      ),
    };

    const ai = new AIOrchestrator();

    await expect(ai.detectLanguage('Hello')).resolves.toEqual([
      { detectedLanguage: 'en', confidence: 0.9 },
    ]);
  });

  it('proofread() delegates directly to the proofread action', async () => {
    globalThis.Proofreader = {
      availability: vi.fn(),
      create: vi.fn(() =>
        Promise.resolve({
          proofread: vi.fn(() => Promise.resolve({ correctedInput: 'Fixed.', corrections: [] })),
          destroy: vi.fn(),
        }),
      ),
    };

    const ai = new AIOrchestrator();

    await expect(ai.proofread('Fixd.')).resolves.toEqual({
      correctedInput: 'Fixed.',
      corrections: [],
    });
  });
});

describe('AIOrchestrator WebMCP exposure', () => {
  it('registers tools on document.modelContext when exposeToolsToPage is true, and re-syncs on registerTool()', () => {
    const registerTool = vi.fn(() => vi.fn());

    (globalThis.document as { modelContext?: unknown }).modelContext = { registerTool };

    const toolA = defineTool({
      name: 'a',
      description: 'A',
      inputSchema: { type: 'object', properties: {} },
      execute: () => 1,
    });
    const ai = new AIOrchestrator({ tools: [toolA], exposeToolsToPage: true });

    expect(registerTool).toHaveBeenCalledWith(toolA);

    const toolB = defineTool({
      name: 'b',
      description: 'B',
      inputSchema: { type: 'object', properties: {} },
      execute: () => 2,
    });

    ai.registerTool(toolB);

    expect(registerTool).toHaveBeenCalledWith(toolB);
  });

  it('leaves document.modelContext untouched when exposeToolsToPage is left false', () => {
    const registerTool = vi.fn(() => vi.fn());

    (globalThis.document as { modelContext?: unknown }).modelContext = { registerTool };

    const tool = defineTool({
      name: 'a',
      description: 'A',
      inputSchema: { type: 'object', properties: {} },
      execute: () => 1,
    });

    new AIOrchestrator({ tools: [tool] });

    expect(registerTool).not.toHaveBeenCalled();
  });
});
