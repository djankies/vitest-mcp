/**
 * @fileoverview Plugin Architecture for Vitest MCP Server
 * 
 * Provides a type-safe, extensible plugin system that replaces hard-coded tool registration
 * in the main server. The architecture eliminates unsafe type casting and provides runtime
 * validation while maintaining full backward compatibility with the MCP protocol.
 * 
 * ## Key Features
 * - **Type Safety**: Compile-time and runtime type validation
 * - **Extensibility**: Easy plugin registration and tool creation
 * - **Performance**: Built-in caching and error handling
 * - **MCP Compliance**: Full compatibility with Model Context Protocol
 * 
 * ## Architecture Overview
 * 
 * The plugin system consists of several key components:
 * 
 * 1. **ToolPlugin Interface**: Defines the contract for all tool plugins
 * 2. **ToolRegistry**: Manages plugin registration and execution
 * 3. **Plugin Factory**: Provides utilities for creating new plugins
 * 4. **Standard Plugins**: Pre-built plugins for common Vitest operations
 * 
 * ## Usage Example
 * 
 * ```typescript
 * // Create a standard registry with all built-in plugins
 * const registry = createStandardToolRegistry({
 *   debug: true,
 *   getErrorHint: (error) => `Custom hint for: ${error}`
 * });
 * 
 * // Register a custom plugin
 * registry.register({
 *   tool: { name: 'my_tool', description: 'Custom tool', inputSchema: {...} },
 *   handler: async (args) => { return { result: 'success' }; },
 *   validate: (args): args is MyArgs => typeof args === 'object'
 * });
 * 
 * // Execute a tool
 * const result = await registry.execute('my_tool', { param: 'value' });
 * ```
 * 
 * @version 2.0.0
 * @since 1.0.0
 * @author Vitest MCP Development Team
 * @see {@link https://modelcontextprotocol.io/} MCP Documentation
 */

// Core interfaces and types
export * from './plugin-interface.js';

// Registry implementation
export { ToolRegistry } from './tool-registry.js';

// Factory functions and validation
export * from './plugin-factory.js';

// Pre-configured tool plugins
export * from './tool-plugins.js';

// Re-export for convenience
import { ToolRegistry } from './tool-registry.js';
import { 
  setProjectRootPlugin,
  listTestsPlugin, 
  runTestsPlugin,
  analyzeCoveragePlugin
} from './tool-plugins.js';

/**
 * Create a fully configured tool registry with all standard Vitest MCP plugins.
 * 
 * This factory function creates a ToolRegistry instance and automatically registers
 * all standard plugins required for Vitest operations. It provides a convenient
 * way to get a working MCP server with minimal setup.
 * 
 * ## Standard Plugins Included
 * 
 * - **set_project_root**: Sets the working directory for all operations
 * - **list_tests**: Discovers test files in the project
 * - **run_tests**: Executes Vitest test suites with structured output
 * - **analyze_coverage**: Analyzes test coverage with gap insights
 * 
 * ## Configuration Options
 * 
 * @param config - Optional configuration object
 * @param config.debug - Enable debug logging for plugin operations (default: false)
 * @param config.getErrorHint - Custom error hint generator function for user-friendly error messages
 * 
 * ## Example Usage
 * 
 * ```typescript
 * // Basic usage with defaults
 * const registry = createStandardToolRegistry();
 * 
 * // With debug enabled
 * const debugRegistry = createStandardToolRegistry({ 
 *   debug: true 
 * });
 * 
 * // With custom error hints
 * const customRegistry = createStandardToolRegistry({
 *   debug: process.env.NODE_ENV === 'development',
 *   getErrorHint: (error) => {
 *     if (error.includes('permission')) return 'Check file permissions';
 *     return 'Contact support for assistance';
 *   }
 * });
 * ```
 * 
 * @returns A fully configured ToolRegistry with all standard plugins registered
 * @since 2.0.0
 * @see {@link ToolRegistry} for registry management methods
 * @see {@link PluginExecutionConfig} for detailed configuration options
 */
export function createStandardToolRegistry(config?: {
  debug?: boolean;
  getErrorHint?: (error: string) => string;
}): ToolRegistry {
  const registry = new ToolRegistry(config);
  
  // Register all standard plugins
  registry.register(setProjectRootPlugin);
  registry.register(listTestsPlugin);
  registry.register(runTestsPlugin);
  registry.register(analyzeCoveragePlugin);
  
  return registry;
}