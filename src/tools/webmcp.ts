import type { Tool } from '../types.js';

/**
 * `true` when the page's browser exposes the experimental WebMCP tool registry
 * (`navigator.modelContext`), which lets the browser's own on-page AI agent -- not
 * just sessions created by this library -- discover and call the site's tools.
 */
export function isWebMCPAvailable(): boolean {
  return (
    typeof navigator !== 'undefined' && typeof navigator.modelContext?.registerTool === 'function'
  );
}

/**
 * Registers tools on `navigator.modelContext` when the browser supports WebMCP.
 * No-ops otherwise. Returns a cleanup function that unregisters everything.
 */
export function exposeToolsToPage(tools: Tool[]): () => void {
  if (!isWebMCPAvailable() || tools.length === 0) {
    return () => {};
  }

  const registry = navigator.modelContext;

  if (!registry) {
    return () => {};
  }

  const unregisterFns = tools.map((tool) => registry.registerTool(tool));

  return () => {
    for (const unregister of unregisterFns) {
      unregister();
    }
  };
}
