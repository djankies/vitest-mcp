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
import { analyzeCoverageTool, handleAnalyzeCoverage } from './tools/analyze-coverage.js';
import { AnalyzeCoverageArgs } from './types/coverage-types.js';
import { getConfig } from './config/config-loader.js';

/**
 * Basic Vitest MCP Server
 * Provides simple guardrails for running Vitest commands via LLMs
 */

class VitestMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: '@djankies/vitest-mcp',
        version: '0.1.0',
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
        tools: [listTestsTool, runTestsTool, analyzeCoverageTool],
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
            
            // Return just the structured data with minimal wrapper
            const responseData = {
              success: runResult.success,
              format: runResult.format,
              command: runResult.command,
              duration: runResult.duration,
              ...runResult.structured // Spread the structured result directly
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

          case 'analyze_coverage': {
            const args = request.params.arguments || {};
            if (!args.target || typeof args.target !== 'string') {
              throw new Error('target parameter is required for analyze_coverage');
            }
            const coverageResult = await handleAnalyzeCoverage(args as unknown as AnalyzeCoverageArgs);
            
            // Return structured response with coverage analysis
            const responseData = coverageResult;
                
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

## ⚠️ Coverage Setup Required
Before using coverage analysis features, ensure your project is properly configured:

### 1. Install Coverage Provider
\`\`\`bash
npm install --save-dev @vitest/coverage-v8
# OR for c8 provider:
# npm install --save-dev @vitest/coverage-c8
\`\`\`

### 2. Configure vitest.config.ts
\`\`\`typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8', // or 'c8'
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'dist/',
        'coverage/',
        '**/*.test.ts',
        '**/*.spec.ts'
      ]
    }
  },
});
\`\`\`

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
- \`target\` (required): Specific test file or directory to run.
- \`format\` (optional): Output format ('summary', 'detailed'). Defaults to 'summary'.

**Example Usage:**
\`\`\`
run_tests({ 
  target: "./src/components", 
  format: "detailed"
})
\`\`\`

### 3. analyze_coverage ✨ NEW
Runs comprehensive coverage analysis with insights about gaps and improvement opportunities.

**Parameters:**
- \`target\` (required): File path or directory to analyze coverage for.
- \`threshold\` (optional): Minimum coverage threshold percentage (default: 80).
- \`includeDetails\` (optional): Include detailed line-by-line coverage analysis (default: false).
- \`format\` (optional): Output format ('summary', 'detailed'). Defaults to 'summary'.
- \`thresholds\` (optional): Custom coverage thresholds for different metrics.

**Example Usage:**
\`\`\`
analyze_coverage({
  target: "./src/components",
  format: "detailed",
  threshold: 80,
  includeDetails: true
})
\`\`\`

**Format Options:**
- **summary**: Basic coverage metrics
- **detailed**: Comprehensive analysis with file-level details and gaps

## Best Practices

### Testing Workflow
1. **Start with list_tests**: Before running tests, use \`list_tests\` to understand the test structure.
2. **Use specific paths**: When possible, run tests for specific files or directories to save time.
3. **Format selection**: Use \`format: "summary"\` for simple pass/fail counts, \`format: "detailed"\` for comprehensive failure analysis.

### Coverage Analysis Workflow
1. **Setup first**: Ensure coverage provider is installed and configured before using coverage tools.
2. **Start with analyze_coverage**: Use \`analyze_coverage\` with \`format: "detailed"\` for comprehensive insights.
3. **Target specific areas**: Focus coverage analysis on specific directories or files rather than entire projects.
4. **Set realistic thresholds**: Start with 70% threshold and gradually increase as coverage improves.
5. **Use includeDetails for debugging**: Enable \`includeDetails: true\` when you need to understand specific coverage gaps.

### Coverage Troubleshooting
- **"Coverage provider not found"**: Run \`npm install --save-dev @vitest/coverage-v8\`
- **"Coverage thresholds not met"**: Lower the threshold or add more tests to meet the requirements
- **"No coverage data"**: Ensure vitest.config.ts has coverage configuration and reporter includes 'json'
- **"Analysis timeout"**: Use more specific target paths or increase analysis timeout

## Error Handling

### Test Execution Errors
- If tests fail, the tool will return detailed error information including:
  - Failed test names and their error messages
  - File paths where failures occurred
  - Stack traces for debugging

### Coverage Analysis Errors
- Coverage analysis failures include:
  - Specific threshold violations with current vs. required percentages
  - Missing coverage provider installation
  - Configuration issues with vitest.config.ts
  - Actionable recommendations to resolve issues

### Common Issues
- **"No test files found"**: Check your path and pattern parameters
- **"Command failed"**: Ensure Vitest is installed in the project
- **"Coverage provider missing"**: Install @vitest/coverage-v8 or @vitest/coverage-c8
- **"Threshold violations"**: Either lower thresholds or add more tests to improve coverage
- **Timeout errors**: Increase the timeout parameter for slower tests or coverage analysis
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
    // Get CLI arguments (skip node and script path)
    const cliArgs = process.argv.slice(2);
    
    // Load config with CLI args
    const config = await getConfig(cliArgs);
    
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    // Log server start to stderr (so it doesn't interfere with MCP protocol)
    console.error('Vitest MCP Server started');
    
    if (config.server.verbose || process.env.VITEST_MCP_DEBUG) {
      console.error('Configuration loaded:', JSON.stringify(config, null, 2));
      if (cliArgs.length > 0) {
        console.error('CLI arguments:', cliArgs);
      }
    }
  }
}

// Start the server
const server = new VitestMCPServer();
server.run().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});