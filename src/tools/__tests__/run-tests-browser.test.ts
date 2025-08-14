import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleRunTests } from '../run-tests.js';
import { projectContext } from '../../context/project-context.js';
import * as fileUtils from '../../utils/file-utils.js';
import * as configLoader from '../../config/config-loader.js';
import * as versionChecker from '../../utils/version-checker.js';
import * as configFinder from '../../utils/config-finder.js';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

// Mock external dependencies
vi.mock('child_process');
vi.mock('../../utils/file-utils.js');
vi.mock('../../config/config-loader.js');
vi.mock('../../utils/version-checker.js');
vi.mock('../../utils/output-processor.js', () => ({
  processTestResult: vi.fn().mockImplementation((result, format) => Promise.resolve({
    command: result.command,
    success: result.exitCode === 0,
    summary: { totalTests: 1, passed: 1, failed: 0 },
    format: format,
    executionTimeMs: 100
  }))
}));
vi.mock('../../context/project-context.js');
vi.mock('../../utils/config-finder.js');
vi.mock('fs', () => ({
  writeFileSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue(''),
  existsSync: vi.fn().mockReturnValue(false),
  unlinkSync: vi.fn()
}));

describe('run-tests (project configuration respect)', () => {
  let mockChildProcess: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mocks
    vi.mocked(projectContext.getProjectRoot).mockReturnValue('/test/project');
    vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
    vi.mocked(fileUtils.isDirectory).mockResolvedValue(false);
    vi.mocked(configLoader.getConfig).mockResolvedValue({
      testDefaults: {
        format: 'summary' as const,
        timeout: 30000
      }
    } as any);
    vi.mocked(versionChecker.checkAllVersions).mockResolvedValue({
      errors: [],
      warnings: []
    } as any);
    vi.mocked(configFinder.findVitestConfig).mockResolvedValue(null);
    
    // Create mock child process
    mockChildProcess = new EventEmitter() as any;
    mockChildProcess.stdout = new EventEmitter();
    mockChildProcess.stderr = new EventEmitter();
    mockChildProcess.kill = vi.fn();
    mockChildProcess.killed = false;
    
    vi.mocked(spawn).mockReturnValue(mockChildProcess);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Project Configuration Respect', () => {
    it('should not force browser mode settings', async () => {
      // Arrange
      const args = {
        target: './src/components/Button.test.ts'
      };

      // Act - Start the test execution
      const testPromise = handleRunTests(args);
      
      // Simulate successful test execution
      setTimeout(() => {
        mockChildProcess.stdout.emit('data', Buffer.from('{"testResults":[]}'));
        mockChildProcess.emit('close', 0);
      }, 10);

      await testPromise;

      // Assert - Check that spawn was called without browser flags
      expect(spawn).toHaveBeenCalled();
      const spawnCall = vi.mocked(spawn).mock.calls[0];
      const [, spawnArgs] = spawnCall;
      
      // Should not contain browser-related flags
      expect(spawnArgs).not.toContain('--browser.headless=true');
      expect(spawnArgs).not.toContain('--browser.headless=false');
    });

    it('should respect project parameter without forcing browser settings', async () => {
      // Arrange
      const args = {
        target: './src/components',
        project: 'storybook'
      };

      // Act - Start the test execution
      const testPromise = handleRunTests(args);
      
      // Simulate successful test execution
      setTimeout(() => {
        mockChildProcess.stdout.emit('data', Buffer.from('{"testResults":[]}'));
        mockChildProcess.emit('close', 0);
      }, 10);

      await testPromise;

      // Assert - Check that project flag is present but no browser flags
      expect(spawn).toHaveBeenCalled();
      const spawnCall = vi.mocked(spawn).mock.calls[0];
      const [, spawnArgs] = spawnCall;
      
      expect(spawnArgs).toContain('--project');
      expect(spawnArgs).toContain('storybook');
      // Should not force browser settings
      expect(spawnArgs).not.toContain('--browser.headless=true');
      expect(spawnArgs).not.toContain('--browser.headless=false');
    });

    it('should handle showLogs option without forcing browser settings', async () => {
      // Arrange
      const args = {
        target: './src/utils',
        showLogs: true
      };

      // Act - Start the test execution
      const testPromise = handleRunTests(args);
      
      // Simulate successful test execution
      setTimeout(() => {
        mockChildProcess.stdout.emit('data', Buffer.from('{"testResults":[]}'));
        mockChildProcess.emit('close', 0);
      }, 10);

      await testPromise;

      // Assert - Check that showLogs works without forcing browser settings
      expect(spawn).toHaveBeenCalled();
      const spawnCall = vi.mocked(spawn).mock.calls[0];
      const [, spawnArgs] = spawnCall;
      
      // Should not force browser settings
      expect(spawnArgs).not.toContain('--browser.headless=true');
      expect(spawnArgs).not.toContain('--browser.headless=false');
      // Should still include console intercept flag for showLogs
      expect(spawnArgs).toContain('--disable-console-intercept');
    });

    it('should respect project browser configuration without forcing settings', async () => {
      // Arrange - Simulate a project with browser mode configuration
      vi.mocked(configFinder.findVitestConfig).mockResolvedValue('/test/project/vitest.config.ts');
      
      const args = {
        target: './tests',
        format: 'detailed' as const
      };

      // Act - Start the test execution
      const testPromise = handleRunTests(args);
      
      // Simulate test execution with browser mode config
      setTimeout(() => {
        mockChildProcess.stdout.emit('data', Buffer.from(JSON.stringify({
          testResults: [],
          config: {
            browser: {
              enabled: true,
              headless: false,
              provider: 'playwright'
            }
          }
        })));
        mockChildProcess.emit('close', 0);
      }, 10);

      await testPromise;

      // Assert - Verify we don't force browser settings
      expect(spawn).toHaveBeenCalled();
      const spawnCall = vi.mocked(spawn).mock.calls[0];
      const [, spawnArgs] = spawnCall;
      
      // Should not force browser settings - let project config handle it
      expect(spawnArgs).not.toContain('--browser.headless=true');
      expect(spawnArgs).not.toContain('--browser.headless=false');
      // Should still use JSON reporter
      expect(spawnArgs).toContain('--reporter=json');
    });
  });
});