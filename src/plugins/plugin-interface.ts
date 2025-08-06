import { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * @fileoverview Core Plugin Interface Definitions
 * 
 * Defines the fundamental interfaces and types used throughout the plugin
 * architecture. These interfaces ensure type safety and provide a consistent
 * contract for all plugin implementations.
 */

/**
 * Core plugin interface that encapsulates a tool with type-safe execution.
 * 
 * This interface defines the contract that all tool plugins must implement.
 * It provides compile-time type safety while allowing for runtime validation
 * and consistent error handling across all tools.
 * 
 * ## Type Parameters
 * 
 * @template TArgs - The expected argument type for the tool handler
 * @template TResult - The return type from the tool handler
 * 
 * ## Example Implementation
 * 
 * ```typescript
 * interface MyToolArgs {
 *   file: string;
 *   options?: { verbose?: boolean };
 * }
 * 
 * interface MyToolResult {
 *   success: boolean;
 *   files: string[];
 * }
 * 
 * const myPlugin: ToolPlugin<MyToolArgs, MyToolResult> = {
 *   tool: {
 *     name: 'my_tool',
 *     description: 'Example tool implementation',
 *     inputSchema: {
 *       type: 'object',
 *       properties: {
 *         file: { type: 'string', description: 'Target file' },
 *         options: { 
 *           type: 'object',
 *           properties: { verbose: { type: 'boolean' } }
 *         }
 *       },
 *       required: ['file']
 *     }
 *   },
 *   handler: async (args) => {
 *     // Implementation here
 *     return { success: true, files: [args.file] };
 *   },
 *   validate: (args): args is MyToolArgs => {
 *     return typeof args === 'object' && 
 *            args !== null && 
 *            'file' in args && 
 *            typeof args.file === 'string';
 *   }
 * };
 * ```
 * 
 * @since 2.0.0
 */
export interface ToolPlugin<TArgs = unknown, TResult = unknown> {
  /** 
   * MCP Tool definition with schema and metadata.
   * 
   * Contains the tool name, description, and JSON schema for input validation.
   * This definition is used by MCP clients to understand tool capabilities.
   */
  readonly tool: Tool;
  
  /** 
   * Type-safe handler function that processes arguments and returns results.
   * 
   * This is the core implementation of the tool. It receives validated arguments
   * of type TArgs and must return a Promise resolving to TResult.
   * 
   * @param args - Validated arguments matching the TArgs type
   * @returns Promise resolving to the tool result of type TResult
   * @throws Should throw descriptive errors for invalid operations
   */
  readonly handler: (args: TArgs) => Promise<TResult>;
  
  /** 
   * Optional runtime validation function to ensure type safety.
   * 
   * Provides runtime type checking for arguments before they reach the handler.
   * While TypeScript provides compile-time safety, this function ensures runtime
   * safety when arguments come from external sources (like MCP clients).
   * 
   * @param args - Raw arguments from MCP client
   * @returns Type predicate indicating if args match TArgs type
   */
  readonly validate?: (args: unknown) => args is TArgs;
}

/**
 * Result wrapper for plugin execution with comprehensive error handling.
 * 
 * This type provides a standardized way to handle both successful and failed
 * plugin executions. It ensures that all execution results follow the same
 * structure, making error handling consistent across the entire system.
 * 
 * ## Success Case
 * When `success` is true, the `data` field contains the tool's result.
 * 
 * ## Error Case
 * When `success` is false, the `error` field contains detailed information
 * about what went wrong, including user-friendly hints for resolution.
 * 
 * ## Example Usage
 * 
 * ```typescript
 * const result: PluginExecutionResult<string[]> = await executePlugin();
 * 
 * if (result.success) {
 *   console.log('Files found:', result.data);
 * } else {
 *   console.error(`Tool ${result.error.tool} failed: ${result.error.message}`);
 *   if (result.error.hint) {
 *     console.log('Suggestion:', result.error.hint);
 *   }
 * }
 * ```
 * 
 * @template T - The type of data returned on successful execution
 * @since 2.0.0
 */
export type PluginExecutionResult<T> = {
  /** Whether the execution was successful */
  success: boolean;
  
  /** Result data if successful - only present when success is true */
  data?: T;
  
  /** 
   * Error information if unsuccessful - only present when success is false
   * 
   * Contains comprehensive error details for debugging and user feedback
   */
  error?: {
    /** Human-readable error message */
    message: string;
    /** Stack trace for debugging (optional) */
    stack?: string;
    /** Name of the tool that failed */
    tool: string;
    /** Arguments that were passed to the tool */
    arguments: unknown;
    /** User-friendly hint for resolving the error (optional) */
    hint?: string;
  };
};

/**
 * MCP-formatted response for tool execution.
 * 
 * This interface defines the exact format expected by the Model Context Protocol
 * SDK for tool responses. All plugin execution results are eventually converted
 * to this format before being sent to the MCP client.
 * 
 * ## Format Specification
 * 
 * The response must contain a `content` array with text-type entries. Additional
 * metadata can be included in the `_meta` field or as additional properties.
 * 
 * ## Example Response
 * 
 * ```typescript
 * const response: MCPToolResponse = {
 *   content: [
 *     {
 *       type: 'text',
 *       text: JSON.stringify({ 
 *         success: true, 
 *         results: ['test1.js', 'test2.js'] 
 *       }, null, 2)
 *     }
 *   ],
 *   _meta: {
 *     executionTime: 150,
 *     tool: 'list_tests'
 *   }
 * };
 * ```
 * 
 * @since 2.0.0
 * @see {@link https://modelcontextprotocol.io/} MCP Protocol Specification
 */
export interface MCPToolResponse {
  /** Array of content blocks - currently only text is supported */
  content: Array<{
    /** Content type - must be 'text' for current MCP version */
    type: 'text';
    /** The actual text content of the response */
    text: string;
  }>;
  /** Optional metadata about the execution */
  _meta?: { [x: string]: unknown };
  /** Additional properties allowed by MCP specification */
  [x: string]: unknown;
}

/**
 * Registry interface for managing tool plugins
 */
export interface IToolRegistry {
  /** Register a new tool plugin */
  register<TArgs, TResult>(plugin: ToolPlugin<TArgs, TResult>): void;
  
  /** Execute a tool by name with type-safe validation */
  execute(name: string, args: unknown): Promise<MCPToolResponse>;
  
  /** Get all registered tools for MCP list tools request */
  getTools(): Tool[];
  
  /** Check if a tool is registered */
  hasPlugin(name: string): boolean;
  
  /** Get plugin names */
  getPluginNames(): string[];
}

/**
 * Configuration options for plugin execution
 */
export interface PluginExecutionConfig {
  /** Enable debug output */
  debug?: boolean;
  
  /** Custom error hint generator */
  getErrorHint?: (error: string) => string;
  
  /** Custom response formatter */
  formatResponse?: <T>(result: PluginExecutionResult<T>) => MCPToolResponse;
}

/**
 * Plugin validation error
 */
export class PluginValidationError extends Error {
  constructor(
    message: string,
    public readonly toolName: string,
    public readonly args: unknown
  ) {
    super(message);
    this.name = 'PluginValidationError';
  }
}

/**
 * Plugin execution error
 */
export class PluginExecutionError extends Error {
  constructor(
    message: string,
    public readonly toolName: string,
    public readonly args: unknown,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'PluginExecutionError';
    if (originalError) {
      this.stack = originalError.stack;
    }
  }
}