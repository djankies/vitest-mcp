# Vitest MCP Usage Guide

This MCP server provides tools for interacting with Vitest, a JavaScript/TypeScript testing framework.

## Setup Requirements

### Coverage Setup

```bash
npm install --save-dev @vitest/coverage-v8
```

Supported: Vitest 3.x, 4.x and 5.x, with the coverage provider on the same major version.

Optionally add thresholds to vitest.config.ts:

```typescript
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
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
  path: "./src"  // optional, defaults to the project root
})
```

### run_tests

```javascript
run_tests({
  target: "./src/components",  // required
  format: "detailed",  // optional: "summary" or "detailed"
  project: "client",  // optional: Vitest project name
  showLogs: true  // optional: include console output
})
```

### analyze_coverage

```javascript
analyze_coverage({
  target: "./src/components",  // required: source files, not tests
  format: "detailed",  // optional - "detailed" includes line-by-line coverage
  project: "unit"  // optional: only use tests from this Vitest project
})
```

Coverage is measured by running every test that imports the target, wherever the tests live.

> **Note**: Coverage thresholds should be configured in your `vitest.config.ts` file; there is no `threshold` parameter.

## Best Practices

- Use specific paths rather than entire projects
- Start with `list_tests` to understand test structure
- Use `format: "summary"` for pass/fail counts, `format: "detailed"` for failure analysis
- Configure coverage thresholds in `vitest.config.ts` for consistency across all environments

## Troubleshooting

- "Coverage provider not found" → Install @vitest/coverage-v8
- "No test files found" → Check the path parameter
- "No tests import ..." → No test imports the target; its coverage is 0%
- "Threshold violations" → Configure thresholds in `vitest.config.ts` or add more tests
- Timeout errors → Use a narrower target or raise `testDefaults.timeout` in `.vitest-mcp.json`
