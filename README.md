# @djankies/vitest-mcp

Run Vitest tests through AI assistants with intelligent targeting and structured output.

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
- **⚡ Version Checking** - Ensures compatibility with your Vitest setup
- **🛡️ Safety Guards** - Prevents accidental full project test runs

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

### 3. Start Using

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
  format: "detailed" // or "summary"
})
```

### `analyze_coverage`
Analyze test coverage with gap insights.

```javascript
analyze_coverage({
  target: "./src/api",
  threshold: 80,
  format: "detailed"
})
```

## Claude Code Hook Integration (Recommended)

Automatically intercept Vitest commands and suggest MCP tools.

### Setup

```bash
# Copy hook script
curl -o .claude/vitest-hook.sh https://raw.githubusercontent.com/djankies/vitest-mcp/main/hooks/vitest-hook.sh
chmod +x .claude/vitest-hook.sh

# Update .claude/settings.local.json
cat << 'EOF' > .claude/settings.local.json
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
EOF
```

### Result

```bash
# Before: Raw Vitest command
npx vitest run src/components/

# After: Hook suggests MCP tool
🔄 Using run_tests MCP tool for better AI integration...
```

## Configuration Options

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
- `--format <summary|detailed>` - Output format
- `--timeout <ms>` - Test timeout (default: 30000)
- `--verbose` - Debug information

## Troubleshooting

### Version Issues
```bash
# Check compatibility
npx -y @djankies/vitest-mcp --version-check
```

### Common Issues

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

## License

MIT