#!/usr/bin/env node

import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFile } from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenvConfig({ path: join(dirname(__dirname), ".env.development") });

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import {
  listTestsTool,
  handleListTests,
  ListTestsArgs,
} from "./tools/list-tests.js";
import {
  runTestsTool,
  handleRunTests,
  RunTestsArgs,
} from "./tools/run-tests.js";
import {
  analyzeCoverageTool,
  handleAnalyzeCoverage,
} from "./tools/analyze-coverage.js";
import { AnalyzeCoverageArgs } from "./types/coverage-types.js";
import {
  setProjectRootTool,
  handleSetProjectRoot,
  SetProjectRootArgs,
} from "./tools/set-project-root.js";
import { getConfig } from "./config/config-loader.js";
import { ResolvedVitestMCPConfig } from "./types/config-types.js";

/**
 * Vitest MCP Server
 * Provides tools for running Vitest tests and analyzing coverage
 */
class VitestMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "vitest-mcp",
        version: "0.2.0",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.server.onerror = (error) => {
      console.error("[MCP Error]", error);
    };

    this.server.onclose = () => {
      if (process.env.VITEST_MCP_DEBUG) {
        console.error("[MCP] Server connection closed");
      }
    };

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const config = await getConfig();

      const analyzeCoverageToolWithThresholds = {
        ...analyzeCoverageTool,
        description: this.buildCoverageToolDescription(config),
      };

      return {
        tools: [
          setProjectRootTool,
          listTestsTool,
          runTestsTool,
          analyzeCoverageToolWithThresholds,
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;

        if (process.env.VITEST_MCP_DEBUG) {
          console.error(
            `[MCP] Tool called: ${name}`,
            JSON.stringify(args, null, 2)
          );
        }

        switch (name) {
          case "set_project_root": {
            const typedArgs = args as unknown as SetProjectRootArgs;
            const result = await handleSetProjectRoot(typedArgs);
            return {
              content: [
                { type: "text", text: JSON.stringify(result, null, 2) },
              ],
            };
          }

          case "list_tests": {
            const typedArgs = args as unknown as ListTestsArgs;
            const result = await handleListTests(typedArgs);
            return {
              content: [
                { type: "text", text: JSON.stringify(result, null, 2) },
              ],
            };
          }

          case "run_tests": {
            const typedArgs = args as unknown as RunTestsArgs;
            const result = await handleRunTests(typedArgs);
            return {
              content: [
                { type: "text", text: JSON.stringify(result, null, 2) },
              ],
            };
          }

          case "analyze_coverage": {
            const typedArgs = args as unknown as AnalyzeCoverageArgs;
            const result = await handleAnalyzeCoverage(typedArgs);
            return {
              content: [
                { type: "text", text: JSON.stringify(result, null, 2) },
              ],
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const errorDetails = {
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
          tool: request.params.name,
          arguments: request.params.arguments,
        };

        if (process.env.VITEST_MCP_DEBUG) {
          console.error("[MCP] Tool execution error:", errorDetails);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: false,
                  error: errorDetails.error,
                  tool: errorDetails.tool,
                  hint: this.getErrorHint(errorDetails.error),
                },
                null,
                2
              ),
            },
          ],
        };
      }
    });

    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: "vitest://usage",
            mimeType: "text/markdown",
            name: "Vitest MCP Usage Guide",
            description:
              "Complete guide for using the Vitest MCP server, including tool documentation and examples",
          },
        ],
      };
    });

    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => {
        if (request.params.uri === "vitest://usage") {
          const usageGuidePath = join(__dirname, "resources", "usage-guide.md");
          const usageGuide = await readFile(usageGuidePath, "utf-8");

          return {
            contents: [
              {
                uri: "vitest://usage",
                mimeType: "text/markdown",
                text: usageGuide,
              },
            ],
          };
        }

        throw new Error(`Unknown resource: ${request.params.uri}`);
      }
    );
  }

  /**
   * Provide helpful hints for common errors
   */
  private getErrorHint(error: string): string {
    if (error.includes("ENOENT")) {
      return "File or directory not found. Check that the path exists and is correct.";
    }
    if (
      error.includes("version compatibility") ||
      error.includes("not compatible")
    ) {
      return "Version compatibility issue. Ensure Vitest and Node.js versions meet the requirements.";
    }
    if (error.includes("timeout")) {
      return "Operation timed out. Try running with a more specific target or increase the timeout in configuration.";
    }
    if (error.includes("coverage provider")) {
      return "Coverage provider not found. Run: npm install --save-dev @vitest/coverage-v8";
    }
    if (error.includes("test file") && error.includes("coverage")) {
      return "Coverage analysis should target source files, not test files. Specify the source file or directory being tested.";
    }
    if (error.includes("project root")) {
      return "Project root not set. Call set_project_root first with the absolute path to your project.";
    }
    return "An unexpected error occurred. Enable debug mode with VITEST_MCP_DEBUG=true for more details.";
  }

  private buildCoverageToolDescription(
    config: ResolvedVitestMCPConfig
  ): string {
    let thresholdInfo = "";

    if (config.coverageDefaults.thresholdsExplicitlySet) {
      const thresholds = config.coverageDefaults.thresholds;
      const parts: string[] = [];

      if (thresholds.lines !== undefined && thresholds.lines > 0) {
        parts.push(`lines: ${thresholds.lines}%`);
      }
      if (thresholds.branches !== undefined && thresholds.branches > 0) {
        parts.push(`branches: ${thresholds.branches}%`);
      }
      if (thresholds.functions !== undefined && thresholds.functions > 0) {
        parts.push(`functions: ${thresholds.functions}%`);
      }
      if (thresholds.statements !== undefined && thresholds.statements > 0) {
        parts.push(`statements: ${thresholds.statements}%`);
      }

      if (parts.length > 0) {
        thresholdInfo = `\n\nCOVERAGE THRESHOLDS: ${parts.join(
          ", "
        )}. Results will indicate if these thresholds are met.`;
      }
    }

    return `Perform comprehensive test coverage analysis with line-by-line gap identification, actionable insights, and detailed metrics for lines, functions, branches, and statements. Automatically excludes common non-production files (stories, mocks, e2e tests) and provides recommendations for improving coverage. Detects and prevents analysis on test files themselves. Requires set_project_root to be called first.${thresholdInfo}\n\nUSE WHEN: User wants to check test coverage, identify untested code, improve test coverage, asks "what's not tested", "coverage report", "how well tested", or mentions coverage/testing quality. Essential when "vitest-mcp:" prefix is used with coverage-related requests. Prefer this over raw vitest coverage commands for actionable insights.`;
  }

  async run() {
    try {
      const config = await getConfig();

      if (config.server.verbose || process.env.VITEST_MCP_DEBUG) {
        console.error("[MCP] Starting Vitest MCP Server...");
        console.error("[MCP] Version: 0.2.0");
        console.error("[MCP] Node version:", process.version);
        console.error("[MCP] Working directory:", process.cwd());
      }

      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      if (config.server.verbose || process.env.VITEST_MCP_DEBUG) {
        console.error("[MCP] Server started successfully");
      }
    } catch (error) {
      console.error("[MCP] Failed to start server:", error);
      process.exit(1);
    }
  }
}

async function main() {
  try {
    const server = new VitestMCPServer();
    await server.run();
  } catch (error) {
    console.error("[MCP] Fatal error:", error);
    process.exit(1);
  }
}

process.on("SIGINT", () => {
  if (process.env.VITEST_MCP_DEBUG) {
    console.error("[MCP] Received SIGINT, shutting down...");
  }
  process.exit(0);
});

process.on("SIGTERM", () => {
  if (process.env.VITEST_MCP_DEBUG) {
    console.error("[MCP] Received SIGTERM, shutting down...");
  }
  process.exit(0);
});

main().catch((error) => {
  console.error("[MCP] Unhandled error:", error);
  process.exit(1);
});
