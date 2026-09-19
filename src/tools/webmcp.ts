import type { ModelContextRegistry } from '../types/chrome-ai.js';
import type { Tool } from '../types.js';

/**
 * The WebMCP spec moved its tool registry from `navigator.modelContext` to
 * `document.modelContext` in the 2026-07-21 draft (Chrome 150 deprecates the old
 * location). Prefer `document.modelContext` and fall back to `navigator.modelContext`
 * for older Chrome builds still on the origin trial's original shape.
 */
function getModelContextRegistry(): ModelContextRegistry | undefined {
  if (
    typeof document !== 'undefined' &&
    typeof document.modelContext?.registerTool === 'function'
  ) {
    return document.modelContext;
  }

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.modelContext?.registerTool === 'function'
  ) {
    return navigator.modelContext;
  }

  return undefined;
}

/**
 * `true` when the page's browser exposes the experimental WebMCP tool registry
 * (`document.modelContext`, or `navigator.modelContext` on older Chrome builds), which
 * lets the browser's own on-page AI agent -- not just sessions created by this library
 * -- discover and call the site's tools.
 */
export function isWebMCPAvailable(): boolean {
  return getModelContextRegistry() !== undefined;
}

/**
 * Registers tools on `document.modelContext` (falling back to `navigator.modelContext`)
 * when the browser supports WebMCP. No-ops otherwise. Returns a cleanup function that
 * unregisters everything.
 */
export function exposeToolsToPage(tools: Tool[]): () => void {
  const registry = getModelContextRegistry();

  if (!registry || tools.length === 0) {
    return () => {};
  }

  const unregisterFns = tools.map((tool) => registry.registerTool(tool));

  return () => {
    for (const unregister of unregisterFns) {
      unregister();
    }
  };
}
