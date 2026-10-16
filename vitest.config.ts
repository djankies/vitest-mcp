import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // compat/ and test-validation/ hold fixture projects that are run by
    // `npm run test:compat` and the MCP tools themselves, not by this suite.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'compat/**',
      'test-validation/**'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**'],
      exclude: [
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/__tests__/**'
      ]
    }
  },
});
