# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Model Context Protocol (MCP) server that provides AI-optimized Vitest testing tools. The server offers structured JSON output, intelligent test targeting, coverage analysis, and safety guards to prevent accidental full test suite runs.

## Development Commands

### Building and Development

- `npm run build` - Compile TypeScript to JavaScript in `dist/` folder and make executable
- `npm run dev` - Watch mode compilation with TypeScript
- `npm start` - Run the compiled MCP server
- `npm run lint` - Run ESLint on TypeScript source files
- `npm test` - Run the project's own test suite using Vitest
- `npm run prepare` - Build before publishing (runs automatically on install)

### Testing Commands

- **IMPORTANT**: Always use the project's own MCP tools for testing, not raw vitest commands
- `set_project_root({ path: "/absolute/path/to/project" })` - Required first step
- `run_tests({ target: "./src/components", format: "detailed" })` - Run specific tests
- `analyze_coverage({ target: "./src", threshold: 80 })` - Coverage analysis
- `list_tests({ directory: "./src" })` - Find test files

### Single Test Execution

When working on a specific test file, use:

```javascript
run_tests({ 
  target: "./src/tools/__tests__/list-tests.test.ts",
  format: "detailed" 
})
```

## Architecture

### Core Components

**MCP Server (`src/index.ts`)**

- Main server class implementing Model Context Protocol
- Handles tool registration and request routing
- Provides error handling and JSON-structured responses
- Supports resources for usage documentation

**Tools Layer (`src/tools/`)**

- `set-project-root.ts` - Project context management (required first)
- `run-tests.ts` - Test execution with smart formatting
- `list-tests.ts` - Test file discovery
- `analyze-coverage.ts` - Coverage analysis with gap insights

**Configuration System (`src/config/`)**

- `config-loader.ts` - Configuration loading with CLI arg support
- `cli-parser.ts` - Command-line argument parsing
- Configuration sources: CLI args → `.vitest-mcp.json` → defaults

**Processing Layer (`src/utils/`)**

- `output-processor.ts` - Converts raw Vitest output to structured format
- `coverage-processor.ts` - Processes coverage data for analysis
- `file-utils.ts` - File system utilities with safety checks
- `version-checker.ts` - Vitest compatibility validation

**Type System (`src/types/`)**

- `config-types.ts` - Configuration interfaces
- `coverage-types.ts` - Coverage analysis types

### Project Context Management

The server maintains project context through `src/context/project-context.ts`:

- Stores current project root (set via `set_project_root`)
- Validates paths and prevents self-targeting
- Supports multi-repository workflows in single session

### Safety Architecture

**Path Validation**: All operations validate paths exist and prevent targeting project root
**Self-Protection**: Prevents running MCP server on itself
**Timeout Protection**: Configurable timeouts prevent hanging operations
**Allowed Paths**: Optional configuration to restrict operations to specific directories

### Output Processing

**Smart Format Selection**:

- Single file + no failures = summary format
- Multiple files OR failures = detailed format
- User preference always overrides smart defaults

**Structured Output**:

- Summary: Test counts, pass rates, failed test names only
- Detailed: Full error context, code snippets, stack traces

## Key Implementation Patterns

### Error Handling

- All tools return structured JSON even for errors
- Validation occurs before execution
- Version compatibility checks prevent common issues
- Detailed error messages with actionable guidance

### Multi-Project Support

- Project context switches cleanly between repositories
- Each `set_project_root` call establishes new working context
- Relative paths resolved against current project root

### Configuration Hierarchy

1. CLI arguments (highest priority)
2. Project-specific `.vitest-mcp.json`
3. User home directory `.vitest-mcp.json`
4. Built-in defaults (lowest priority)

## Development Notes

### Testing Strategy

- Tests located in `src/__tests__/` and `src/tools/__tests__/`
- Uses same Vitest configuration as projects it serves
- Coverage configured with v8 provider and HTML reports

### Build Process

- TypeScript compilation to `dist/` folder
- Executable shebang added to main entry point
- Package published to npm with binary entry point

### MCP Integration

- Implements Model Context Protocol for AI assistant integration
- Provides both tools (executable functions) and resources (documentation)
- Designed for Claude Desktop configuration via `claude_desktop_config.json`

### Version Compatibility

- Requires Node.js 18+ and Vitest 0.34.0+
- Peer dependency on Vitest ensures compatibility
- Runtime version checking prevents execution with incompatible versions
