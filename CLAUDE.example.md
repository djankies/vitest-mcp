ALWAYS use the vitest-mcp tools to run tests and analyze coverage.
DO NOT use raw vitest commands.

```javascript
// Required first, only once per session - absolute path
set_project_root({ path: "/Users/username/Projects/this-project" })

// Then use with relative paths
run_tests({ target: "./src/components" })
analyze_coverage({ target: "./src", threshold: 80 })
list_tests({ path: "./src" })
```

Note: Must set project root before any other Vitest tool.