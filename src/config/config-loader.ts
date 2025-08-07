import { readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { VitestMCPConfig, ResolvedVitestMCPConfig } from '../types/config-types.js';
import { parseCliArgs, getConfigPathFromArgs } from './cli-parser.js';
// Performance cache temporarily disabled for build compatibility

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: ResolvedVitestMCPConfig = {
  testDefaults: {
    format: 'summary' as 'summary' | 'detailed',
    timeout: 30000,
    watchMode: false,
  },
  coverageDefaults: {
    format: 'summary',
    exclude: [
      '**/*.stories.*',
      '**/*.story.*',
      '**/.storybook/**',
      '**/storybook-static/**',
      '**/e2e/**',
      '**/*.e2e.*',
      '**/test-utils/**',
      '**/mocks/**',
      '**/__mocks__/**',
      '**/setup-tests.*',
      '**/test-setup.*'
    ],
  },
  discovery: {
    testPatterns: ['**/*.{test,spec}.{js,ts,jsx,tsx}'],
    excludePatterns: ['node_modules', 'dist', 'coverage', '.git'],
    maxDepth: 10,
  },
  server: {
    verbose: false,
    validatePaths: true,
    allowRootExecution: false,
    workingDirectory: process.cwd(),
  },
  safety: {
    maxFiles: 100,
    requireConfirmation: true,
    allowedRunners: ['vitest'],
    allowedPaths: undefined!, // No restriction by default, will be resolved correctly
  },
};

/**
 * Configuration file search paths in order of precedence
 */
const CONFIG_SEARCH_PATHS = [
  // Current directory
  '.vitest-mcp.json',
  '.vitest-mcp.config.json',
  'vitest-mcp.json',
  'vitest-mcp.config.json',
  
  // User home directory
  join(homedir(), '.vitest-mcp.json'),
  join(homedir(), '.config', 'vitest-mcp.json'),
];

/**
 * Load configuration from file system
 */
async function loadConfigFile(cliConfigPath?: string): Promise<VitestMCPConfig | null> {
  // Check for explicit config path from CLI args first
  if (cliConfigPath) {
    try {
      const content = await readFile(cliConfigPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      if (process.env.VITEST_MCP_DEBUG && !process.env.VITEST) {
        console.error(`Failed to load config from ${cliConfigPath}:`, error);
      }
      throw error;
    }
  }
  
  // Check for explicit config path from environment
  const explicitPath = process.env.VITEST_MCP_CONFIG;
  if (explicitPath) {
    try {
      const content = await readFile(explicitPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      if (process.env.VITEST_MCP_DEBUG && !process.env.VITEST) {
        console.error(`Failed to load config from ${explicitPath}:`, error);
      }
      throw error;
    }
  }

  // Search standard paths
  for (const configPath of CONFIG_SEARCH_PATHS) {
    try {
      const content = await readFile(configPath, 'utf-8');
      if (process.env.VITEST_MCP_DEBUG) {
        console.error(`Loaded config from ${configPath}`);
      }
      return JSON.parse(content);
    } catch (error) {
      // File not found is expected, continue searching
      if ((error as { code?: string }).code !== 'ENOENT') {
        console.error(`Error reading ${configPath}:`, error);
      } else if (process.env.VITEST_MCP_DEBUG && !process.env.VITEST) {
        console.error(`Error reading ${configPath}:`, error);
      }
    }
  }

  return null;
}

/**
 * Deep merge configuration objects
 */
function mergeConfig(base: ResolvedVitestMCPConfig, override: VitestMCPConfig): ResolvedVitestMCPConfig {
  const result = { ...base } as ResolvedVitestMCPConfig;
  
  for (const key in override) {
    const overrideValue = (override as Record<string, unknown>)[key];
    if (overrideValue === null || overrideValue === undefined) {
      continue;
    }
    
    const baseValue = (base as Record<string, unknown>)[key];
    if (typeof overrideValue === 'object' && !Array.isArray(overrideValue) && 
        typeof baseValue === 'object' && !Array.isArray(baseValue)) {
      (result as Record<string, unknown>)[key] = mergeConfig(
        baseValue as ResolvedVitestMCPConfig, 
        overrideValue as VitestMCPConfig
      );
    } else {
      (result as Record<string, unknown>)[key] = overrideValue;
    }
  }
  
  return result;
}

/**
 * Load and resolve configuration with defaults
 */
export async function loadConfiguration(cliArgs?: string[]): Promise<ResolvedVitestMCPConfig> {
  try {
    // Parse CLI arguments
    const args = cliArgs || process.argv.slice(2);
    const cliConfig = await parseCliArgs(args);
    const cliConfigPath = getConfigPathFromArgs(args);
    
    // Load file configuration
    const fileConfig = await loadConfigFile(cliConfigPath);
    
    if (!fileConfig && !cliConfigPath) {
      if (process.env.VITEST_MCP_DEBUG) {
        console.error('No config file found, using defaults');
      }
    }

    // Merge in order: defaults < file < env < cli
    let merged = DEFAULT_CONFIG;
    
    if (fileConfig) {
      merged = mergeConfig(merged, fileConfig);
    }
    
    // Apply environment variable overrides
    const envConfig = loadEnvironmentConfig();
    merged = mergeConfig(merged, envConfig);
    
    // Apply CLI overrides (highest priority)
    merged = mergeConfig(merged, cliConfig);
    
    return merged;
  } catch (error) {
    console.error('Error loading configuration:', error);
    return DEFAULT_CONFIG;
  }
}

/**
 * Load configuration overrides from environment variables
 */
function loadEnvironmentConfig(): Partial<VitestMCPConfig> {
  const config: Partial<VitestMCPConfig> = {};
  
  // Test defaults
  if (process.env.VITEST_MCP_TEST_FORMAT) {
    config.testDefaults = config.testDefaults || {};
    config.testDefaults.format = process.env.VITEST_MCP_TEST_FORMAT as 'summary' | 'detailed';
  }
  
  
  if (process.env.VITEST_MCP_TEST_TIMEOUT) {
    config.testDefaults = config.testDefaults || {};
    config.testDefaults.timeout = parseInt(process.env.VITEST_MCP_TEST_TIMEOUT, 10);
  }
  
  
  // Server settings
  if (process.env.VITEST_MCP_VERBOSE) {
    config.server = config.server || {};
    config.server.verbose = process.env.VITEST_MCP_VERBOSE === 'true';
  }
  
  if (process.env.VITEST_MCP_WORKING_DIR) {
    config.server = config.server || {};
    config.server.workingDirectory = process.env.VITEST_MCP_WORKING_DIR;
  }
  
  return config;
}

// Export a singleton instance
let configInstance: ResolvedVitestMCPConfig | null = null;
let configArgs: string[] | undefined;

/**
 * Get the current configuration (cached with simple optimization)
 */
export async function getConfig(cliArgs?: string[]): Promise<ResolvedVitestMCPConfig> {
  const cliArgsString = JSON.stringify(cliArgs || []);
  const currentArgsString = JSON.stringify(configArgs || []);
  
  // Optimization: Only reload if args actually changed
  if (cliArgs && cliArgsString !== currentArgsString) {
    configArgs = cliArgs;
    configInstance = await loadConfiguration(cliArgs);
    
    if (process.env.VITEST_MCP_DEBUG) {
      console.error('[PERF] Config reloaded due to CLI args change');
    }
  } else if (!configInstance) {
    configInstance = await loadConfiguration(configArgs);
    
    if (process.env.VITEST_MCP_DEBUG) {
      console.error('[PERF] Config loaded for first time');
    }
  }
  
  return configInstance;
}

/**
 * Reset configuration cache (mainly for testing)
 */
export function resetConfig(): void {
  configInstance = null;
}