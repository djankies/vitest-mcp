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

describe('run-tests (browser mode handling)', () => {
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

  describe('Browser Headless Mode', () => {
    it('should add --browser.headless=true flag to vitest command', async () => {
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

      // Assert - Check that spawn was called with headless flag
      expect(spawn).toHaveBeenCalled();
      const spawnCall = vi.mocked(spawn).mock.calls[0];
      const [, spawnArgs] = spawnCall;
      
      expect(spawnArgs).toContain('--browser.headless=true');
    });

    it('should include headless flag even with project parameter', async () => {
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

      // Assert - Check that both project and headless flags are present
      expect(spawn).toHaveBeenCalled();
      const spawnCall = vi.mocked(spawn).mock.calls[0];
      const [, spawnArgs] = spawnCall;
      
      expect(spawnArgs).toContain('--project');
      expect(spawnArgs).toContain('storybook');
      expect(spawnArgs).toContain('--browser.headless=true');
    });

    it('should include headless flag with showLogs option', async () => {
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

      // Assert - Check that headless flag is still present with showLogs
      expect(spawn).toHaveBeenCalled();
      const spawnCall = vi.mocked(spawn).mock.calls[0];
      const [, spawnArgs] = spawnCall;
      
      expect(spawnArgs).toContain('--browser.headless=true');
      expect(spawnArgs).toContain('--disable-console-intercept');
    });

    it('should prevent browser window from opening in complex configs', async () => {
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

      // Assert - Verify headless flag overrides config
      expect(spawn).toHaveBeenCalled();
      const spawnCall = vi.mocked(spawn).mock.calls[0];
      const [, spawnArgs] = spawnCall;
      
      // The headless flag should be present to override any config
      expect(spawnArgs).toContain('--browser.headless=true');
      expect(spawnArgs).toContain('--reporter=json');
    });
  });
});