import type { ScopeConfig } from '../types.js';

const DEFAULT_REFUSAL =
  'If the user asks about something unrelated to this site, briefly say you can only help with topics related to this site.';

/**
 * Builds the system prompt for an {@link Agent}: the site-scope guard (requirement
 * for the assistant to stay on-topic for the site it runs on), any custom
 * instructions, and the current page context, in that order.
 */
export function buildSystemPrompt(options: {
  scope?: ScopeConfig;
  instructions?: string;
  contextText?: string;
}): string {
  const { scope, instructions, contextText } = options;
  const parts = [buildScopeInstruction(scope), instructions, contextText].filter(
    (part): part is string => Boolean(part),
  );

  return parts.join('\n\n');
}

function buildScopeInstruction(scope?: ScopeConfig): string {
  const mode = scope?.mode ?? 'guided';

  if (mode === 'off') {
    return '';
  }

  const site = scope?.site ?? (typeof location !== 'undefined' ? location.hostname : 'this site');
  const description = scope?.description ? ` ${scope.description}` : '';
  const allowed = scope?.allowedTopics?.length
    ? ` Focus on: ${scope.allowedTopics.join(', ')}.`
    : '';
  const disallowed = scope?.disallowedTopics?.length
    ? ` Avoid discussing: ${scope.disallowedTopics.join(', ')}.`
    : '';
  const refusal = scope?.refusalMessage ?? DEFAULT_REFUSAL;
  const strictness =
    mode === 'strict'
      ? `You must only answer questions directly related to "${site}".${description} Refuse anything else, even if you know the answer.`
      : `You are the assistant for "${site}".${description} Prefer answering questions related to this site.`;

  return [strictness, allowed, disallowed, refusal].filter(Boolean).join(' ');
}
