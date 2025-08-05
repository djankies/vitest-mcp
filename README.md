# Vitest MCP Server

AI-optimized Vitest interface with structured output, visual debugging, and intelligent coverage analysis.

## Problem & Solution

### The Problem

When AI assistants help with testing, they typically run raw Vitest commands that produce:

- ❌ **Verbose terminal output** that's hard for AI to parse
- ❌ **Missing failure context** - no code snippets or visual indicators  
- ❌ **Accidental full test runs** when no target is specified
- ❌ **Basic coverage metrics** without actionable insights

### The Solution

This MCP server provides AI-optimized testing tools that deliver:

- ✅ **Structured JSON output** designed for AI consumption
- ✅ **Visual debugging context** with code snippets and failure markers
- ✅ **Intelligent targeting** prevents accidental full test suite runs
- ✅ **Coverage gap analysis** with line-by-line insights and recommendations

## Features

- **🎯 Smart Test Execution** - Run specific files/folders with structured output
- **📊 Coverage Analysis** - Line-by-line gap analysis with actionable insights  
- **📁 Test Discovery** - Find and organize test files across your project
- **🔗 Claude Code Hooks** - Automatic interception of Vitest commands
- **🛡️ Safety Guards** - Prevents accidental full project test runs
- **🏢 Multi-Repository Support** - Work across multiple projects in a single session

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

### 3. Set Project Root (Required)

Before using any tools, you must first specify which repository to work with:

```javascript
set_project_root({ path: "/absolute/path/to/your/project" })
```

### 4. Start Using

Ask Claude to:

- "Run tests in the components folder"
- "Check coverage for the auth module"
- "List all test files"

## Requirements

### Minimum Versions

- **Node.js**: 18+
- **Vitest**: 0.34.0+ (3.0.0+ recommended)
- **Coverage Provider**: `@vitest/coverage-v8` (for coverage analysis)

```bash
npm install --save-dev vitest@latest @vitest/coverage-v8@latest
```

### Project Setup

Ensure your `vitest.config.ts` includes:

```typescript
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html']
    }
  }
})
```

## Tools

### `set_project_root` (Required First)

**IMPORTANT**: This must be called before using any other tools.

Set the project root directory for all subsequent operations.

```javascript
set_project_root({ 
  path: "/Users/username/Projects/my-app" 
})
```

**Parameters:**

- `path` (required): Absolute path to the project root directory

**Features:**

- Validates project has `package.json` or `vitest.config`
- Prevents running on the MCP package itself
- Supports path restrictions via configuration

### `list_tests`

List test files in your project.

```javascript
list_tests({ directory: "./src" })
```

### `run_tests`

Execute tests with AI-optimized output.

```javascript
run_tests({ 
  target: "./src/components", 
  format: "detailed", // or "summary"
  project: "client" // optional: specify Vitest project (for monorepos)
})
```

**Parameters:**
- `target` (required): File path or directory to test
- `format` (optional): Output format - "summary" or "detailed"
- `project` (optional): Name of the Vitest project (as defined in vitest.workspace or vitest.config)

### `analyze_coverage`

Analyze test coverage with gap insights.

```javascript
analyze_coverage({
  target: "./src/api",
  threshold: 80,
  format: "detailed",
  exclude: ["**/*.stories.*", "**/e2e/**"]  // Optional: exclude patterns
})
```

**Parameters:**
- `target` (required): File path or directory to analyze
- `threshold` (optional): Coverage threshold percentage (default: 80)
- `format` (optional): "summary" or "detailed" output
- `exclude` (optional): Array of patterns to exclude from coverage (e.g., Storybook files)

Default excludes automatically applied:
- `**/*.stories.*` - Storybook story files
- `**/*.story.*` - Alternative Storybook naming
- `**/.storybook/**` - Storybook configuration directories
- `**/storybook-static/**` - Built Storybook files
- `**/e2e/**` - End-to-end test directories
- `**/*.e2e.*` - E2E test files
- `**/test-utils/**` - Test utility directories
- `**/mocks/**` - Mock directories
- `**/__mocks__/**` - Jest-style mock directories
- `**/setup-tests.*` - Test setup files
- `**/test-setup.*` - Alternative test setup naming

## Multi-Repository Workflow

Work across multiple projects in a single Claude session:

```javascript
// Switch to project A
set_project_root({ path: "/Users/username/Projects/frontend" })
run_tests({ target: "./src/components" })

// Switch to project B
set_project_root({ path: "/Users/username/Projects/backend" })
run_tests({ target: "./src/api" })

// Switch back to project A
set_project_root({ path: "/Users/username/Projects/frontend" })
analyze_coverage({ target: "./src/utils" })
```

## Claude Code Hook Integration (Recommended)

Automatically intercept Vitest commands and suggest MCP tools.

### Copy hook script

```bash
curl -o .claude/vitest-hook.sh https://raw.githubusercontent.com/djankies/vitest-mcp/main/hooks/vitest-hook.sh
chmod +x .claude/vitest-hook.sh
```

### Update .claude/settings.local.json

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/vitest-hook.sh"
          }
        ]
      }
    ]
  }
}
```

## Monorepo Support

The `run_tests` tool supports Vitest projects in monorepo setups through the `project` parameter:

```javascript
// Run tests for a specific project in a monorepo
run_tests({
  target: "./packages/client/src",
  project: "client"  // Matches project name in vitest.workspace.ts
})

// Run tests for another project
run_tests({
  target: "./packages/api/src", 
  project: "api"
})
```

This works with:
- Vitest workspace configurations (`vitest.workspace.ts`)
- Projects defined in `vitest.config.ts` with the `projects` option
- Yarn/npm/pnpm workspace monorepos

## Configuration Options

### Project Configuration (.vitest-mcp.json)

Create a `.vitest-mcp.json` file in your home directory or project root:

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
    "format": "detailed",
    "exclude": [
      "**/*.stories.*",
      "**/e2e/**"
    ]
  }
}
```

**Security Options:**

- `allowedPaths`: Restrict `set_project_root` to specific directories (string or array)

### MCP Server Options

```json
{
  "mcpServers": {
    "vitest": {
      "command": "npx",
      "args": [
        "-y", "@djankies/vitest-mcp",
        "--format", "detailed",
        "--timeout", "60000"
      ]
    }
  }
}
```

### Available CLI Options

- `--format <summary|detailed>` - Default output format
- `--timeout <ms>` - Test timeout (default: 30000)
- `--verbose` - Debug information

## Troubleshooting

### Version Issues

```bash
# Check compatibility
npx -y @djankies/vitest-mcp --version-check
```

### Common Issues

**"Project root has not been set"**

Always call `set_project_root` first:

```javascript
set_project_root({ path: "/path/to/project" })
```

**"Cannot set project root to the Vitest MCP package"**

The tool prevents running on itself. Use it on other projects.

**"Path is outside allowed directories"**

Check your `.vitest-mcp.json` configuration for `allowedPaths` restrictions.

**"Vitest not found"**

```bash
npm install --save-dev vitest@latest
```

**"Coverage provider not found"**

```bash
npm install --save-dev @vitest/coverage-v8@latest
```

**Hook not working**

```bash
# Test hook directly
./.claude/vitest-hook.sh vitest run src/
# Bypass hook
npx vitest run src/ --bypass-hook
```

## For AI/LLM Users

- **[CLAUDE.example.md](./CLAUDE.example.md)** - Example snippet to add to your project's CLAUDE.md

## License

MIT
