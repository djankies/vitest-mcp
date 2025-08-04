#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { listTestsTool, handleListTests, ListTestsArgs } from './tools/list-tests.js';
import { runTestsTool, handleRunTests, RunTestsArgs } from './tools/run-tests.js';

/**
 * Basic Vitest MCP Server
 * Provides simple guardrails for running Vitest commands via LLMs
 */

class VitestMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'vitest-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [listTestsTool, runTestsTool],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          case 'list_tests': {
            const listResult = await handleListTests((request.params.arguments || {}) as ListTestsArgs);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(listResult, null, 2),
                },
              ],
            };
          }

          case 'run_tests': {
            const runResult = await handleRunTests((request.params.arguments || {}) as unknown as RunTestsArgs);
            
            // Return structured response with structured output
            const responseData = {
              success: runResult.success,
              format: runResult.format,
              output: runResult.structured, // Use structured data instead of string
              summary: runResult.summary,
              command: runResult.command,
              duration: runResult.duration,
              context: runResult.context
            };
                
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(responseData, null, 2),
                },
              ],
            };
          }

          default:
            throw new Error(`Unknown tool: ${request.params.name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: true,
                message: errorMessage,
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    });

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: 'vitest://usage',
            name: 'Vitest MCP Server Usage Guide',
            description: 'Instructions for using the Vitest MCP server tools',
            mimeType: 'text/markdown',
          },
        ],
      };
    });

    // Read resource content
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      if (request.params.uri === 'vitest://usage') {
        const usageGuide = `# Vitest MCP Server Usage Guide

## Overview
This MCP server provides tools for interacting with Vitest, a fast unit testing framework for JavaScript/TypeScript projects.

## Available Tools

### 1. list_tests
Lists all test files in the project.

**Parameters:**
- \`directory\` (optional): The directory to search for test files. Defaults to current directory.
- \`pattern\` (optional): Glob pattern to match test files. Defaults to Vitest's default patterns.

**Example Usage:**
\`\`\`
list_tests({ directory: "./src", pattern: "**/*.spec.ts" })
\`\`\`

### 2. run_tests
Runs Vitest tests with specified options.

**Parameters:**
- \`path\` (optional): Specific test file or directory to run. If not provided, runs all tests.
- \`watch\` (optional): Run in watch mode. Defaults to false.
- \`format\` (optional): Output format ('summary', 'detailed'). Defaults to 'summary'.
- \`coverage\` (optional): Enable coverage reporting. Defaults to false.
- \`updateSnapshots\` (optional): Update snapshots. Defaults to false.
- \`bail\` (optional): Stop after first test failure. Defaults to false.
- \`timeout\` (optional): Custom timeout in milliseconds. Defaults to 30000.

**Example Usage:**
\`\`\`
run_tests({ 
  target: "./src/components", 
  format: "detailed",
  coverage: true 
})
\`\`\`

## Best Practices

1. **Start with list_tests**: Before running tests, use \`list_tests\` to understand the test structure.

2. **Use specific paths**: When possible, run tests for specific files or directories to save time.

3. **Format selection**: Use \`format: "summary"\` for simple pass/fail counts, \`format: "detailed"\` for comprehensive failure analysis.

4. **Timeout consideration**: Increase timeout for integration tests or tests that involve network requests.

## Error Handling

- If tests fail, the tool will return detailed error information including:
  - Failed test names and their error messages
  - File paths where failures occurred
  - Stack traces for debugging

- Common issues:
  - "No test files found": Check your path and pattern parameters
  - "Command failed": Ensure Vitest is installed in the project
  - Timeout errors: Increase the timeout parameter for slower tests
`;

        return {
          contents: [
            {
              uri: 'vitest://usage',
              mimeType: 'text/markdown',
              text: usageGuide,
            },
          ],
        };
      }

      throw new Error(`Unknown resource: ${request.params.uri}`);
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    // Log server start to stderr (so it doesn't interfere with MCP protocol)
    console.error('Vitest MCP Server started');
  }
}

// Start the server
const server = new VitestMCPServer();
server.run().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});