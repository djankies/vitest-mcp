import { defineConfig } from 'vitest/config';

// When present, the MCP server must use this config instead of vitest.config.ts.
export default defineConfig({
  test: {
    env: { CONFIG_SOURCE: 'vitest.mcp.config.ts' },
  },
});
