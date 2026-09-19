import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureDocumentContext, WebContext } from '../src/context/WebContext.js';

describe('WebContext', () => {
  it('starts with the provided initial context', () => {
    const context = new WebContext({ title: 'Home' });

    expect(context.value).toEqual({ title: 'Home' });
  });

  it('replaces the context on set()', () => {
    const context = new WebContext({ title: 'Home' });

    context.set({ title: 'Pricing' });
    expect(context.value).toEqual({ title: 'Pricing' });
  });

  it('shallow-merges patches on update()', () => {
    const context = new WebContext({ title: 'Home', url: '/' });

    context.update({ url: '/pricing' });
    expect(context.value).toEqual({ title: 'Home', url: '/pricing' });
  });

  it('notifies listeners on change and supports unsubscribing', () => {
    const context = new WebContext();
    const listener = vi.fn();
    const unsubscribe = context.onChange(listener);

    context.update({ title: 'Home' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ title: 'Home' });

    unsubscribe();
    context.update({ title: 'Pricing' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('serializes populated context to prompt text, skipping empty values', () => {
    const context = new WebContext({ title: 'Home', empty: '', missing: undefined });

    expect(context.toPromptText()).toBe('Current page context:\n- title: Home');
  });

  it('serializes to an empty string when there is nothing to show', () => {
    const context = new WebContext({ empty: '', missing: undefined });

    expect(context.toPromptText()).toBe('');
  });

  it('serializes non-string values with JSON.stringify', () => {
    const context = new WebContext({ cartTotal: 42, tags: ['a', 'b'] });

    expect(context.toPromptText()).toBe(
      'Current page context:\n- cartTotal: 42\n- tags: ["a","b"]',
    );
  });

  it('falls back to String(value) when JSON.stringify cannot serialize it (e.g. a BigInt)', () => {
    const context = new WebContext({ big: 10n });

    expect(context.toPromptText()).toBe('Current page context:\n- big: 10');
  });
});

describe('captureDocumentContext', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.title = '';

    for (const meta of document.querySelectorAll('meta[name="description"]')) {
      meta.remove();
    }
  });

  it('returns {} when document is unavailable', () => {
    vi.stubGlobal('document', undefined);

    expect(captureDocumentContext()).toEqual({});
  });

  it('captures url, title, meta description, and selection when present', () => {
    document.title = 'Pricing — Example Shop';
    const meta = document.createElement('meta');

    meta.setAttribute('name', 'description');
    meta.setAttribute('content', 'Plans and pricing for Example Shop.');
    document.head.appendChild(meta);

    vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => 'selected text',
    } as unknown as Selection);

    const context = captureDocumentContext();

    expect(context.title).toBe('Pricing — Example Shop');
    expect(context.description).toBe('Plans and pricing for Example Shop.');
    expect(context.selection).toBe('selected text');
    expect(context.url).toBe(location.href);
  });

  it('omits selection when window is unavailable', () => {
    document.title = 'Home';
    vi.stubGlobal('window', undefined);

    const context = captureDocumentContext();

    expect(context.selection).toBeUndefined();
    expect(context.title).toBe('Home');
  });

  it('omits title, description, and selection when they are empty', () => {
    document.title = '';

    vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => '',
    } as unknown as Selection);

    const context = captureDocumentContext();

    expect(context.title).toBeUndefined();
    expect(context.description).toBeUndefined();
    expect(context.selection).toBeUndefined();
  });
});
