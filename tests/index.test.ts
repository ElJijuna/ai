import { describe, expect, it } from 'vitest';
import * as pkg from '../src/index.js';

describe('package entry point', () => {
  it('re-exports every documented default action, including streaming variants', () => {
    expect(pkg.summarize).toBeTypeOf('function');
    expect(pkg.summarizeStream).toBeTypeOf('function');
    expect(pkg.write).toBeTypeOf('function');
    expect(pkg.writeStream).toBeTypeOf('function');
    expect(pkg.rewrite).toBeTypeOf('function');
    expect(pkg.rewriteStream).toBeTypeOf('function');
    expect(pkg.translate).toBeTypeOf('function');
    expect(pkg.translateStream).toBeTypeOf('function');
    expect(pkg.isTranslationAvailable).toBeTypeOf('function');
    expect(pkg.detectLanguage).toBeTypeOf('function');
    expect(pkg.proofread).toBeTypeOf('function');
  });

  it('re-exports the core classes and orchestration helpers', () => {
    expect(pkg.AIOrchestrator).toBeTypeOf('function');
    expect(pkg.Agent).toBeTypeOf('function');
    expect(pkg.WebContext).toBeTypeOf('function');
    expect(pkg.captureDocumentContext).toBeTypeOf('function');
    expect(pkg.checkAvailability).toBeTypeOf('function');
    expect(pkg.checkAllAvailability).toBeTypeOf('function');
    expect(pkg.isReady).toBeTypeOf('function');
  });

  it('re-exports the tools and error classes', () => {
    expect(pkg.defineTool).toBeTypeOf('function');
    expect(pkg.defineWebSearchTool).toBeTypeOf('function');
    expect(pkg.exposeToolsToPage).toBeTypeOf('function');
    expect(pkg.isWebMCPAvailable).toBeTypeOf('function');
    expect(pkg.AILibError).toBeTypeOf('function');
    expect(pkg.AIFeatureNotSupportedError).toBeTypeOf('function');
    expect(pkg.AIFeatureUnavailableError).toBeTypeOf('function');
  });
});
