import { describe, expect, it, vi } from 'vitest';
import { defineWebSearchTool } from '../src/tools/webSearch.js';

describe('defineWebSearchTool', () => {
  it('builds a tool with sensible defaults', () => {
    const tool = defineWebSearchTool({ search: vi.fn() });

    expect(tool.name).toBe('searchTheWeb');
    expect(tool.description).toContain('Searches the public web');
    expect(tool.inputSchema).toEqual({
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for.' },
      },
      required: ['query'],
    });
  });

  it('allows overriding the name and description', () => {
    const tool = defineWebSearchTool({
      search: vi.fn(),
      name: 'lookUp',
      description: 'Custom description.',
    });

    expect(tool.name).toBe('lookUp');
    expect(tool.description).toBe('Custom description.');
  });

  it('delegates to the provided search function and returns its results', async () => {
    const results = [{ title: 'A', url: 'https://a.example' }];
    const search = vi.fn(() => Promise.resolve(results));
    const tool = defineWebSearchTool({ search });
    const result = await tool.execute({ query: 'camera lenses' });

    expect(search).toHaveBeenCalledWith('camera lenses');
    expect(result).toEqual({ results });
  });

  it('caps results at maxResults', async () => {
    const results = [
      { title: 'A', url: 'https://a.example' },
      { title: 'B', url: 'https://b.example' },
      { title: 'C', url: 'https://c.example' },
    ];
    const tool = defineWebSearchTool({ search: () => Promise.resolve(results), maxResults: 2 });
    const result = await tool.execute({ query: 'anything' });

    expect(result.results).toHaveLength(2);
    expect(result.results).toEqual(results.slice(0, 2));
  });
});
