# Storybook Integration Issues with Coverage Analysis

## Problem Description

When running coverage analysis on projects that include Storybook, you may encounter errors like:

```
TypeError: Cannot create property 'exclude' on boolean 'true'
    at chromatic/dist/chunk-VWVWVLKU.js
```

This error occurs because Storybook/Chromatic configuration files are being loaded during Vitest execution, even when we try to exclude them.

## Root Cause

The issue stems from a configuration conflict where:
1. The project's `vitest.config.ts` or `vite.config.ts` may have a `test` property set to a boolean value
2. Storybook's configuration tries to modify this `test` property assuming it's an object
3. This creates the "Cannot create property 'exclude' on boolean 'true'" error

## Solutions

### Solution 1: Use Project-Specific Vitest Config (Recommended)

Create a separate minimal Vitest config for coverage analysis that doesn't load Storybook configuration:

1. Create a file `vitest.coverage.config.ts` in your project root:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['json'],
      exclude: [
        '**/*.stories.*',
        '**/*.story.*',
        '**/.storybook/**',
        '**/storybook-static/**',
        '**/e2e/**',
        '**/*.e2e.*',
        '**/test-utils/**',
        '**/mocks/**',
        '**/__mocks__/**'
      ]
    },
    exclude: [
      '**/*.stories.*',
      '**/*.story.*',
      '**/.storybook/**',
      '**/storybook-static/**',
      '**/e2e/**',
      '**/*.e2e.*'
    ]
  }
});
```

2. Then run coverage with this config:

```bash
npx vitest run --coverage --config vitest.coverage.config.ts
```

### Solution 2: Fix Your Main Vitest Config

If your `vitest.config.ts` has `test: true` or `test: false`, change it to an object:

```typescript
// ❌ Wrong - causes the error
export default defineConfig({
  test: true
});

// ✅ Correct
export default defineConfig({
  test: {
    // your test configuration
  }
});
```

### Solution 3: Use Workspace Configuration

Create a `vitest.workspace.ts` to separate Storybook tests from regular tests:

```typescript
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'unit',
      include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}'],
      exclude: ['**/*.stories.*', '**/.storybook/**']
    }
  },
  {
    test: {
      name: 'storybook',
      include: ['**/*.stories.{js,ts,jsx,tsx}'],
      // Storybook-specific configuration
    }
  }
]);
```

### Solution 4: Manual Exclusion via MCP

If the above solutions don't work, you can manually specify exclusions when using the vitest-mcp tool:

```javascript
analyze_coverage({
  target: "./src",
  exclude: [
    "**/*.stories.*",
    "**/*.story.*",
    "**/.storybook/**",
    "**/storybook-static/**",
    "**/@chromatic-com/**",
    "**/chromatic/**"
  ]
})
```

## Prevention

To prevent this issue in future projects:

1. Keep Storybook and Vitest configurations separate
2. Use workspace configurations for complex projects
3. Ensure your `test` configuration is always an object, not a boolean
4. Consider using different config files for different test scenarios

## Related Issues

- [Vitest Issue #3848](https://github.com/vitest-dev/vitest/issues/3848) - Similar configuration type errors
- [Storybook Issue #17326](https://github.com/storybookjs/storybook/issues/17326) - Vitest support in Storybook

## Workaround for vitest-mcp Users

If you're experiencing this issue and none of the above solutions work, you can:

1. Temporarily rename or move your `.storybook` directory before running coverage
2. Use a separate repository or branch for Storybook tests
3. Run coverage on specific directories that don't contain Storybook files

We're working on a more robust solution that will completely isolate the coverage analysis from any project configuration conflicts.