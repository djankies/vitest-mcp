import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseCliArgs, getConfigPathFromArgs } from '../cli-parser.js';

describe('cli-parser', () => {
  let originalArgv: string[];
  let originalConsoleLog: typeof console.log;
  let originalProcessExit: typeof process.exit;
  
  beforeEach(() => {
    // Store original process.argv
    originalArgv = process.argv;
    originalConsoleLog = console.log;
    originalProcessExit = process.exit;
    
    // Mock console.log and process.exit to prevent actual exit/output during tests
    console.log = vi.fn();
    process.exit = vi.fn() as any;
  });

  afterEach(() => {
    // Restore original process.argv and functions
    process.argv = originalArgv;
    console.log = originalConsoleLog;
    process.exit = originalProcessExit;
    vi.clearAllMocks();
  });

  describe('parseCliArgs - Core Functionality', () => {
    it('should parse empty arguments array', async () => {
      // Arrange
      const args: string[] = [];
      
      // Act
      const result = await parseCliArgs(args);
      
      // Assert
      expect(result).toEqual({});
    });

    it('should parse format arguments', async () => {
      // Arrange
      const args = ['--format', 'detailed'];
      
      // Act
      const result = await parseCliArgs(args);
      
      // Assert
      expect(result).toEqual({
        testDefaults: {
          format: 'detailed'
        }
      });
    });

    it('should parse timeout arguments', async () => {
      // Arrange
      const args = ['--timeout', '5000'];
      
      // Act
      const result = await parseCliArgs(args);
      
      // Assert
      expect(result).toEqual({
        testDefaults: {
          timeout: 5000
        }
      });
    });

    it('should parse verbose flag', async () => {
      // Arrange
      const args = ['--verbose'];
      
      // Act
      const result = await parseCliArgs(args);
      
      // Assert
      expect(result).toEqual({
        server: {
          verbose: true
        }
      });
    });

    it('should parse short form verbose flag (-v)', async () => {
      // Arrange
      const args = ['-v'];
      
      // Act
      const result = await parseCliArgs(args);
      
      // Assert
      expect(result).toEqual({
        server: {
          verbose: true
        }
      });
    });

    it('should parse quiet flag', async () => {
      // Arrange
      const args = ['--quiet'];
      
      // Act
      const result = await parseCliArgs(args);
      
      // Assert
      expect(result).toEqual({
        server: {
          verbose: false
        }
      });
    });

    it.skip('should parse threshold arguments', async () => {
      // Arrange
      const args = ['--threshold', '90'];
      
      // Act
      const result = await parseCliArgs(args);
      
      // Assert
      expect(result).toEqual({
        coverageDefaults: {
          threshold: 90,
          thresholdsExplicitlySet: true
        }
      });
    });

    it('should parse coverage format arguments', async () => {
      // Arrange
      const args = ['--coverage-format', 'detailed'];
      
      // Act
      const result = await parseCliArgs(args);
      
      // Assert
      expect(result).toEqual({
        coverageDefaults: {
          format: 'detailed'
        }
      });
    });

    it.skip('should parse specific coverage thresholds', async () => {
      // Arrange
      const args = ['--coverage-threshold-lines', '85', '--coverage-threshold-branches', '75'];
      
      // Act
      const result = await parseCliArgs(args);
      
      // Assert
      expect(result).toEqual({
        coverageDefaults: {
          thresholds: {
            lines: 85,
            branches: 75
          },
          thresholdsExplicitlySet: true
        }
      });
    });

    it('should parse working directory arguments', async () => {
      // Arrange
      const args = ['--working-dir', '/path/to/project'];
      
      // Act
      const result = await parseCliArgs(args);
      
      // Assert
      expect(result).toEqual({
        server: {
          workingDirectory: '/path/to/project'
        }
      });
    });

    it('should parse max files argument', async () => {
      // Arrange
      const args = ['--max-files', '50'];
      
      // Act
      const result = await parseCliArgs(args);
      
      // Assert
      expect(result).toEqual({
        safety: {
          maxFiles: 50
        }
      });
    });

    it('should parse multiple flags', async () => {
      // Arrange
      const args = ['--verbose', '--timeout', '10000'];
      
      // Act
      const result = await parseCliArgs(args);
      
      // Assert
      expect(result).toEqual({
        server: {
          verbose: true
        },
        testDefaults: {
          timeout: 10000
        }
      });
    });

    it('should handle invalid format values', async () => {
      // Arrange
      const args = ['--format', 'invalid'];
      
      // Act
      const result = await parseCliArgs(args);
      
      // Assert
      expect(result).toEqual({});
    });

    it('should handle invalid numeric values', async () => {
      // Arrange
      const args = ['--timeout', 'invalid'];
      
      // Act
      const result = await parseCliArgs(args);
      
      // Assert
      expect(result).toEqual({});
    });

    it('should handle missing values for flags that require them', async () => {
      // Arrange
      const args = ['--timeout'];
      
      // Act
      const result = await parseCliArgs(args);
      
      // Assert
      expect(result).toEqual({});
    });

    it('should handle boolean flags correctly', async () => {
      // Arrange
      const args = ['--validate-paths', '--no-validate-paths', '--allow-root'];
      
      // Act
      const result = await parseCliArgs(args);
      
      // Assert
      expect(result).toEqual({
        server: {
          validatePaths: false, // last one wins
          allowRootExecution: true
        }
      });
    });
  });

  describe('getConfigPathFromArgs', () => {
    it('should extract config path with --config flag', () => {
      // Arrange
      const args = ['--config', '/path/to/config.json'];
      
      // Act
      const result = getConfigPathFromArgs(args);
      
      // Assert
      expect(result).toBe('/path/to/config.json');
    });

    it('should extract config path with -c shorthand', () => {
      // Arrange
      const args = ['-c', './config.json'];
      
      // Act
      const result = getConfigPathFromArgs(args);
      
      // Assert
      expect(result).toBe('./config.json');
    });

    it('should return undefined when no config path specified', () => {
      // Arrange
      const args = ['--verbose', '--timeout', '5000'];
      
      // Act
      const result = getConfigPathFromArgs(args);
      
      // Assert
      expect(result).toBeUndefined();
    });

    it('should handle missing config path value', () => {
      // Arrange
      const args = ['--config'];
      
      // Act
      const result = getConfigPathFromArgs(args);
      
      // Assert
      expect(result).toBeUndefined();
    });
  });
});