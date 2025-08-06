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
    // Use JSON reporter for better AI parsing
    reporters: ['json'],
    
    // Enable coverage by default for MCP runs
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['json', 'html'],
      reportsDirectory: './coverage-mcp',
      
      // MCP-specific coverage thresholds
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
    
    // Disable console output interception for cleaner logs
    disableConsoleIntercept: true,
    
    // Set timeout for MCP runs
    testTimeout: 30000,
    
    // Exclude additional patterns for MCP runs
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