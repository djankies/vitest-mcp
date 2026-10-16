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

### Development Mode (Self-Testing)

When developing the MCP server itself, you can enable development mode to test it on its own repository:

1. Set the environment variable in `.env.development`:

   ```bash
   VITEST_MCP_DEV_MODE=true
   ```

2. Build and run the server:

   ```bash
   npm run build
   npm start
   ```

3. Use the tools on the repository itself:

   ```javascript
   set_project_root({ path: "/path/to/vitest-mcp" })  // Now allowed in dev mode
   run_tests({ target: "./src/tools" })
   ```

This bypasses the self-protection check that normally prevents the MCP server from running on itself.

### Testing Commands

- **IMPORTANT**: Always use the project's own MCP tools for testing, not raw vitest commands
- `set_project_root({ path: "/absolute/path/to/project" })` - Required first step
- `run_tests({ target: "./src/components", format: "detailed" })` - Run specific tests
- `analyze_coverage({ target: "./src" })` - Coverage analysis (thresholds come from the Vitest config)
- `list_tests({ path: "./src" })` - Find test files

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

- `vitest-runner.ts` - Finds the project's own Vitest install and runs it with `node` (never a shell or npx)
- `target-utils.ts` - Validates targets and project names before they become CLI arguments
- `output-processor.ts` - Converts Vitest's JSON report to structured format
- `coverage-processor.ts` - Processes coverage data for analysis
- `file-utils.ts` - File system utilities with safety checks
- `version-checker.ts` - Vitest compatibility validation

**Reporters (`src/reporters/`)**

- `console-reporter.ts` - Loaded by Vitest (not the server) to capture console output for `showLogs`

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

- Unit tests are in `__tests__/` folders under `src/`; Vitest itself is mocked there
- `compat/run-compat.mjs` is the end-to-end suite: it installs a given Vitest major into the fixture projects in `compat/fixtures/` and drives the built tools against them. Run `npm run test:compat -- 4` (any of 3, 4, 5). CI runs all three
- Any change to how Vitest is invoked or how its output is read must pass the compat suite on every supported major

### Build Process

- TypeScript compilation to `dist/` folder, then `scripts/postbuild.mjs` (cross-platform)
- Executable shebang added to main entry point
- Package published to npm with binary entry point

### MCP Integration

- Implements Model Context Protocol for AI assistant integration
- Provides both tools (executable functions) and resources (documentation)
- Designed for Claude Desktop configuration via `claude_desktop_config.json`

### Version Compatibility

- Requires Node.js 22.12+; supports Vitest 3.x, 4.x and 5.x
- Vitest is an optional peer dependency: the server always uses the project's own install
- Runtime version checking reports missing Vitest, untested majors and mismatched coverage providers
- Known differences between majors: Vitest 5 writes the JSON report to a file instead of stdout (always pass `--outputFile.json`); Vitest 4 dropped `coverage.all` (pass `--coverage.include` to report untested files); `vitest.workspace` files were replaced by `projects` in 3.2
