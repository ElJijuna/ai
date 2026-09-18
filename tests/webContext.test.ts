import { describe, expect, it, vi } from 'vitest';
import { WebContext } from '../src/context/WebContext.js';

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
});
