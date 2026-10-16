import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: { CONFIG_SOURCE: 'vitest.config.ts' },
  },
});
