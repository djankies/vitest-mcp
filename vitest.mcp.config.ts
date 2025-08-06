import { defineConfig } from 'vitest/config';

// Separate vitest configuration for vitest-local MCP tools
// This config allows access to all tests including test-validation directory
export default defineConfig({
  test: {
    // Support both node and browser environments
    environment: 'node',
    environmentMatchGlobs: [
      ['**/browser/**', 'jsdom']
    ],
    // No exclusions - MCP tools should access all tests
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'dist/',
        'coverage/',
        '**/*.test.ts',
        '**/*.spec.ts'
      ]
    }
  },
});
