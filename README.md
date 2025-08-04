# Vitest MCP Server

A basic MCP (Model Context Protocol) server that provides guardrails for running Vitest commands via LLMs like Claude Code.

## Problem Solved

LLMs frequently run inefficient Vitest commands like `vitest` on entire projects instead of targeting specific files. This server provides simple safety guardrails and basic validation.

## Features

- **Safe Test Execution**: Requires target parameter to prevent running all tests
- **Test Discovery**: Find and list test files in your project  
- **Basic Validation**: Validates file paths and prevents dangerous commands
- **LLM-Optimized Output**: Multiple output formats optimized for AI consumption
- **Smart Defaults**: Automatically selects best output format based on context
- **Simple Interface**: Just 2 tools - `list_tests` and `run_tests`

## Installation

```bash
# Clone and build
git clone <repo-url>
cd vitest-mcp
npm install
npm run build

# Run the server
npm start
```

## MCP Tools

### `list_tests`

Find test files in your project.

**Parameters:**
- `path` (optional): Directory to search (defaults to project root)

**Example:**
```json
{
  "name": "list_tests",
  "arguments": {
    "path": "src/components"
  }
}
```

### `run_tests`

Execute Vitest commands safely with validation and LLM-optimized output formats.

**Parameters:**
- `target` (required): File or directory to test
- `coverage` (optional): Enable coverage reporting
- `format` (optional): Output format - `"summary"` (default), `"detailed"`, or `"json"`

**Output Formats:**
- **`summary`**: Minimal output perfect for LLMs (e.g., "✅ 5 tests passed in 234ms")
- **`detailed`**: Includes test names and failure details when needed
- **`json`**: Structured JSON data for programmatic consumption

**Smart Defaults:**
- Single file → `summary` format
- Multiple files → `detailed` format
- Test failures → Automatically includes error details

### Structured Output for LLMs

All formats now return both human-readable strings AND structured data optimized for LLM consumption:

```javascript
{
  // Human-readable output
  processedOutput: "✅ 5 tests passed in 234ms",
  
  // Structured data for LLMs
  structured: {
    status: "success",
    summary: {
      total: 5,
      passed: 5,
      failed: 0,
      skipped: 0,
      duration: 234,
      passRate: 100
    },
    files: [{
      path: "src/example.test.ts",
      name: "example.test.ts",
      status: "passed",
      duration: 234,
      tests: [{
        name: "should work",
        fullName: "Example › should work",
        status: "passed",
        duration: 45
      }]
    }],
    failures: [{
      file: "example.test.ts",
      test: "should fail",
      error: "Expected 2 to be 3"
    }],
    coverage: {
      lines: 85.5,
      functions: 90.2,
      branches: 78.3,
      statements: 86.1
    }
  }
}
```

This structured format provides:
- **Quick access to summary statistics** without parsing strings
- **Detailed test results** organized by file and test case  
- **Failure information** extracted and organized for easy access
- **Coverage data** when available
- **Pass rate calculation** for quick assessment

**Examples:**
```json
// Simple usage with smart defaults
{
  "name": "run_tests", 
  "arguments": {
    "target": "src/components/Button.test.ts"
  }
}

// With coverage and detailed output
{
  "name": "run_tests", 
  "arguments": {
    "target": "src",
    "coverage": true,
    "format": "detailed"
  }
}

// Get structured JSON output
{
  "name": "run_tests",
  "arguments": {
    "target": "src/example.test.ts",
    "format": "json"
  }
}
```

## Safety Features

- **Required Target**: Prevents running all tests by requiring a specific target
- **Project Root Protection**: Blocks attempts to run tests on entire project root
- **Path Validation**: Checks that target files/directories exist before testing  
- **Relative Path Safety**: Uses relative paths to prevent absolute path issues
- **Command Timeout**: 30-second timeout to prevent hanging
- **Error Handling**: Clear error messages for debugging

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode for development
npm run dev

# Run tests
npm test

# Lint
npm run lint
```

## Configuration with Claude Code

Add to your MCP settings:

```json
{
  "mcpServers": {
    "vitest": {
      "command": "node",
      "args": ["/path/to/vitest-mcp/dist/index.js"]
    }
  }
}
```

## Future Versions

- V2: Configuration options
- V3: Performance optimizations
- V4: Advanced features (caching, analytics, etc.)

## License

MIT