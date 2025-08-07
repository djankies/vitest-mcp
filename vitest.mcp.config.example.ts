/**
 * Example MCP-specific Vitest configuration
 * 
 * Copy this file to `vitest.mcp.config.ts` in your project root to use
 * MCP-specific settings that won't interfere with your regular development workflow.
 * 
 * This configuration will be used by the Vitest MCP server when running tests,
 * taking precedence over vitest.config.ts or vite.config.ts.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // JSON reporter required for AI parsing
    reporters: ['json'],
    
    // Required for coverage analysis
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['json', 'html'],
      reportsDirectory: './coverage-mcp',
      
      /*
      * Providing thresholds in the config will cause the `analyze_coverage` tool 
      * to report on them. See README for more config priority details.
      */
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
    
    // Disable console output interception for cleaner logs
    disableConsoleIntercept: true,

    testTimeout: 30000,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/coverage-mcp/**',
      '**/*.config.*',
      '**/test-fixtures/**',
    ],
  },
});