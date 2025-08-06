/**
 * Configuration types for the Vitest MCP Server
 */

export interface VitestMCPConfig {
  /**
   * Default settings for test execution
   */
  testDefaults?: {
    /**
     * Default output format for run_tests
     * @default 'summary'
     */
    format?: 'summary' | 'detailed';
    
    /**
     * Default timeout for test execution in milliseconds
     * @default 30000
     */
    timeout?: number;
    
    /**
     * Automatically use watch mode for single file tests
     * @default false
     */
    watchMode?: boolean;
  };

  /**
   * Default settings for coverage analysis
   */
  coverageDefaults?: {
    /**
     * Default output format for analyze_coverage
     * @default 'summary'
     */
    format?: 'summary' | 'detailed';
    
    /**
     * Patterns to exclude from coverage analysis
     * Default includes Storybook files, e2e tests, and mock directories
     */
    exclude?: string[];
  };

  /**
   * File discovery settings
   */
  discovery?: {
    /**
     * Default patterns for finding test files
     * @default ['**\/*.{test,spec}.{js,ts,jsx,tsx}']
     */
    testPatterns?: string[];
    
    /**
     * Directories to exclude from test discovery
     * @default ['node_modules', 'dist', 'coverage', '.git']
     */
    excludePatterns?: string[];
    
    /**
     * Maximum depth for directory traversal
     * @default 10
     */
    maxDepth?: number;
  };

  /**
   * Server behavior settings
   */
  server?: {
    /**
     * Enable verbose logging to stderr
     * @default false
     */
    verbose?: boolean;
    
    /**
     * Validate that target paths exist before execution
     * @default true
     */
    validatePaths?: boolean;
    
    /**
     * Allow running tests on project root
     * @default false
     */
    allowRootExecution?: boolean;
    
    /**
     * Working directory for test execution
     * @default process.cwd()
     */
    workingDirectory?: string;
  };

  /**
   * Safety and validation settings
   */
  safety?: {
    /**
     * Maximum number of test files to run in a single command
     * @default 100
     */
    maxFiles?: number;
    
    /**
     * Require explicit confirmation for operations affecting many files
     * @default true
     */
    requireConfirmation?: boolean;
    
    /**
     * Allowed test runners (for future extensibility)
     * @default ['vitest']
     */
    allowedRunners?: string[];
    
    /**
     * Restrict project root to specific directories
     * Can be a single path or array of paths
     * When set, set_project_root will only accept paths within these directories
     * @default undefined (no restriction)
     */
    allowedPaths?: string | string[];
  };
}

/**
 * Complete configuration with all defaults applied
 */
export type ResolvedVitestMCPConfig = Required<{
  testDefaults: Required<NonNullable<VitestMCPConfig['testDefaults']>>;
  coverageDefaults: Required<NonNullable<VitestMCPConfig['coverageDefaults']>>;
  discovery: Required<NonNullable<VitestMCPConfig['discovery']>>;
  server: Required<NonNullable<VitestMCPConfig['server']>>;
  safety: Required<NonNullable<VitestMCPConfig['safety']>>;
}>;