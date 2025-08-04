#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import { listTestsTool, handleListTests } from './tools/list-tests.js';
import { runTestsTool, handleRunTests } from './tools/run-tests.js';
/**
 * Basic Vitest MCP Server
 * Provides simple guardrails for running Vitest commands via LLMs
 */
class VitestMCPServer {
    server;
    constructor() {
        this.server = new Server({
            name: 'vitest-mcp-server',
            version: '1.0.0',
        });
        this.setupHandlers();
    }
    setupHandlers() {
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
                        const listResult = await handleListTests((request.params.arguments || {}));
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
                        const runResult = await handleRunTests((request.params.arguments || {}));
                        // Return the processed output optimized for LLM consumption
                        const responseText = runResult.format === 'json'
                            ? runResult.processedOutput
                            : JSON.stringify({
                                success: runResult.success,
                                format: runResult.format,
                                output: runResult.processedOutput,
                                summary: runResult.summary,
                                command: runResult.command,
                                duration: runResult.duration,
                                context: runResult.context
                            }, null, 2);
                        return {
                            content: [
                                {
                                    type: 'text',
                                    text: responseText,
                                },
                            ],
                        };
                    }
                    default:
                        throw new Error(`Unknown tool: ${request.params.name}`);
                }
            }
            catch (error) {
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
//# sourceMappingURL=index.js.map