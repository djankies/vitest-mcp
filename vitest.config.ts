import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Support both node and browser environments
    environment: 'node',
    environmentMatchGlobs: [
      ['**/browser/**', 'jsdom']
    ],
    // Exclude test-validation directory from npm test runs
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/test-validation/**'
    ],
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