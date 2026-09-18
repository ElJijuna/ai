import vitestConfig from 'super-configs/vitest';
import { mergeConfig } from 'vitest/config';

export default mergeConfig(vitestConfig, {
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
});
