import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tool } from '../src/types.js';
import {
  chunkStream,
  createMockEngine,
  installMissingWebLLM,
  installMockWebLLM,
  stubWebGPUSupport,
} from './mocks/web-llm.js';

// This module talks to the *optional* `@mlc-ai/web-llm` peer dependency via a dynamic
// `import()` resolved lazily, and caches both the module and any created engine at the
// module level. `vi.resetModules()` + a fresh dynamic `import()` per test gives each
// test its own copy of that private state, so engine/module caching in one test can't
// leak into the next.
describe('WebGPU fallback', () => {
  beforeEach(() => {
    vi.resetModules();
    stubWebGPUSupport(true);
  });

  afterEach(() => {
    stubWebGPUSupport(false);
    vi.doUnmock('@mlc-ai/web-llm');
  });

  it('checkAvailability reports the webgpu backend when Chrome is absent but WebGPU + web-llm are present', async () => {
    installMockWebLLM(() =>
      createMockEngine(() => ({ choices: [{ message: { content: 'hi' } }] })),
    );
    const { checkAvailability } = await import('../src/availability.js');
    const info = await checkAvailability('languageModel');

    expect(info).toEqual({
      feature: 'languageModel',
      state: 'downloadable',
      supported: true,
      backend: 'webgpu',
    });
  });

  it('checkAvailability reports unsupported when the browser has no WebGPU', async () => {
    stubWebGPUSupport(false);
    const { checkAvailability } = await import('../src/availability.js');
    const info = await checkAvailability('languageModel');

    expect(info).toEqual({ feature: 'languageModel', state: 'unsupported', supported: false });
  });

  it('checkAvailability reports unsupported when @mlc-ai/web-llm is not installed', async () => {
    installMissingWebLLM();
    const { checkAvailability } = await import('../src/availability.js');
    const info = await checkAvailability('languageModel');

    expect(info).toEqual({ feature: 'languageModel', state: 'unsupported', supported: false });
  });

  it('Agent.create() throws AIFeatureNotSupportedError when @mlc-ai/web-llm is not installed', async () => {
    installMissingWebLLM();
    // Imported fresh from the same reset module registry as `Agent`, since a class
    // imported before `vi.resetModules()` is a distinct identity from the one `Agent`
    // throws after the reset -- `instanceof` would otherwise fail despite matching
    // name/message.
    const { Agent } = await import('../src/orchestrator/Agent.js');
    const { AIFeatureNotSupportedError } = await import('../src/errors.js');

    await expect(Agent.create()).rejects.toThrow(AIFeatureNotSupportedError);
  });

  it('Agent#send delegates to the WebGPU engine and keeps growing the conversation history', async () => {
    const create = vi.fn((request: { messages: Array<{ role: string }> }) => {
      const turns = request.messages.filter((message) => message.role === 'user').length;

      return Promise.resolve({ choices: [{ message: { content: `reply ${turns}` } }] });
    });

    installMockWebLLM(() => ({ chat: { completions: { create } } }));
    const { Agent } = await import('../src/orchestrator/Agent.js');
    const agent = await Agent.create({ scope: { mode: 'off' } });

    await expect(agent.send('one')).resolves.toBe('reply 1');
    await expect(agent.send('two')).resolves.toBe('reply 2');
  });

  it('Agent#stream yields deltas from the WebGPU engine', async () => {
    const create = vi.fn(() =>
      Promise.resolve(
        chunkStream([
          { choices: [{ delta: { content: 'Hel' } }] },
          { choices: [{ delta: { content: 'lo' } }] },
        ]),
      ),
    );

    installMockWebLLM(() => ({ chat: { completions: { create } } }));
    const { Agent } = await import('../src/orchestrator/Agent.js');
    const agent = await Agent.create({ scope: { mode: 'off' } });
    const chunks: string[] = [];

    for await (const chunk of agent.stream('hi')) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['Hel', 'lo']);
  });

  it('Agent#send runs a registered tool and feeds its result back to the model', async () => {
    let round = 0;

    const create = vi.fn(() => {
      round += 1;

      if (round === 1) {
        return Promise.resolve({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: { name: 'getTime', arguments: '{}' },
                  },
                ],
              },
            },
          ],
        });
      }

      return Promise.resolve({ choices: [{ message: { content: 'It is noon.' } }] });
    });

    installMockWebLLM(() => ({ chat: { completions: { create } } }));
    const { Agent } = await import('../src/orchestrator/Agent.js');
    const getTime: Tool = {
      name: 'getTime',
      description: 'Returns the current time.',
      inputSchema: { type: 'object', properties: {} },
      execute: vi.fn(() => ({ time: 'noon' })),
    };
    const agent = await Agent.create({ scope: { mode: 'off' }, tools: [getTime] });

    await expect(agent.send('what time is it?')).resolves.toBe('It is noon.');
    expect(getTime.execute).toHaveBeenCalledTimes(1);
    expect(getTime.execute).toHaveBeenCalledWith({});
  });

  it('auto-selects a function-calling-capable model when tools are registered without an explicit override', async () => {
    const createMLCEngine = installMockWebLLM(() =>
      createMockEngine(() => ({ choices: [{ message: { content: 'ok' } }] })),
    );
    const { Agent } = await import('../src/orchestrator/Agent.js');
    const noop: Tool = {
      name: 'noop',
      description: 'Does nothing.',
      inputSchema: { type: 'object', properties: {} },
      execute: () => null,
    };

    await Agent.create({ scope: { mode: 'off' }, tools: [noop] });

    expect(createMLCEngine).toHaveBeenCalledWith(
      'Hermes-3-Llama-3.1-8B-q4f16_1-MLC',
      expect.anything(),
    );
  });

  it('rejects with AIFeatureUnavailableError before downloading anything when an explicit webgpu.model override does not support tools', async () => {
    const createMLCEngine = installMockWebLLM(() =>
      createMockEngine(() => ({ choices: [{ message: { content: 'ok' } }] })),
    );
    const { Agent } = await import('../src/orchestrator/Agent.js');
    const { AIFeatureUnavailableError } = await import('../src/errors.js');
    const noop: Tool = {
      name: 'noop',
      description: 'Does nothing.',
      inputSchema: { type: 'object', properties: {} },
      execute: () => null,
    };

    await expect(
      Agent.create({
        scope: { mode: 'off' },
        tools: [noop],
        webgpu: { model: 'Llama-3.2-3B-Instruct-q4f16_1-MLC' },
      }),
    ).rejects.toThrow(AIFeatureUnavailableError);
    expect(createMLCEngine).not.toHaveBeenCalled();
  });

  it('succeeds when an explicit webgpu.model override does support tools', async () => {
    installMockWebLLM(() =>
      createMockEngine(() => ({ choices: [{ message: { content: 'ok' } }] })),
    );
    const { Agent } = await import('../src/orchestrator/Agent.js');
    const noop: Tool = {
      name: 'noop',
      description: 'Does nothing.',
      inputSchema: { type: 'object', properties: {} },
      execute: () => null,
    };

    await expect(
      Agent.create({
        scope: { mode: 'off' },
        tools: [noop],
        webgpu: { model: 'Hermes-2-Pro-Mistral-7B-q4f16_1-MLC' },
      }),
    ).resolves.toBeDefined();
  });

  it('Agent#send rejects multimodal content with AIFeatureUnavailableError on the WebGPU backend', async () => {
    installMockWebLLM(() =>
      createMockEngine(() => ({ choices: [{ message: { content: 'ok' } }] })),
    );
    const { Agent } = await import('../src/orchestrator/Agent.js');
    const { AIFeatureUnavailableError } = await import('../src/errors.js');
    const agent = await Agent.create({ scope: { mode: 'off' } });

    await expect(
      agent.send([
        { type: 'text', value: 'describe this' },
        { type: 'image', value: {} as ImageBitmapSource },
      ]),
    ).rejects.toThrow(AIFeatureUnavailableError);
  });

  it('honors a webgpu.model override when creating the agent', async () => {
    installMockWebLLM(() =>
      createMockEngine(() => ({ choices: [{ message: { content: 'ok' } }] })),
    );
    const { Agent } = await import('../src/orchestrator/Agent.js');

    await Agent.create({
      scope: { mode: 'off' },
      webgpu: { model: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC' },
    });

    const { checkAvailability } = await import('../src/availability.js');
    const defaultModelInfo = await checkAvailability('languageModel');

    // The override model is now cached as loaded, but the *default* model id is a
    // separate cache entry, so availability for the default model is still just
    // "downloadable" -- confirming the override actually changed which model loaded.
    expect(defaultModelInfo).toEqual({
      feature: 'languageModel',
      state: 'downloadable',
      supported: true,
      backend: 'webgpu',
    });
  });
});
