import type { PageContext } from '../types.js';

export type ContextListener = (context: Readonly<PageContext>) => void;

/**
 * Holds the structured context an {@link Agent} or {@link AIOrchestrator} shares
 * with the model, and notifies listeners whenever it changes so live sessions can
 * pick up the update on their next turn.
 */
export class WebContext {
  #data: PageContext;
  #listeners = new Set<ContextListener>();

  constructor(initial: PageContext = {}) {
    this.#data = { ...initial };
  }

  get value(): Readonly<PageContext> {
    return this.#data;
  }

  /** Replaces the context entirely. */
  set(context: PageContext): void {
    this.#data = { ...context };
    this.#emit();
  }

  /** Shallow-merges `patch` into the existing context. */
  update(patch: Partial<PageContext>): void {
    this.#data = { ...this.#data, ...patch };
    this.#emit();
  }

  /** Subscribes to changes. Returns an unsubscribe function. */
  onChange(listener: ContextListener): () => void {
    this.#listeners.add(listener);

    return () => this.#listeners.delete(listener);
  }

  /** Serializes the context into a block of text suitable for a system prompt. */
  toPromptText(): string {
    const entries = Object.entries(this.#data).filter(
      ([, value]) => value !== undefined && value !== null && value !== '',
    );

    if (entries.length === 0) {
      return '';
    }

    const lines = entries.map(([key, value]) => `- ${key}: ${formatValue(value)}`);

    return `Current page context:\n${lines.join('\n')}`;
  }

  #emit(): void {
    for (const listener of this.#listeners) {
      listener(this.#data);
    }
  }
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Captures a lightweight snapshot of the current page (URL, title, meta description,
 * and any active text selection) as a starting {@link PageContext}.
 *
 * This only reads a handful of obviously-public fields; it never scrapes full page
 * content, since that context is sent to a model and may be logged by the app.
 */
export function captureDocumentContext(): PageContext {
  if (typeof document === 'undefined') {
    return {};
  }

  const description =
    document.querySelector('meta[name="description"]')?.getAttribute('content') ?? undefined;
  const selection = typeof window !== 'undefined' ? window.getSelection?.()?.toString() : undefined;

  return {
    url: typeof location !== 'undefined' ? location.href : undefined,
    title: document.title || undefined,
    description,
    selection: selection || undefined,
  };
}
