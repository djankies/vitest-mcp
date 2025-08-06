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
      exclude: ['node_modules/', 'dist/', 'coverage/', '**/*.test.ts', '**/*.spec.ts']
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
  threshold: 80,  // optional
  includeDetails: true,  // optional
  format: "detailed"  // optional
})
```

## Best Practices

- Use specific paths rather than entire projects
- Start with `list_tests` to understand test structure
- Use `format: "summary"` for pass/fail counts, `format: "detailed"` for failure analysis
- Set realistic coverage thresholds (start with 70%)

## Troubleshooting

- "Coverage provider not found" → Install @vitest/coverage-v8
- "No test files found" → Check path and pattern parameters
- "Threshold violations" → Lower thresholds or add more tests
- Timeout errors → Increase timeout parameter
