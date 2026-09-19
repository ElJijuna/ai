import type { Tool } from '../types.js';
import { defineTool } from './defineTool.js';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet?: string;
}

export interface WebSearchToolOptions {
  /**
   * Fetches results for a query from whichever search API/provider you plug in
   * (Google Custom Search, Bing, Brave, Tavily, your own index, ...). Chrome's
   * on-device model has no network access of its own, so this is the only way a
   * chat built on this library can answer questions about anything after its
   * training cutoff or outside its knowledge.
   */
  search: (query: string) => Promise<WebSearchResult[]>;
  /** Overrides the tool's name as seen by the model. */
  name?: string;
  /** Overrides the tool's description as seen by the model. */
  description?: string;
  /** Caps how many results are handed back to the model. Defaults to 5. */
  maxResults?: number;
}

/**
 * Wraps a search API call into a ready-to-register {@link Tool} for real-time,
 * on-demand web search from a chat `Agent` — removes the `inputSchema`/`execute`
 * boilerplate `defineTool` would otherwise need for this common case.
 *
 * @example
 * ```ts
 * const webSearch = defineWebSearchTool({
 *   async search(query) {
 *     const res = await fetch(`https://api.example.com/search?q=${encodeURIComponent(query)}`);
 *     const { results } = await res.json();
 *     return results.map((r) => ({ title: r.title, url: r.url, snippet: r.snippet }));
 *   },
 * });
 *
 * ai.registerTool(webSearch);
 * ```
 */
export function defineWebSearchTool(
  options: WebSearchToolOptions,
): Tool<{ query: string }, { results: WebSearchResult[] }> {
  const {
    search,
    maxResults = 5,
    name = 'searchTheWeb',
    description = "Searches the public web for current information the model doesn't already " +
      'know or can no longer be sure of — current events, prices, availability, recent releases, ' +
      'or anything that may have changed since training. Returns a short list of results, each ' +
      'with a title, url, and snippet.',
  } = options;

  return defineTool({
    name,
    description,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for.' },
      },
      required: ['query'],
    },
    async execute({ query }) {
      const results = await search(query);

      return { results: results.slice(0, maxResults) };
    },
  });
}
