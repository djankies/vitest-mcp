# Vitest MCP Usage Guide

This MCP server provides tools for interacting with Vitest, a JavaScript/TypeScript testing framework.

## Setup Requirements

### Coverage Setup

```bash
npm install --save-dev @vitest/coverage-v8
```

Add to vitest.config.ts:

```typescript
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', 'coverage/', '**/*.test.ts', '**/*.spec.ts'],
      // Configure coverage thresholds here, not via MCP server
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      }
    }
  },
});
```

### Project Root Setup (Required First)

```javascript
set_project_root({ path: "/absolute/path/to/project" })
```

## Tools

### list_tests

```javascript
list_tests({ 
  directory: "./src",  // optional
  pattern: "**/*.spec.ts"  // optional
})
```

### run_tests

```javascript
run_tests({
  target: "./src/components",  // required
  format: "detailed"  // optional: "summary" or "detailed"
})
```

### analyze_coverage

```javascript
analyze_coverage({
  target: "./src/components",  // required
  includeDetails: true,  // optional
  format: "detailed"  // optional
})
```

> **Note**: Coverage thresholds should be configured in your `vitest.config.ts` file, not via the `threshold` parameter.

## Best Practices

- Use specific paths rather than entire projects
- Start with `list_tests` to understand test structure
- Use `format: "summary"` for pass/fail counts, `format: "detailed"` for failure analysis
- Configure coverage thresholds in `vitest.config.ts` for consistency across all environments

## Troubleshooting

- "Coverage provider not found" → Install @vitest/coverage-v8
- "No test files found" → Check path and pattern parameters
- "Threshold violations" → Configure thresholds in `vitest.config.ts` or add more tests
- Timeout errors → Increase timeout parameter
