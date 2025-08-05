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
     * Default coverage threshold percentage
     * @default 80
     */
    threshold?: number;
    
    /**
     * Default output format for analyze_coverage
     * @default 'summary'
     */
    format?: 'summary' | 'detailed';
    
    /**
     * Include detailed line-by-line analysis by default
     * @default false
     */
    includeDetails?: boolean;
    
    /**
     * Custom thresholds for different metrics
     */
    thresholds?: {
      lines?: number;
      functions?: number;
      branches?: number;
      statements?: number;
    };
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