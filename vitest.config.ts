import vitestConfig from 'super-configs/vitest';
import { mergeConfig } from 'vitest/config';

export default mergeConfig(vitestConfig, {
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      include: ['src/**/*.ts'],
      // Pure structural/type-only and ambient-declaration modules: erased by
      // `import type` / `declare global`, never loaded at runtime, so there's no
      // executable code here for a test to cover.
      exclude: ['src/types.ts', 'src/types/chrome-ai.ts', 'src/global.d.ts'],
    },
  },
});
