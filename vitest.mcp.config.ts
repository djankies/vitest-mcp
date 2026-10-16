import { defineConfig } from 'vitest/config';

// Configuration used when the MCP tools run against this repository in dev mode
// (VITEST_MCP_DEV_MODE=true). Unlike vitest.config.ts it includes test-validation/.
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      exclude: [
        '**/*.test.ts',
        '**/*.spec.ts'
      ]
    },
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts', 'test-validation/**/*.{test,spec}.ts'],
          exclude: ['test-validation/browser/**', '**/node_modules/**'],
        },
      },
      {
        test: {
          name: 'browser',
          environment: 'jsdom',
          include: ['test-validation/browser/**/*.test.ts'],
        },
      },
    ],
  },
});
