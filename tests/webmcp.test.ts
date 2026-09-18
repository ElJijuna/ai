import { describe, expect, it, vi } from 'vitest';
import { defineTool } from '../src/tools/defineTool.js';
import { exposeToolsToPage, isWebMCPAvailable } from '../src/tools/webmcp.js';

describe('isWebMCPAvailable', () => {
  it('is false when navigator.modelContext is missing', () => {
    expect(isWebMCPAvailable()).toBe(false);
  });

  it('is true when navigator.modelContext.registerTool exists', () => {
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

  it('registers every tool and returns a cleanup function that unregisters them', () => {
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
});
