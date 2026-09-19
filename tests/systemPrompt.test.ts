import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from '../src/orchestrator/systemPrompt.js';

describe('buildSystemPrompt', () => {
  it('builds a guided (default) on-topic instruction with the given site', () => {
    const prompt = buildSystemPrompt({ scope: { site: 'example.com' } });

    expect(prompt).toContain('You are the assistant for "example.com"');
    expect(prompt).toContain('Prefer answering questions related to this site.');
  });

  it('builds a strict refusal instruction in strict mode', () => {
    const prompt = buildSystemPrompt({ scope: { mode: 'strict', site: 'example.com' } });

    expect(prompt).toContain('You must only answer questions directly related to "example.com"');
    expect(prompt).toContain('Refuse anything else');
  });

  it('omits the scope guard entirely when mode is off', () => {
    const prompt = buildSystemPrompt({
      scope: { mode: 'off' },
      instructions: 'Be concise.',
    });

    expect(prompt).toBe('Be concise.');
  });

  it('includes allowed/disallowed topics and a custom refusal message', () => {
    const prompt = buildSystemPrompt({
      scope: {
        site: 'example.com',
        allowedTopics: ['pricing', 'shipping'],
        disallowedTopics: ['politics'],
        refusalMessage: 'Please ask about our products instead.',
      },
    });

    expect(prompt).toContain('Focus on: pricing, shipping.');
    expect(prompt).toContain('Avoid discussing: politics.');
    expect(prompt).toContain('Please ask about our products instead.');
  });

  it('falls back to location.hostname when no site is given', () => {
    const prompt = buildSystemPrompt({ scope: {} });

    expect(prompt).toContain(`You are the assistant for "${location.hostname}"`);
  });

  it('inlines the scope description right after the site name', () => {
    const prompt = buildSystemPrompt({
      scope: { site: 'example.com', description: 'an online camera shop' },
    });

    expect(prompt).toContain('You are the assistant for "example.com". an online camera shop');
  });

  it('appends custom instructions and context after the scope guard', () => {
    const prompt = buildSystemPrompt({
      scope: { site: 'example.com' },
      instructions: 'Always reply in Spanish.',
      contextText: 'Current page context:\n- title: Home',
    });
    const scopeIndex = prompt.indexOf('You are the assistant');
    const instructionsIndex = prompt.indexOf('Always reply in Spanish.');
    const contextIndex = prompt.indexOf('Current page context');

    expect(scopeIndex).toBeGreaterThanOrEqual(0);
    expect(instructionsIndex).toBeGreaterThan(scopeIndex);
    expect(contextIndex).toBeGreaterThan(instructionsIndex);
  });
});
