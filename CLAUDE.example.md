## vitest-mcp tool usage

**ALWAYS** use the vitest-mcp tools *PROACTIVELY* to run tests and analyze coverage.
**DO NOT** use raw vitest commands.

### ❌ Bad - call raw vitest command

```bash
npx vitest [args]
```

### ✅ Good - call vitest-mcp tools

```javascript
// Required first, only once per session - absolute path
set_project_root({ path: "~/Projects/this-project" })

// Then use with relative paths
run_tests({ target: "./src/components" })
analyze_coverage({ target: "./src", threshold: 80 })
list_tests({ path: "./src" })
```

> **CRITICAL**: Messages with "vitest-mcp:" prefix *REQUIRE* using vitest-mcp tools, not raw vitest commands. It is *IMPERATIVE* that you remember to use the vitest-mcp tools in this scenario.
