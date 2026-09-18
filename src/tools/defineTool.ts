import type { Tool } from '../types.js';

/**
 * Identity helper that gives TypeScript a place to infer a tool's `Args`/`Result`
 * generics from its `execute` implementation, so callers get typed arguments
 * without repeating the generics by hand.
 *
 * @example
 * ```ts
 * const getCartTotal = defineTool({
 *   name: 'getCartTotal',
 *   description: "Returns the current shopping cart's total in cents.",
 *   inputSchema: { type: 'object', properties: {} },
 *   execute: () => ({ totalCents: cart.total }),
 * });
 * ```
 */
export function defineTool<Args, Result>(tool: Tool<Args, Result>): Tool<Args, Result> {
  return tool;
}
