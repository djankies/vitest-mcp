import { defineConfig } from 'vitest/config';

// Mirrors the layout from issue #44: sources in ./src, tests in ./test,
// split into named projects, with a custom reports directory and thresholds.
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: 'reports/coverage',
      thresholds: {
        lines: 85,
        perFile: true,
      },
    },
    projects: [
      {
        test: {
          name: 'unit',
          include: ['./test/unit/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'e2e',
          include: ['./test/e2e/**/*.test.ts'],
        },
      },
    ],
  },
});
