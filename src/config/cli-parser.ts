import { VitestMCPConfig } from '../types/config-types.js';

/**
 * Parse command-line arguments into configuration overrides
 */
export async function parseCliArgs(args: string[]): Promise<Partial<VitestMCPConfig>> {
  const config: Partial<VitestMCPConfig> = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];
    
    switch (arg) {
      // Test defaults
      case '--format':
        if (nextArg && ['summary', 'detailed'].includes(nextArg)) {
          config.testDefaults = config.testDefaults || {};
          config.testDefaults.format = nextArg as 'summary' | 'detailed';
          i++;
        }
        break;
        
        
      case '--timeout':
        if (nextArg && !isNaN(parseInt(nextArg))) {
          config.testDefaults = config.testDefaults || {};
          config.testDefaults.timeout = parseInt(nextArg);
          i++;
        }
        break;
        
      // Coverage defaults
      case '--threshold':
        if (nextArg && !isNaN(parseInt(nextArg))) {
          config.coverageDefaults = config.coverageDefaults || {};
          config.coverageDefaults.threshold = parseInt(nextArg);
          i++;
        }
        break;
        
      case '--coverage-format':
        if (nextArg && ['summary', 'detailed'].includes(nextArg)) {
          config.coverageDefaults = config.coverageDefaults || {};
          config.coverageDefaults.format = nextArg as 'summary' | 'detailed';
          i++;
        }
        break;
        
      case '--include-details':
        config.coverageDefaults = config.coverageDefaults || {};
        config.coverageDefaults.includeDetails = true;
        break;
        
      // Server settings
      case '--verbose':
      case '-v':
        config.server = config.server || {};
        config.server.verbose = true;
        break;
        
      case '--quiet':
      case '-q':
        config.server = config.server || {};
        config.server.verbose = false;
        break;
        
      case '--validate-paths':
        config.server = config.server || {};
        config.server.validatePaths = true;
        break;
        
      case '--no-validate-paths':
        config.server = config.server || {};
        config.server.validatePaths = false;
        break;
        
      case '--allow-root':
        config.server = config.server || {};
        config.server.allowRootExecution = true;
        break;
        
      case '--working-dir':
      case '--cwd':
        if (nextArg) {
          config.server = config.server || {};
          config.server.workingDirectory = nextArg;
          i++;
        }
        break;
        
      // Safety settings
      case '--max-files':
        if (nextArg && !isNaN(parseInt(nextArg))) {
          config.safety = config.safety || {};
          config.safety.maxFiles = parseInt(nextArg);
          i++;
        }
        break;
        
      // Help
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
        
      // Version
      case '--version': {
        // Read version from package.json dynamically
        const packageJson = await import('../../package.json', { with: { type: 'json' } });
        console.log(`@djankies/vitest-mcp version ${packageJson.default.version}`);
        process.exit(0);
      }
    }
  }
  
  return config;
}

/**
 * Get config file path from CLI args if specified
 */
export function getConfigPathFromArgs(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--config' || args[i] === '-c') && args[i + 1]) {
      return args[i + 1];
    }
  }
  return undefined;
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
@djankies/vitest-mcp - Model Context Protocol server for Vitest

Usage:
  vitest-mcp [options]
  npx @djankies/vitest-mcp [options]

Options:
  Test Defaults:
    --format <format>          Default test output format (summary|detailed)
    --timeout <ms>            Test execution timeout in milliseconds

  Coverage Defaults:
    --threshold <percent>      Default coverage threshold (0-100)
    --coverage-format <fmt>    Default coverage format (summary|detailed)
    --include-details         Include detailed line-by-line analysis

  Server Settings:
    -v, --verbose             Enable verbose logging
    -q, --quiet               Disable verbose logging
    --validate-paths          Enable path validation (default)
    --no-validate-paths       Disable path validation
    --allow-root              Allow tests on project root
    --working-dir <path>      Set working directory
    --cwd <path>              Alias for --working-dir

  Safety Settings:
    --max-files <n>           Maximum files per test run

  Other Options:
    -h, --help                Show this help message
    --version                 Show version number

Examples:
  # Run with verbose logging
  vitest-mcp --verbose

  # Override timeout and format
  vitest-mcp --timeout 60000 --format detailed

  # Set coverage threshold and format
  vitest-mcp --threshold 90 --coverage-format detailed
`);
}