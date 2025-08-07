import { describe, it, vi, beforeEach, afterEach, expect } from 'vitest';
import * as cliParser from '../cli-parser';
import { readFile } from 'fs/promises';
import { homedir } from 'os';

// Mock dependencies
vi.mock('fs/promises');
vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/user')
}));
vi.mock('../cli-parser');

// Import after mocking to ensure mocks are applied
import { loadConfiguration, getConfig, resetConfig } from '../config-loader';

describe('config-loader', () => {
  let originalConsoleError: typeof console.error;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset config cache before each test
    resetConfig();
    
    // Mock console.error to suppress expected error messages during tests
    originalConsoleError = console.error;
    console.error = vi.fn();
    
    // Setup default mocks
    vi.mocked(cliParser.parseCliArgs).mockResolvedValue({});
    vi.mocked(cliParser.getConfigPathFromArgs).mockReturnValue(undefined);
    vi.mocked(homedir).mockReturnValue('/home/user');
    vi.mocked(readFile).mockRejectedValue(new Error('File not found'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    
    // Restore console.error
    console.error = originalConsoleError;
    
    // Clean up environment variables
    delete process.env.VITEST_MCP_CONFIG;
    delete process.env.VITEST_MCP_TEST_FORMAT;
    delete process.env.VITEST_MCP_TEST_TIMEOUT;
    delete process.env.VITEST_MCP_COVERAGE_THRESHOLD;
    delete process.env.VITEST_MCP_VERBOSE;
  });

  describe('loadConfiguration - Core Functionality', () => {
    it('should return default configuration when no config files exist', async () => {
      // Arrange
      vi.mocked(cliParser.parseCliArgs).mockResolvedValue({});
      vi.mocked(cliParser.getConfigPathFromArgs).mockReturnValue(undefined);

      // Act
      const config = await loadConfiguration([]);

      // Assert
      expect(config).toBeDefined();
      expect(config.testDefaults.format).toBe('summary');
      expect(config.testDefaults.timeout).toBe(30000);
      expect(config.server.verbose).toBe(false);
    });

    it('should load and parse valid JSON configuration file', async () => {
      // Arrange
      const fileConfig = { testDefaults: { format: 'detailed', timeout: 60000 } };
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(fileConfig));

      // Act
      const config = await loadConfiguration([]);

      // Assert
      expect(config.testDefaults.format).toBe('detailed');
      expect(config.testDefaults.timeout).toBe(60000);
    });

    it('should handle malformed JSON gracefully', async () => {
      // Arrange
      vi.mocked(readFile).mockResolvedValue('{ invalid json }');

      // Act
      const config = await loadConfiguration([]);

      // Assert
      expect(config).toBeDefined();
      expect(config.testDefaults.format).toBe('summary'); // Should fall back to defaults
    });

    it('should prioritize CLI args over file configuration', async () => {
      // Arrange
      const fileConfig = { testDefaults: { format: 'detailed' } };
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(fileConfig));
      vi.mocked(cliParser.parseCliArgs).mockResolvedValue({
        testDefaults: { format: 'summary' }
      });

      // Act
      const config = await loadConfiguration(['--format', 'summary']);

      // Assert
      expect(config.testDefaults.format).toBe('summary');
    });

    it('should load configuration from explicit CLI path', async () => {
      // Arrange
      const fileConfig = { testDefaults: { timeout: 45000 } };
      vi.mocked(cliParser.getConfigPathFromArgs).mockReturnValue('/custom/config.json');
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(fileConfig));

      // Act
      const config = await loadConfiguration(['--config', '/custom/config.json']);

      // Assert
      expect(config.testDefaults.timeout).toBe(45000);
    });
  });

  describe('Environment Variable Loading', () => {
    it('should load test format from environment variables', async () => {
      // Arrange
      process.env.VITEST_MCP_TEST_FORMAT = 'detailed';

      // Act
      const config = await loadConfiguration([]);

      // Assert
      expect(config.testDefaults.format).toBe('detailed');
    });

    it.skip('should load coverage threshold from environment variables', async () => {
      // Arrange
      process.env.VITEST_MCP_COVERAGE_THRESHOLD = '90';

      // Act
      const config = await loadConfiguration([]);

      // Assert
      expect(config.coverageDefaults.threshold).toBe(90);
      expect(config.coverageDefaults.thresholdsExplicitlySet).toBe(true);
    });

    it.skip('should load specific coverage thresholds from environment', async () => {
      // Arrange
      process.env.VITEST_MCP_COVERAGE_THRESHOLD_LINES = '85';
      process.env.VITEST_MCP_COVERAGE_THRESHOLD_BRANCHES = '75';

      // Act
      const config = await loadConfiguration([]);

      // Assert
      expect(config.coverageDefaults.thresholds.lines).toBe(85);
      expect(config.coverageDefaults.thresholds.branches).toBe(75);
      expect(config.coverageDefaults.thresholdsExplicitlySet).toBe(true);
    });

    it('should load server settings from environment variables', async () => {
      // Arrange
      process.env.VITEST_MCP_VERBOSE = 'true';
      process.env.VITEST_MCP_WORKING_DIR = '/custom/dir';

      // Act
      const config = await loadConfiguration([]);

      // Assert
      expect(config.server.verbose).toBe(true);
      expect(config.server.workingDirectory).toBe('/custom/dir');
    });

    it('should load configuration from environment variable path', async () => {
      // Arrange
      const fileConfig = { testDefaults: { timeout: 25000 } };
      process.env.VITEST_MCP_CONFIG = '/env/config.json';
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(fileConfig));

      // Act
      const config = await loadConfiguration([]);

      // Assert
      expect(config.testDefaults.timeout).toBe(25000);
    });
  });

  describe('Configuration Merging and Precedence', () => {
    it('should merge nested configuration objects correctly', async () => {
      // Arrange
      const fileConfig = {
        testDefaults: { format: 'detailed', timeout: 60000 }
      };
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(fileConfig));
      vi.mocked(cliParser.parseCliArgs).mockResolvedValue({
        testDefaults: { format: 'summary' } // Only override format
      });

      // Act
      const config = await loadConfiguration(['--format', 'summary']);

      // Assert
      expect(config.testDefaults.format).toBe('summary'); // CLI override
      expect(config.testDefaults.timeout).toBe(60000); // From file
    });

    it('should handle configuration hierarchy correctly', async () => {
      // Arrange
      const fileConfig = { testDefaults: { timeout: 45000 } };
      process.env.VITEST_MCP_TEST_FORMAT = 'detailed';
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(fileConfig));
      vi.mocked(cliParser.parseCliArgs).mockResolvedValue({
        server: { verbose: true }
      });

      // Act
      const config = await loadConfiguration(['--verbose']);

      // Assert
      // Defaults < file < env < CLI
      expect(config.testDefaults.timeout).toBe(45000); // From file
      expect(config.testDefaults.format).toBe('detailed'); // From env
      expect(config.server.verbose).toBe(true); // From CLI
    });

    it('should preserve default exclusion patterns when merging', async () => {
      // Arrange
      const fileConfig = {
        coverageDefaults: {}
      };
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(fileConfig));

      // Act
      const config = await loadConfiguration([]);

      // Assert
      expect(config.coverageDefaults.exclude).toContain('**/*.stories.*');
      expect(config.coverageDefaults.exclude).toContain('**/e2e/**');
    });

    it('should handle null and undefined values in merging', async () => {
      // Arrange
      const fileConfig = {
        testDefaults: { format: null, timeout: 50000 },
        coverageDefaults: {}
      };
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(fileConfig));

      // Act
      const config = await loadConfiguration([]);

      // Assert
      expect(config.testDefaults.format).toBe('summary'); // Should use default
      expect(config.testDefaults.timeout).toBe(50000); // Should use file value
    });
  });

  describe('Caching and Performance', () => {
    it('should cache configuration for repeated access', async () => {
      // Arrange
      const fileConfig = { testDefaults: { format: 'detailed' } };
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(fileConfig));

      // Act
      const config1 = await getConfig([]);
      const config2 = await getConfig([]);

      // Assert
      expect(config1).toBe(config2); // Should be same instance
      expect(vi.mocked(readFile)).toHaveBeenCalledTimes(1); // File should only be read once
    });

    it('should reload configuration when CLI args change', async () => {
      // Arrange
      vi.mocked(cliParser.parseCliArgs)
        .mockResolvedValueOnce({ testDefaults: { format: 'summary' } })
        .mockResolvedValueOnce({ testDefaults: { format: 'detailed' } });

      // Act
      const config1 = await getConfig(['--format', 'summary']);
      const config2 = await getConfig(['--format', 'detailed']);

      // Assert
      expect(config1.testDefaults.format).toBe('summary');
      expect(config2.testDefaults.format).toBe('detailed');
      expect(vi.mocked(cliParser.parseCliArgs)).toHaveBeenCalledTimes(2);
    });

    it('should not reload configuration for identical CLI args', async () => {
      // Arrange
      vi.mocked(cliParser.parseCliArgs).mockResolvedValue({
        testDefaults: { format: 'summary' }
      });

      // Act
      await getConfig(['--format', 'summary']);
      await getConfig(['--format', 'summary']);

      // Assert
      expect(vi.mocked(cliParser.parseCliArgs)).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle file permission errors gracefully', async () => {
      // Arrange
      const permissionError = new Error('Permission denied');
      (permissionError as any).code = 'EACCES';
      vi.mocked(readFile).mockRejectedValue(permissionError);

      // Act
      const config = await loadConfiguration([]);

      // Assert
      expect(config).toBeDefined();
      expect(config.testDefaults.format).toBe('summary'); // Should fall back to defaults
    });

    it('should handle explicit config file errors gracefully', async () => {
      // Arrange
      vi.mocked(cliParser.getConfigPathFromArgs).mockReturnValue('/explicit/config.json');
      vi.mocked(readFile).mockRejectedValue(new Error('File not found'));

      // Act
      const config = await loadConfiguration(['--config', '/explicit/config.json']);

      // Assert
      expect(config).toBeDefined();
      expect(config.testDefaults.format).toBe('summary'); // Should fall back to defaults
    });

    it('should handle environment config file errors gracefully', async () => {
      // Arrange
      process.env.VITEST_MCP_CONFIG = '/env/config.json';
      vi.mocked(readFile).mockRejectedValue(new Error('Access denied'));

      // Act
      const config = await loadConfiguration([]);

      // Assert
      expect(config).toBeDefined();
      expect(config.testDefaults.format).toBe('summary'); // Should fall back to defaults
    });
  });
});