# Vitest MCP Server

AI-optimized Vitest interface with structured output, visual debugging, and intelligent coverage analysis.

## Why Use This?

Raw Vitest output is verbose and difficult for AI to parse. This MCP server provides:

- **Structured JSON output** optimized for AI consumption
- **Smart targeting** to prevent accidental full test suite runs
- **Console log capture** to debug test failures
- **Coverage gap analysis** with line-by-line insights

## Key Features

- **Smart Test Execution** with structured output
- **Console Log Capture** for debugging (`showLogs` parameter)
- **Coverage Analysis** with gap insights
- **Multi-Repository Support** in single session
- **Safety Guards** prevent full project runs

## Quick Start

### 1. Add to Claude Desktop

Add this to your Claude Desktop configuration:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "vitest": {
      "command": "npx",
      "args": ["-y", "@djankies/vitest-mcp"]
    }
  }
}
```

### 2. Restart Claude Desktop

### 3. Use It

Try asking:

- "Run the tests for this component"
- "Debug this test file"
- "Analyze the coverage for this file"

Or prepend you message with `vitest-mcp:`, to ensure the tools are used:

- "vitest-mcp: run tests for this component"
- "vitest-mcp: debug this test file"
- "vitest-mcp: analyze coverage for this file"

## Requirements

- **Node.js**: 18+
- **Vitest**: 0.34.0+
- **Coverage**: `@vitest/coverage-v8` (for coverage analysis)

```bash
npm install --save-dev vitest@latest @vitest/coverage-v8@latest
```

## Tools

### `set_project_root`

**Required first** - Set the project root for all operations.

```javascript
set_project_root({ 
  path: "/Users/username/Projects/my-app" 
})
```

> 🚨 IMPORTANT: Must set project root before any other Vitest tools are used.

### `list_tests`

List test files in your project.

```javascript
list_tests({ directory: "./src" })
```

### `run_tests`

Execute tests with structured output.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `target` | string | Yes | File or directory to test |
| `format` | string | No | Output format: "summary" or "detailed" (auto-detects based on results) |
| `showLogs` | boolean | No | Include console output with `[stdout]` or `[stderr]` prefixes |
| `project` | string | No | Vitest project name for monorepos |

### `analyze_coverage`

Analyze test coverage with gap insights.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `target` | string | Yes | File or directory to analyze coverage for |
| `threshold` | number | No | Minimum coverage percentage (default: 80) |
| `format` | string | No | Output format: "summary" or "detailed" |
| `includeDetails` | boolean | No | Include line-by-line coverage analysis |
| `exclude` | string[] | No | Patterns to exclude from coverage (e.g., ["**/*.stories.*"]) |
| `thresholds` | object | No | Custom thresholds for lines, functions, branches, statements |

Automatically excludes test utilities, mocks, stories, and e2e files.

## Multi-Repository Support

```javascript
// Project A
set_project_root({ path: "/path/to/frontend" })
run_tests({ target: "./src" })

// Project B
set_project_root({ path: "/path/to/backend" })
run_tests({ target: "./src" })
```

## Claude Code Hook (Optional)

Automatically redirect Vitest commands to MCP tools:

```bash
# Download hook
curl -o .claude/vitest-hook.sh https://raw.githubusercontent.com/djankies/vitest-mcp/main/hooks/vitest-hook.sh
chmod +x .claude/vitest-hook.sh
```

Add to `.claude/settings.local.json`:

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash",
      "hooks": [{ "type": "command", "command": ".claude/vitest-hook.sh" }]
    }]
  }
}
```

Bypass with: `vitest --bypass-hook`

## LLM instructions

Encourage claude or your ide to use the tools correctly: [CLAUDE.example.md](./CLAUDE.example.md)

## Configuration

### Coverage Thresholds

Set coverage thresholds via command-line flags when starting the server:

```bash
# Set overall threshold for all metrics
npx @djankies/vitest-mcp --threshold 80

# Set specific metric thresholds
npx @djankies/vitest-mcp \
  --coverage-threshold-lines 90 \
  --coverage-threshold-branches 80 \
  --coverage-threshold-functions 85 \
  --coverage-threshold-statements 90
```

Or in Claude Desktop config:

```json
{
  "mcpServers": {
    "vitest": {
      "command": "npx",
      "args": [
        "-y", 
        "@djankies/vitest-mcp",
        "--coverage-threshold-lines", "90",
        "--coverage-threshold-branches", "80"
      ]
    }
  }
}
```

### Configuration File

Optional `.vitest-mcp.json` in home or project directory:

```json
{
  "safety": {
    "allowedPaths": ["/Users/username/Projects"]
  },
  "testDefaults": {
    "format": "detailed",
    "timeout": 60000
  },
  "coverageDefaults": {
    "threshold": 80,
    "thresholds": {
      "lines": 90,
      "branches": 80,
      "functions": 85,
      "statements": 90
    }
  }
}
```

### Priority Order

Configuration is merged in the following order (highest priority first):

1. Command-line flags
2. Environment variables
3. Configuration file
4. Built-in defaults

## Troubleshooting

**"Project root has not been set"** - Call `set_project_root` first

**"Vitest not found"** - Install: `npm install --save-dev vitest@latest`

**"Coverage provider not found"** - Install: `npm install --save-dev @vitest/coverage-v8@latest`

**Hook issues** - Bypass with: `vitest --bypass-hook`

## License

MIT
