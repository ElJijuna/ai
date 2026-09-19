import { describe, expect, it, vi } from 'vitest';
import { defineTool } from '../src/tools/defineTool.js';
import { exposeToolsToPage, isWebMCPAvailable } from '../src/tools/webmcp.js';

describe('isWebMCPAvailable', () => {
  it('is false when neither document.modelContext nor navigator.modelContext exist', () => {
    expect(isWebMCPAvailable()).toBe(false);
  });

  it('is true when document.modelContext.registerTool exists', () => {
    (globalThis.document as { modelContext?: unknown }).modelContext = {
      registerTool: vi.fn(),
    };
    expect(isWebMCPAvailable()).toBe(true);
  });

  it('is true when only navigator.modelContext.registerTool exists (pre-Chrome-150 fallback)', () => {
    (globalThis.navigator as { modelContext?: unknown }).modelContext = {
      registerTool: vi.fn(),
    };
    expect(isWebMCPAvailable()).toBe(true);
  });
});

describe('exposeToolsToPage', () => {
  it('no-ops when WebMCP is unavailable', () => {
    const cleanup = exposeToolsToPage([
      defineTool({
        name: 'noop',
        description: 'does nothing',
        inputSchema: {},
        execute: () => undefined,
      }),
    ]);

    expect(() => cleanup()).not.toThrow();
  });

  it('registers every tool on document.modelContext and returns a cleanup function that unregisters them', () => {
    const unregister = vi.fn();
    const registerTool = vi.fn(() => unregister);

    (globalThis.document as { modelContext?: unknown }).modelContext = { registerTool };

    const tool = defineTool({
      name: 'getPrice',
      description: 'Returns the price.',
      inputSchema: {},
      execute: () => 42,
    });
    const cleanup = exposeToolsToPage([tool]);

    expect(registerTool).toHaveBeenCalledWith(tool);
    cleanup();
    expect(unregister).toHaveBeenCalledTimes(1);
  });

  it('falls back to navigator.modelContext when document.modelContext is unavailable', () => {
    const unregister = vi.fn();
    const registerTool = vi.fn(() => unregister);

    (globalThis.navigator as { modelContext?: unknown }).modelContext = { registerTool };

    const tool = defineTool({
      name: 'getPrice',
      description: 'Returns the price.',
      inputSchema: {},
      execute: () => 42,
    });
    const cleanup = exposeToolsToPage([tool]);

    expect(registerTool).toHaveBeenCalledWith(tool);
    cleanup();
    expect(unregister).toHaveBeenCalledTimes(1);
  });

  it('prefers document.modelContext over navigator.modelContext when both exist', () => {
    const documentRegisterTool = vi.fn(() => () => {});
    const navigatorRegisterTool = vi.fn(() => () => {});

    (globalThis.document as { modelContext?: unknown }).modelContext = {
      registerTool: documentRegisterTool,
    };
    (globalThis.navigator as { modelContext?: unknown }).modelContext = {
      registerTool: navigatorRegisterTool,
    };

    const tool = defineTool({
      name: 'getPrice',
      description: 'Returns the price.',
      inputSchema: {},
      execute: () => 42,
    });

    exposeToolsToPage([tool]);

    expect(documentRegisterTool).toHaveBeenCalledWith(tool);
    expect(navigatorRegisterTool).not.toHaveBeenCalled();
  });
});
