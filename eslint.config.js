import { createEslintConfig } from 'super-configs/eslint';

export default createEslintConfig({
  runtime: 'browser',
  language: 'ts',
  typeChecked: true,
  testFramework: 'vitest',
  ignores: ['dist/**', 'coverage/**', 'docs/**'],
});
