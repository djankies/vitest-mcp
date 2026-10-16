/**
 * Example MCP-specific Vitest configuration
 *
 * Copy this file to `vitest.mcp.config.ts` in your project root to use
 * MCP-specific settings that won't interfere with your regular development workflow.
 *
 * When this file exists, the Vitest MCP server passes it to Vitest with --config
 * instead of letting Vitest pick up vitest.config.ts or vite.config.ts.
 *
 * You do not need to configure reporters, coverage output or console capture:
 * the server sets those on the command line for every run.
 */
import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      coverage: {
        provider: 'v8',

        /*
         * Providing thresholds in the config will cause the `analyze_coverage` tool
         * to report on them. See README for more details.
         */
        thresholds: {
          lines: 80,
          functions: 80,
          branches: 75,
          statements: 80,
        },
      },

      // AI-driven runs are often slower to settle than local ones
      testTimeout: 30000,
    },
  })
);
