// super-configs ships this as a plain untyped JS config file.
declare module 'super-configs/vitest' {
  import type { UserConfig } from 'vitest/config';

  const config: UserConfig;

  export default config;
}
