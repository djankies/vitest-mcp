# 🧪 Vitest MCP Server

[![CI](https://github.com/djankies/vitest-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/djankies/vitest-mcp/actions/workflows/ci.yml)

<a href="https://glama.ai/mcp/servers/@djankies/vitest-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@djankies/vitest-mcp/badge" alt="Vitest Server MCP server" />
</a>

**MCP Vitest runner** with LLM-optimized test output, log capturing, and line-by-line coverage analysis.

## Table of Contents

<!-- markdownlint-disable MD051-->
- [😢 The Problem with LLMs and Testing](#😢-the-problem-with-llms-and-testing-😢)
- [✨ Key Features](#✨-key-features-✨)
- [🚀 Quick Start](#🚀-quick-start-🚀)
- [📋 Requirements](#📋-requirements)
- [🧰 Tools](#🧰-tools)
- [🔄 Multi-Repository Support](#🔄-multi-repository-support)
- [🪝 Claude Code Hook](#🪝-claude-code-hook)
- [🤖 LLM instructions](#🤖-llm-instructions)
- [⚙️ Configuration](#⚙️-configuration)
- [🔍 Development Mode \& Debugging](#🔍-development-mode--debugging)
- [🔧 Troubleshooting](#🔧-troubleshooting)
- [🤝 Contributing](#🤝-contributing)
- [📜 License](#📜-license)
<!-- markdownlint-enable MD051 -->

## 😢 The Problem with LLMs and Testing 😢

- **Noisy test output** - Raw Vitest output can be extremely verbose eating up tokens/context with useless information.
- **Full test suite runs** - LLMs sometimes forget to limit the scope of the test run, causing full test suite runs to be executed.
- **Buried console logs** - Console logs can be hidden in test output, making it inefficient for LLMs to debug test failures.
- **Raw coverage files** - Raw coverage files are too large for AI to parse.
- **Watch mode** - LLMs get stuck when vitest runs in watch mode.

## ✨ Key Features ✨

- **Smart Test Results** with adaptive, structured output to limit noise.
- **Console Log Capture** to prevent logs from getting lost in test output.
- **Coverage Analysis** with line-by-line gap insights.
- **Multi-Repository Support** in a single session with context switching.
- **Safety Guards** prevent full project runs, watch mode, invalid vitest commands, and context hogging.

## 🚀 Quick Start 🚀

The Vitest MCP server can be used with any MCP-compatible IDE or tool and works with all Javascript or Typescript Vitests. The basic configuration is:

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

> ⚠️ **Note**: The above example may not be valid for all MCP clients. Verify your client's specific setup instructions.

### 🛠️ Client-Specific Setup

Select your preferred IDE or tool from the setup guides below:

<details>
<summary><strong>Claude Code</strong></summary>

### Configuration Methods

Claude Code supports multiple configuration approaches:

#### Method 1: CLI Wizard (Interactive)

```bash
# Add server with interactive prompts
claude mcp add vitest -- npx -y @djankies/vitest-mcp

# Add to project scope (shareable with team)
claude mcp add --scope project vitest -- npx -y @djankies/vitest-mcp
```

#### Method 2: Direct Configuration File

Create or edit `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "vitest": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@djankies/vitest-mcp"],
      "env": {}
    }
  }
}
```

### Configuration Scopes

- **Local** (default): Personal, project-specific - stored in user settings
- **Project**: Team-shared - stored in `.mcp.json` in project root
- **User**: Available across all projects - global configuration

### Setup Steps

1. Navigate to your project directory
2. Choose either CLI or file-based configuration
3. For CLI: Run `claude mcp add vitest npx -y @djankies/vitest-mcp`
4. For file: Create `.mcp.json` with the configuration above
5. Verify with `/mcp` command in Claude Code to see connection status

### Usage

Once configured, use the MCP server naturally in your conversations:

- "Set the project root to this directory"
- "Run the auth component tests"
- "Show me the test coverage gaps"

</details>

<details>
<summary><strong>Claude Desktop</strong></summary>

### Configuration Location

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

### Example Configuration

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

### Setup Steps

1. Open Claude Desktop
2. Navigate to **File → Settings → Developer**
3. Click **Edit Config**
4. Add the configuration above
5. Save and restart Claude Desktop
6. Look for the MCP indicator (🔌) in the conversation input

</details>

<details>
<summary><strong>VS Code</strong></summary>

### Configuration Methods

- **Workspace**: `.vscode/mcp.json` in your project
- **Global**: Run command `MCP: Open User Configuration`

### Example Configuration

```json
{
  "mcpServers": {
    "vitest": {
      "command": "npx",
      "args": ["-y", "@djankies/vitest-mcp"],
      "type": "stdio"
    }
  }
}
```

### Setup Steps

1. Install VS Code 1.86+ with GitHub Copilot
2. Open Command Palette (`Cmd/Ctrl + Shift + P`)
3. Run `MCP: Add Server`
4. Select **Workspace Settings** or **Global**
5. Add the configuration and save
6. Access via Copilot Chat: **Add Context → MCP Resources**

</details>

<details>
<summary><strong>Cursor</strong></summary>

### Configuration Location

- **Project**: `.cursor/mcp.json` in your project directory
- **Global**: `~/.cursor/mcp.json` for all workspaces

### Example Configuration

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

### Setup Steps

1. Create the configuration file in your preferred location
2. Add the server configuration
3. Restart Cursor
4. The MCP server will be available in Cursor's AI chat
5. Use natural language to run tests: "Run the auth component tests"

</details>

<details>
<summary><strong>Windsurf</strong></summary>

### Configuration Location

Similar to Cursor, but use `serverUrl` instead of `url` for remote servers

### Example Configuration

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

### Setup Steps

1. Open Windsurf Settings (`Cmd/Ctrl + ,`)
2. Navigate to **Cascade settings**
3. Add MCP server configuration
5. Reload MCP servers to activate

</details>

<details>
<summary><strong>Cline (VS Code Extension)</strong></summary>

### Configuration via Cline UI

### Example Configuration

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

### Setup Steps

1. Open VS Code with Cline extension installed
2. Click the Cline icon in the sidebar
3. Click **MCP Servers** → **Configure MCP Servers**
4. Add the vitest-mcp configuration
5. Save and reload VS Code
6. Access through Cline's chat interface

</details>

### 3. Use It 🎮

Once configured, you can use natural language to interact with your tests:

- "Run the tests for this component"
- "Debug this test file"
- "Analyze the coverage for this file"

Or prepend your message with `vitest-mcp:` to ensure the tools are used:

- "vitest-mcp: run tests for this component"
- "vitest-mcp: debug this test file"
- "vitest-mcp: analyze coverage for this file"

## 📋 Requirements

- **Node.js**: 22.12+ 🟢
- **Vitest**: 3.x, 4.x or 5.x installed in your project 🧪 (each major is tested in CI against real projects)
- **Coverage**: `@vitest/coverage-v8` or `@vitest/coverage-istanbul`, same major version as Vitest (for coverage analysis) 📊

```bash
npm install --save-dev vitest @vitest/coverage-v8
```

The server always runs **your project's own Vitest** (resolved from `node_modules`, including hoisted monorepo installs). It never downloads Vitest or runs commands through a shell.

## 🧰 Tools

### `set_project_root`

🚨 **Required first** - Set the project root for all operations.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | Yes | Project root path |

---

### `list_tests`

List test files in your project. Helps keep LLMs from slipping back to using command line tools while working with tests.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | No | Directory to search for test files (defaults to the project root) |

---

### `run_tests`

Execute tests with structured output.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `target` | string | Yes | File or directory to test |
| `format` | string | No | Output format: "summary" or "detailed" (auto-detects based on results) |
| `showLogs` | boolean | No | Include console output with `[stdout]` or `[stderr]` prefixes |
| `project` | string | No | Vitest project name for monorepos |

---

### `analyze_coverage`

Analyze test coverage with gap insights.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `target` | string | Yes | Source file or directory to analyze coverage for |
| `format` | string | No | Output format: "summary" (overview only) or "detailed" (includes line-by-line coverage) |
| `project` | string | No | Only use tests from this Vitest project (e.g. `"unit"`) |
| `exclude` | string[] | No | Patterns to exclude from coverage (e.g., ["**/*.stories.*"]). Replaces your config's `coverage.exclude` for this run |

> **Note**: Coverage thresholds should be configured in your `vitest.config.ts` file, not via MCP parameters.

The tool runs every test that imports the target (`vitest related`), wherever your tests live (`./test`, `__tests__`, next to the source...), and reports coverage for the target only, including files that no test touches. Reports are written to a temporary directory, so your own `coverage/` output is left alone. Test utilities, mocks, stories, and e2e files are excluded automatically.

## 🔄 Multi-Repository Support

```javascript
// Project A
set_project_root({ path: "/path/to/frontend" })
run_tests({ target: "./src" })

// Project B
set_project_root({ path: "/path/to/backend" })
run_tests({ target: "./src" })
```

## 🪝 Claude Code Hook

Automatically redirect Vitest commands to MCP tools:

```bash
# Run from project root
curl -o .claude/vitest-hook.sh https://raw.githubusercontent.com/djankies/vitest-mcp/refs/heads/main/.claude/vitest-hook.sh
chmod +x .claude/vitest-hook.sh
```

Then add to your project's `.claude/settings.local.json`:

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

The hook can be bypassed with the `BYPASS_VITEST_HOOK` environment variable:

```bash
BYPASS_VITEST_HOOK=1 npm test
```

Or export for entire session:

```bash
export BYPASS_VITEST_HOOK=1
```

## 🤖 LLM instructions

Encourage claude or your ide to use the tools correctly: [CLAUDE.example.md](./CLAUDE.example.md)

## ⚙️ Configuration

### Vitest Configuration Priority

If your project has a `vitest.mcp.config.*` file (`.ts`, `.mts`, `.cts`, `.js`, `.mjs` or `.cjs`), the MCP server passes it to Vitest with `--config`. Otherwise Vitest finds your normal `vitest.config.*` / `vite.config.*` as usual.

This allows you to have a dedicated MCP-specific configuration that won't interfere with your regular development workflow:

```typescript
// vitest.mcp.config.ts
import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config';

export default mergeConfig(baseConfig, defineConfig({
  test: {
    // MCP-specific settings, e.g. a longer timeout for AI-driven runs
    testTimeout: 30000,
  },
}));
```

Reporters, coverage output and console capture are set by the server on the command line, so you don't need to configure them.

### Coverage Thresholds

To enable coverage threshold reporting in the `analyze_coverage` tool, just configure in your Vitest configuration file:

```typescript
// vitest.config.ts or vitest.mcp.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 90,
        functions: 85,
        branches: 80,
        statements: 90
      }
    }
  }
});
```
>
> 💡 **Note**: Coverage analysis is always available regardless of threshold settings. Threshold reporting just helps keep your LLM on target.

### Vitest-MCP Configuration File

Optional `.vitest-mcp.json` in home or project directory:

```json
{
  "safety": {
    "allowedPaths": ["/Users/username/Projects"]
  },
  "testDefaults": {
    "format": "detailed",
    "timeout": 60000
  }
}
```

### Priority Order

Configuration is merged in the following order (highest priority first):

1. Command-line flags
2. Environment variables
3. Configuration file
4. Built-in defaults

## 🧑🏻‍💻 Development Mode & Debugging

### Enable Debug Mode

Set the debug environment variable for detailed logging:

```bash
VITEST_MCP_DEBUG=true
```

Or in your MCP config file:

```json
{
  "mcpServers": {
    "vitest": {
      "command": "npx",
      "args": ["-y", "@djankies/vitest-mcp"],
      "env": {
        "VITEST_MCP_DEBUG": "true"
      }
    }
  }
}
```

### Development Mode

Enable to test the server on its own codebase:

```bash
# Set in .env.development, or in your mcp config file 
VITEST_MCP_DEV_MODE=true
```

## 🔧 Troubleshooting

**"Vitest not found"** - Install it in the project you set as root: `npm install --save-dev vitest`

**"Coverage provider not found"** / **"does not match Vitest"** - Install the provider matching your Vitest major, e.g. `npm install --save-dev @vitest/coverage-v8@4` for Vitest 4 📊

**Hook issues** - Bypass with: `BYPASS_VITEST_HOOK=1 npm test`

**Found a bug?** Submit a bug report, please, and thank you.

## 🤝 Contributing

Releases are automated with [semantic-release](https://github.com/semantic-release/semantic-release): merging to `main` publishes a new version when it contains `fix:` (patch), `feat:` (minor) or breaking (`feat!:`) commits, and updates the [CHANGELOG](./CHANGELOG.md). Please write commit messages in the [Conventional Commits](https://www.conventionalcommits.org/) format; a commit hook and CI check them.

## 📜 License

MIT — See [LICENSE](./LICENSE).
