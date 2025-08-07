import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runTestsTool, handleRunTests, determineFormat, createExecutionContext, type RunTestsArgs, type TestExecutionContext } from '../run-tests.js';
import { projectContext } from '../../context/project-context.js';
import { processTestResult } from '../../utils/output-processor.js';
import * as fileUtils from '../../utils/file-utils.js';
import * as configLoader from '../../config/config-loader.js';
import * as versionChecker from '../../utils/version-checker.js';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs';

// Mock external dependencies
vi.mock('child_process');
vi.mock('../../utils/file-utils.js');
vi.mock('../../config/config-loader.js');
vi.mock('../../utils/version-checker.js');
vi.mock('../../utils/output-processor.js');
vi.mock('../../context/project-context.js');
vi.mock('fs');

// Create mock child process
function createMockChildProcess() {
  const mockChild = new EventEmitter() as any;
  mockChild.stdout = new EventEmitter();
  mockChild.stderr = new EventEmitter();
  mockChild.kill = vi.fn();
  mockChild.killed = false;
  return mockChild;
}

describe('run-tests (basic functionality)', () => {
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
    vi.mocked(processTestResult).mockImplementation(async (result, format, _context) => ({
      command: result.command,
      success: result.success,
      summary: { totalTests: 1, passed: 1, failed: 0 },
      format: format,
      executionTimeMs: 100
    }));
    
    // Setup fs mocks
    vi.mocked(writeFileSync).mockImplementation(() => {});
    vi.mocked(readFileSync).mockReturnValue('');
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(unlinkSync).mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Tool Definition', () => {
    it('should have correct name and description', () => {
      // Arrange & Act
      const tool = runTestsTool;
      
      // Assert
      expect(tool.name).toBe('run_tests');
      expect(tool.description).toContain('Execute Vitest tests');
      expect(tool.description).toContain('structured JSON output');
      expect(tool.description).toContain('safety guards');
    });

    it('should define proper input schema', () => {
      // Arrange & Act
      const schema = runTestsTool.inputSchema;
      
      // Assert
      expect(schema.type).toBe('object');
      expect(schema.properties).toBeDefined();
      expect(schema.properties.target).toBeDefined();
      expect(schema.properties.format).toBeDefined();
      expect(schema.properties.project).toBeDefined();
      expect(schema.properties.showLogs).toBeDefined();
    });

    it('should validate required parameters', () => {
      // Arrange & Act
      const schema = runTestsTool.inputSchema;
      
      // Assert
      expect(schema.required).toContain('target');
      expect(schema.required).toHaveLength(1);
    });

    it('should provide helpful parameter descriptions', () => {
      // Arrange & Act
      const props = runTestsTool.inputSchema.properties;
      
      // Assert
      expect(props.target.description).toContain('File path or directory to test');
      expect(props.format.description).toContain('Output format');
      expect(props.format.enum).toEqual(['summary', 'detailed']);
      expect(props.project.description).toContain('monorepo');
      expect(props.showLogs.description).toContain('console output');
    });
  });

  describe('Basic Test Execution', () => {
    beforeEach(() => {
      const mockChild = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(mockChild as any);
      
      // Reset the processTestResult mock to return success for these tests
      vi.mocked(processTestResult).mockImplementation(async (result, format, _context) => ({
        command: result.command,
        success: true,
        summary: { totalTests: 1, passed: 1, failed: 0 },
        format: format,
        executionTimeMs: 100
      }));
      
      // Simulate successful test execution
      setTimeout(() => {
        mockChild.stdout.emit('data', Buffer.from('{"numTotalTests":1,"numPassedTests":1,"numFailedTests":0,"success":true}'));
        mockChild.emit('close', 0);
      }, 10);
    });

    it('should run single test file successfully', async () => {
      // Arrange
      const args: RunTestsArgs = {
        target: './test.ts'
      };
      
      // Act
      const result = await handleRunTests(args);
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.command).toContain('test.ts');
      expect(spawn).toHaveBeenCalledWith(
        'npx',
        expect.arrayContaining(['vitest', 'run', 'test.ts', '--reporter=json']),
        expect.any(Object)
      );
    });

    it('should run multiple test files', async () => {
      // Arrange
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      const args: RunTestsArgs = {
        target: './tests'
      };
      
      // Act
      const result = await handleRunTests(args);
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.command).toContain('tests');
      expect(spawn).toHaveBeenCalledWith(
        'npx',
        expect.arrayContaining(['vitest', 'run', 'tests', '--reporter=json']),
        expect.any(Object)
      );
    });

    it('should run tests in specific directory', async () => {
      // Arrange
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      const args: RunTestsArgs = {
        target: './src/components'
      };
      
      // Act
      const result = await handleRunTests(args);
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.command).toContain('src/components');
      expect(fileUtils.isDirectory).toHaveBeenCalledWith('/test/project/src/components');
    });

    it('should handle glob patterns correctly', async () => {
      // Arrange
      const args: RunTestsArgs = {
        target: './**/*.test.ts'
      };
      
      // Act
      const result = await handleRunTests(args);
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.command).toContain('**/*.test.ts');
    });

    it('should pass through vitest options', async () => {
      // Arrange
      const args: RunTestsArgs = {
        target: './test.ts',
        project: 'web'
      };
      
      // Act
      await handleRunTests(args);
      
      // Assert
      expect(spawn).toHaveBeenCalledWith(
        'npx',
        expect.arrayContaining(['vitest', 'run', 'test.ts', '--reporter=json', '--project', 'web', '--browser.headless=true']),
        expect.any(Object)
      );
    });
  });

  describe('Output Format Selection', () => {
    it('should auto-select summary format for single file with all passing', async () => {
      // Arrange
      const args: RunTestsArgs = { target: './test.ts' };
      const context: TestExecutionContext = {
        isMultiFile: false,
        targetType: 'file'
      };
      
      // Act
      const format = await determineFormat(args, context, false);
      
      // Assert
      expect(format).toBe('summary');
    });

    it('should auto-select detailed format for failures', async () => {
      // Arrange
      const args: RunTestsArgs = { target: './test.ts' };
      const context: TestExecutionContext = {
        isMultiFile: false,
        targetType: 'file'
      };
      
      // Act
      const format = await determineFormat(args, context, true);
      
      // Assert
      expect(format).toBe('detailed');
    });

    it('should auto-select detailed format for multiple files', async () => {
      // Arrange
      const args: RunTestsArgs = { target: './tests' };
      const context: TestExecutionContext = {
        isMultiFile: true,
        targetType: 'directory'
      };
      
      // Act
      const format = await determineFormat(args, context, false);
      
      // Assert
      expect(format).toBe('detailed');
    });

    it('should respect explicit format parameter', async () => {
      // Arrange
      const args: RunTestsArgs = { 
        target: './tests',
        format: 'summary'
      };
      const context: TestExecutionContext = {
        isMultiFile: true,
        targetType: 'directory'
      };
      
      // Act
      const format = await determineFormat(args, context, true);
      
      // Assert
      expect(format).toBe('summary');
    });

    it('should validate format parameter values', () => {
      // Arrange & Act
      const formatEnum = runTestsTool.inputSchema.properties.format.enum;
      
      // Assert
      expect(formatEnum).toEqual(['summary', 'detailed']);
    });
  });

  describe('Project Context Integration', () => {
    beforeEach(() => {
      // Reset to default success mock for most tests in this group
      vi.mocked(processTestResult).mockImplementation(async (result, format, _context) => ({
        command: result.command,
        success: true,
        summary: { totalTests: 1, passed: 1, failed: 0 },
        format: format,
        executionTimeMs: 100
      }));
    });
    it('should validate project root is set', async () => {
      // Arrange
      const args: RunTestsArgs = { target: './test.ts' };
      
      // Act & Assert
      await expect(async () => {
        await handleRunTests(args);
      }).not.toThrow();
      
      expect(projectContext.getProjectRoot).toHaveBeenCalled();
    });

    it('should return helpful error when project root not set', async () => {
      // Arrange
      vi.mocked(projectContext.getProjectRoot).mockImplementation(() => {
        throw new Error('Project root has not been set');
      });
      vi.mocked(processTestResult).mockImplementation(async (result, _format, _context) => ({
        command: result.command,
        success: false,
        summary: { totalTests: 0, passed: 0, failed: 0 },
        format: 'detailed' as const,
        executionTimeMs: 100
      }));
      const args: RunTestsArgs = { target: './test.ts' };
      
      // Act
      const result = await handleRunTests(args);
      
      // Assert
      expect(result.success).toBe(false);
      expect(result.command).toBeDefined();
      expect(processTestResult).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          stderr: expect.stringContaining('Invalid target path')
        }),
        'detailed',
        expect.any(Object)
      );
    });

    it('should use project root for relative path resolution', async () => {
      // Arrange
      const args: RunTestsArgs = { target: './src/test.ts' };
      
      // Act
      await handleRunTests(args);
      
      // Assert
      expect(fileUtils.fileExists).toHaveBeenCalledWith('/test/project/src/test.ts');
    });

    it('should handle project root changes between calls', async () => {
      // Arrange
      const args1: RunTestsArgs = { target: './test1.ts' };
      const args2: RunTestsArgs = { target: './test2.ts' };
      
      // Act
      await handleRunTests(args1);
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue('/different/project');
      await handleRunTests(args2);
      
      // Assert
      expect(projectContext.getProjectRoot).toHaveBeenCalledTimes(2);
      expect(fileUtils.fileExists).toHaveBeenCalledWith('/test/project/test1.ts');
      expect(fileUtils.fileExists).toHaveBeenCalledWith('/different/project/test2.ts');
    });
  });

  describe('Basic Error Handling', () => {
    it('should handle non-existent test files gracefully', async () => {
      // Arrange
      vi.mocked(fileUtils.fileExists).mockResolvedValue(false);
      vi.mocked(processTestResult).mockImplementation(async (result, _format, _context) => ({
        command: result.command,
        success: false,
        summary: { totalTests: 0, passed: 0, failed: 0 },
        format: 'detailed' as const,
        executionTimeMs: 100
      }));
      const args: RunTestsArgs = { target: './nonexistent.ts' };
      
      // Act
      const result = await handleRunTests(args);
      
      // Assert
      expect(result.success).toBe(false);
      expect(processTestResult).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          stderr: expect.stringContaining('Target does not exist')
        }),
        'detailed',
        expect.any(Object)
      );
    });

    it('should handle invalid path arguments', async () => {
      // Arrange
      vi.mocked(processTestResult).mockImplementation(async (result, _format, _context) => ({
        command: result.command,
        success: false,
        summary: { totalTests: 0, passed: 0, failed: 0 },
        format: 'detailed' as const,
        executionTimeMs: 100
      }));
      const args: RunTestsArgs = { target: '' };
      
      // Act
      const result = await handleRunTests(args);
      
      // Assert
      expect(result.success).toBe(false);
      expect(processTestResult).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          stderr: expect.stringContaining('Target parameter is required')
        }),
        'detailed',
        expect.any(Object)
      );
    });

    it('should provide clear error messages for common issues', async () => {
      // Arrange
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(processTestResult).mockImplementation(async (result, _format, _context) => ({
        command: result.command,
        success: false,
        summary: { totalTests: 0, passed: 0, failed: 0 },
        format: 'detailed' as const,
        executionTimeMs: 100
      }));
      const args: RunTestsArgs = { target: './' };
      
      // Act
      const result = await handleRunTests(args);
      
      // Assert
      expect(result.success).toBe(false);
      expect(processTestResult).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          stderr: expect.stringContaining('Cannot run tests on entire project root')
        }),
        'detailed',
        expect.any(Object)
      );
    });

    it('should handle permission errors', async () => {
      // Arrange
      const permissionError = new Error('EACCES: permission denied');
      vi.mocked(fileUtils.fileExists).mockRejectedValue(permissionError);
      vi.mocked(processTestResult).mockImplementation(async (result, _format, _context) => ({
        command: result.command,
        success: false,
        summary: { totalTests: 0, passed: 0, failed: 0 },
        format: 'detailed' as const,
        executionTimeMs: 100
      }));
      const args: RunTestsArgs = { target: './test.ts' };
      
      // Act
      const result = await handleRunTests(args);
      
      // Assert
      expect(result.success).toBe(false);
      expect(processTestResult).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          stderr: expect.stringContaining('EACCES: permission denied')
        }),
        'detailed',
        expect.any(Object)
      );
    });
  });

  describe('Response Structure', () => {
    beforeEach(() => {
      // Reset to default success mock
      vi.mocked(processTestResult).mockImplementation(async (result, format, _context) => ({
        command: result.command,
        success: true,
        summary: { totalTests: 1, passed: 1, failed: 0 },
        format: format,
        executionTimeMs: 100
      }));
    });
    it('should return consistent response structure', async () => {
      // Arrange
      const args: RunTestsArgs = { target: './test.ts' };
      
      // Act
      const result = await handleRunTests(args);
      
      // Assert
      expect(result).toHaveProperty('command');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('format');
      expect(result).toHaveProperty('executionTimeMs');
    });

    it('should include command information', async () => {
      // Arrange
      const args: RunTestsArgs = { target: './test.ts', project: 'web' };
      
      // Act
      const result = await handleRunTests(args);
      
      // Assert
      expect(result.command).toContain('vitest run');
      expect(result.command).toContain('test.ts');
    });

    it('should include execution context', async () => {
      // Arrange
      const args: RunTestsArgs = { target: './test.ts' };
      
      // Act
      const result = await handleRunTests(args);
      
      // Assert
      expect(result.format).toBeDefined();
      expect(['summary', 'detailed']).toContain(result.format);
      expect(result.executionTimeMs).toBeTypeOf('number');
    });

    it('should include test summary', async () => {
      // Arrange
      const args: RunTestsArgs = { target: './test.ts' };
      
      // Act
      const result = await handleRunTests(args);
      
      // Assert
      expect(result.summary).toHaveProperty('totalTests');
      expect(result.summary).toHaveProperty('passed');
      expect(result.summary).toHaveProperty('failed');
      expect(result.summary.totalTests).toBeTypeOf('number');
      expect(result.summary.passed).toBeTypeOf('number');
      expect(result.summary.failed).toBeTypeOf('number');
    });

    it('should conditionally include detailed results', async () => {
      // Arrange
      vi.mocked(processTestResult).mockResolvedValueOnce({
        command: 'vitest run test.ts',
        success: false,
        summary: { totalTests: 1, passed: 0, failed: 1 },
        format: 'detailed' as const,
        executionTimeMs: 100,
        testResults: {
          failedTests: [{
            file: 'test.ts',
            tests: [{
              testName: 'failing test',
              errorType: 'AssertionError',
              message: 'Test failed'
            }]
          }]
        }
      });
      const args: RunTestsArgs = { target: './test.ts' };
      
      // Act
      const result = await handleRunTests(args);
      
      // Assert
      expect(result.testResults).toBeDefined();
      expect(result.testResults?.failedTests).toBeDefined();
    });
  });

  describe('Path Handling', () => {
    beforeEach(() => {
      // Reset to default success mock
      vi.mocked(processTestResult).mockImplementation(async (result, format, _context) => ({
        command: result.command,
        success: true,
        summary: { totalTests: 1, passed: 1, failed: 0 },
        format: format,
        executionTimeMs: 100
      }));
    });
    it('should resolve relative paths against project root', async () => {
      // Arrange
      const args: RunTestsArgs = { target: './src/test.ts' };
      
      // Act
      await handleRunTests(args);
      
      // Assert
      expect(fileUtils.fileExists).toHaveBeenCalledWith('/test/project/src/test.ts');
    });

    it('should handle absolute paths correctly', async () => {
      // Arrange
      const args: RunTestsArgs = { target: '/absolute/path/test.ts' };
      
      // Act
      await handleRunTests(args);
      
      // Assert
      expect(fileUtils.fileExists).toHaveBeenCalledWith('/absolute/path/test.ts');
    });

    it('should normalize path separators', async () => {
      // Arrange
      const args: RunTestsArgs = { target: './src\\test.ts' };
      
      // Act
      const result = await handleRunTests(args);
      
      // Assert
      expect(result.command).toContain('src');
      expect(result.command).toContain('test.ts');
    });

    it('should validate path security', async () => {
      // Arrange - Trying to use path traversal
      const args: RunTestsArgs = { target: '../../../etc/passwd' };
      
      // Act
      await handleRunTests(args);
      
      // Assert
      expect(fileUtils.fileExists).toHaveBeenCalled();
      // The specific path validation is handled by file-utils
    });
  });

  describe('Vitest Integration', () => {
    beforeEach(() => {
      const mockChild = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(mockChild as any);
      
      // Reset the processTestResult mock to return success for these tests
      vi.mocked(processTestResult).mockImplementation(async (result, format, _context) => ({
        command: result.command,
        success: true,
        summary: { totalTests: 1, passed: 1, failed: 0 },
        format: format,
        executionTimeMs: 100
      }));
      
      setTimeout(() => {
        mockChild.stdout.emit('data', Buffer.from('{"success":true}'));
        mockChild.emit('close', 0);
      }, 10);
    });

    it('should execute vitest with correct arguments', async () => {
      // Arrange
      const args: RunTestsArgs = { target: './test.ts' };
      
      // Act
      await handleRunTests(args);
      
      // Assert
      expect(spawn).toHaveBeenCalledWith(
        'npx',
        ['vitest', 'run', 'test.ts', '--reporter=json', '--browser.headless=true'],
        expect.objectContaining({
          cwd: '/test/project',
          stdio: ['ignore', 'pipe', 'pipe']
        })
      );
    });

    it('should use JSON reporter by default', async () => {
      // Arrange
      const args: RunTestsArgs = { target: './test.ts' };
      
      // Act
      await handleRunTests(args);
      
      // Assert
      expect(spawn).toHaveBeenCalledWith(
        'npx',
        expect.arrayContaining(['--reporter=json']),
        expect.any(Object)
      );
    });

    it('should handle vitest configuration files', async () => {
      // Arrange
      const mockChild = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(mockChild as any);
      
      // Create a promise that resolves when the mock child closes
      const childProcess = new Promise<void>((resolve) => {
        setTimeout(() => {
          mockChild.stdout.emit('data', Buffer.from('{"success":true}'));
          mockChild.emit('close', 0);
          resolve();
        }, 10);
      });
      
      const args: RunTestsArgs = { 
        target: './test.ts',
        showLogs: true
      };
      
      // Act
      const resultPromise = handleRunTests(args);
      await childProcess; // Wait for the mock child process to emit events
      await resultPromise;
      
      // Assert
      expect(spawn).toHaveBeenCalledWith(
        'npx',
        expect.arrayContaining(['--config']),
        expect.any(Object)
      );
    });

    it('should respect vitest workspace configurations', async () => {
      // Arrange
      const args: RunTestsArgs = { 
        target: './test.ts',
        project: 'web'
      };
      
      // Act
      await handleRunTests(args);
      
      // Assert
      expect(spawn).toHaveBeenCalledWith(
        'npx',
        expect.arrayContaining(['--project', 'web']),
        expect.any(Object)
      );
    });
  });

  describe('Utility Functions', () => {
    it('should create execution context for file', async () => {
      // Arrange
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(false);
      
      // Act
      const context = await createExecutionContext('/test/project/test.ts');
      
      // Assert
      expect(context.isMultiFile).toBe(false);
      expect(context.targetType).toBe('file');
      expect(context.estimatedTestCount).toBeUndefined();
    });

    it('should create execution context for directory', async () => {
      // Arrange
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      
      // Act
      const context = await createExecutionContext('/test/project/tests');
      
      // Assert
      expect(context.isMultiFile).toBe(true);
      expect(context.targetType).toBe('directory');
      expect(context.estimatedTestCount).toBeUndefined();
    });
  });
});