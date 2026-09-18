import { mergeConfig } from 'vitest/config';
import vitestConfig from 'super-configs/vitest';

export default mergeConfig(vitestConfig, {
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
});
