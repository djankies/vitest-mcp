import { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  IToolRegistry,
  ToolPlugin,
  PluginExecutionResult,
  MCPToolResponse,
  PluginExecutionConfig,
  PluginValidationError,
} from './plugin-interface.js';

/**
 * Type-safe tool registry that manages plugin registration and execution
 */
export class ToolRegistry implements IToolRegistry {
  private plugins = new Map<string, ToolPlugin<unknown, unknown>>();
  private config: PluginExecutionConfig;

  constructor(config: PluginExecutionConfig = {}) {
    this.config = {
      debug: config.debug ?? false,
      getErrorHint: config.getErrorHint ?? this.getDefaultErrorHint,
      formatResponse: config.formatResponse ?? this.formatDefaultResponse,
    };
  }

  /**
   * Register a new tool plugin with compile-time type safety
   */
  register<TArgs, TResult>(plugin: ToolPlugin<TArgs, TResult>): void {
    const toolName = plugin.tool.name;
    
    if (this.plugins.has(toolName)) {
      throw new Error(`Plugin '${toolName}' is already registered`);
    }

    if (this.config.debug) {
      console.error(`[ToolRegistry] Registering plugin: ${toolName}`);
    }

    this.plugins.set(toolName, plugin as ToolPlugin<unknown, unknown>);
  }

  /**
   * Execute a tool by name with type-safe validation and error handling
   */
  async execute(name: string, args: unknown): Promise<MCPToolResponse> {
    const plugin = this.plugins.get(name);
    
    if (!plugin) {
      const error: PluginExecutionResult<never> = {
        success: false,
        error: {
          message: `Unknown tool: ${name}`,
          tool: name,
          arguments: args,
          hint: `Available tools: ${Array.from(this.plugins.keys()).join(', ')}`,
        },
      };
      return this.config.formatResponse!(error);
    }

    if (this.config.debug) {
      console.error(`[ToolRegistry] Executing tool: ${name}`, JSON.stringify(args, null, 2));
    }

    try {
      // Runtime validation if provided
      if (plugin.validate && !plugin.validate(args)) {
        throw new PluginValidationError(
          `Invalid arguments for tool '${name}'`,
          name,
          args
        );
      }

      // Execute the plugin handler
      const startTime = Date.now();
      const result = await plugin.handler(args);
      const duration = Date.now() - startTime;

      if (this.config.debug) {
        console.error(`[ToolRegistry] Tool '${name}' completed in ${duration}ms`);
      }

      const successResult: PluginExecutionResult<typeof result> = {
        success: true,
        data: result,
      };

      return this.config.formatResponse!(successResult);
      
    } catch (error) {
      const errorDetails = {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        tool: name,
        arguments: args,
        hint: this.config.getErrorHint!(error instanceof Error ? error.message : 'Unknown error'),
      };

      if (this.config.debug) {
        console.error('[ToolRegistry] Tool execution error:', errorDetails);
      }

      const errorResult: PluginExecutionResult<never> = {
        success: false,
        error: errorDetails,
      };

      return this.config.formatResponse!(errorResult);
    }
  }

  /**
   * Get all registered tools for MCP list tools request
   */
  getTools(): Tool[] {
    return Array.from(this.plugins.values()).map(plugin => plugin.tool);
  }

  /**
   * Check if a tool is registered
   */
  hasPlugin(name: string): boolean {
    return this.plugins.has(name);
  }

  /**
   * Get all plugin names
   */
  getPluginNames(): string[] {
    return Array.from(this.plugins.keys());
  }

  /**
   * Default error hint generator (matches current server behavior)
   */
  private getDefaultErrorHint(error: string): string {
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

  /**
   * Default response formatter (matches current MCP format)
   */
  private formatDefaultResponse<T>(result: PluginExecutionResult<T>): MCPToolResponse {
    if (result.success) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result.data, null, 2),
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: result.error!.message,
                tool: result.error!.tool,
                hint: result.error!.hint,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PluginExecutionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Clear all registered plugins (useful for testing)
   */
  clear(): void {
    this.plugins.clear();
  }

  /**
   * Get plugin count
   */
  get size(): number {
    return this.plugins.size;
  }
}