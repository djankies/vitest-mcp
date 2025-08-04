import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { handleRunTests, determineFormat, createExecutionContext, TestFormat, RunTestsArgs, TestExecutionContext } from '../run-tests.js';
import * as fileUtils from '../../utils/file-utils.js';
import * as outputProcessor from '../../utils/output-processor.js';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

// Mock modules
vi.mock('child_process');
vi.mock('../../utils/file-utils.js');
vi.mock('../../utils/output-processor.js');

// Type the mocked spawn function
const mockSpawn = vi.mocked(spawn);
const mockFileUtils = vi.mocked(fileUtils);
const mockOutputProcessor = vi.mocked(outputProcessor);

// Mock child process setup
function setupMockSpawn(stdout: string, stderr: string = '', exitCode: number = 0) {
  const mockChild = new EventEmitter() as any;
  mockChild.stdout = new EventEmitter();
  mockChild.stderr = new EventEmitter();
  mockChild.kill = vi.fn();
  
  mockSpawn.mockReturnValue(mockChild);
  
  // Simulate async data emission
  process.nextTick(() => {
    if (stdout) mockChild.stdout.emit('data', stdout);
    if (stderr) mockChild.stderr.emit('data', stderr);
    mockChild.emit('close', exitCode);
  });
  
  return mockChild;
}

describe('run-tests Format Parameter Testing', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock file system functions
    mockFileUtils.fileExists.mockResolvedValue(true);
    mockFileUtils.isDirectory.mockResolvedValue(false);
    mockFileUtils.findProjectRoot.mockResolvedValue('/mock/project');
    
    // Mock output processor to return the format that was passed in
    mockOutputProcessor.processTestResult.mockImplementation((result, format, context) => ({
      ...result,
      format,
      processedOutput: 'processed output',
      summary: {
        totalTests: 1,
        passed: 1,
        failed: 0,
        skipped: 0,
        duration: 1000
      },
      context: {
        ...context,
        actualTestCount: 1
      }
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllTimers();
  });

  describe('Format Parameter Validation', () => {
    it('should accept valid format values', async () => {
      // Arrange
      const validFormats: TestFormat[] = ['summary', 'detailed', 'json', 'raw'];
      setupMockSpawn('✓ test passed');
      
      for (const format of validFormats) {
        // Act
        const args: RunTestsArgs = { target: 'test.ts', format };
        const result = await handleRunTests(args);
        
        // Assert
        expect(result.format).toBe(format);
        expect(mockOutputProcessor.processTestResult).toHaveBeenCalledWith(
          expect.any(Object),
          format,
          expect.any(Object)
        );
      }
    });

    it('should use smart default format for single file', async () => {
      // Arrange
      setupMockSpawn('✓ test passed');
      mockFileUtils.isDirectory.mockResolvedValue(false);
      
      // Act
      const args: RunTestsArgs = { target: 'single-test.ts' };
      const result = await handleRunTests(args);
      
      // Assert
      expect(result.format).toBe('summary');
    });

    it('should use detailed format for multiple files', async () => {
      // Arrange
      setupMockSpawn('✓ test passed');
      mockFileUtils.isDirectory.mockResolvedValue(true);
      
      // Act
      const args: RunTestsArgs = { target: 'test-directory' };
      const result = await handleRunTests(args);
      
      // Assert
      expect(result.format).toBe('detailed');
    });

    it('should use detailed format when failures are detected', async () => {
      // Arrange
      setupMockSpawn('✗ test failed', '', 1);
      mockFileUtils.isDirectory.mockResolvedValue(false);
      
      // Act
      const args: RunTestsArgs = { target: 'test.ts' };
      const result = await handleRunTests(args);
      
      // Assert
      expect(result.format).toBe('detailed');
    });

    it('should override smart defaults when format is explicitly provided', async () => {
      // Arrange
      setupMockSpawn('✗ test failed', '', 1);
      mockFileUtils.isDirectory.mockResolvedValue(true);
      
      // Act
      const args: RunTestsArgs = { target: 'test-directory', format: 'json' };
      const result = await handleRunTests(args);
      
      // Assert
      expect(result.format).toBe('json');
    });
  });

  describe('Format-Specific Command Building', () => {
    it('should add --reporter=json for json format', async () => {
      // Arrange
      setupMockSpawn('{"success": true}');
      
      // Act
      const args: RunTestsArgs = { target: 'test.ts', format: 'json' };
      await handleRunTests(args);
      
      // Assert
      expect(mockSpawn).toHaveBeenCalledWith(
        'npx',
        expect.arrayContaining(['--reporter=json']),
        expect.any(Object)
      );
    });

    it('should add --reporter=verbose for summary format', async () => {
      // Arrange
      setupMockSpawn('✓ test passed');
      
      // Act
      const args: RunTestsArgs = { target: 'test.ts', format: 'summary' };
      await handleRunTests(args);
      
      // Assert
      expect(mockSpawn).toHaveBeenCalledWith(
        'npx',
        expect.arrayContaining(['--reporter=verbose']),
        expect.any(Object)
      );
    });

    it('should add --reporter=verbose for detailed format', async () => {
      // Arrange
      setupMockSpawn('✓ test passed');
      
      // Act
      const args: RunTestsArgs = { target: 'test.ts', format: 'detailed' };
      await handleRunTests(args);
      
      // Assert
      expect(mockSpawn).toHaveBeenCalledWith(
        'npx',
        expect.arrayContaining(['--reporter=verbose']),
        expect.any(Object)
      );
    });

    it('should not add specific reporter for raw format', async () => {
      // Arrange
      setupMockSpawn('raw vitest output');
      
      // Act
      const args: RunTestsArgs = { target: 'test.ts', format: 'raw' };
      await handleRunTests(args);
      
      // Assert
      const spawnArgs = mockSpawn.mock.calls[0][1];
      expect(spawnArgs).not.toContain('--reporter=json');
      expect(spawnArgs).not.toContain('--reporter=verbose');
    });
  });

  describe('Coverage Parameter Integration', () => {
    it('should add --coverage flag when coverage is enabled', async () => {
      // Arrange
      setupMockSpawn('✓ test passed with coverage');
      
      // Act
      const args: RunTestsArgs = { target: 'test.ts', coverage: true };
      await handleRunTests(args);
      
      // Assert
      expect(mockSpawn).toHaveBeenCalledWith(
        'npx',
        expect.arrayContaining(['--coverage']),
        expect.any(Object)
      );
    });

    it('should work with coverage and json format', async () => {
      // Arrange
      setupMockSpawn('✓ test passed with coverage');
      
      // Act
      const args: RunTestsArgs = { target: 'test.ts', coverage: true, format: 'json' };
      await handleRunTests(args);
      
      // Assert
      expect(mockSpawn).toHaveBeenCalledWith(
        'npx',
        expect.arrayContaining(['--coverage']),
        expect.any(Object)
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle missing target parameter', async () => {
      // Arrange & Act
      const args: RunTestsArgs = { target: '' };
      const result = await handleRunTests(args);
      
      // Assert
      expect(result.success).toBe(false);
      expect(result.stderr).toContain('Target parameter is required');
      expect(result.format).toBe('raw');
    });

    it('should handle non-existent target file', async () => {
      // Arrange
      mockFileUtils.fileExists.mockResolvedValue(false);
      
      // Act
      const args: RunTestsArgs = { target: 'nonexistent.ts' };
      const result = await handleRunTests(args);
      
      // Assert
      expect(result.success).toBe(false);
      expect(result.stderr).toContain('Target does not exist');
      expect(result.format).toBe('raw');
    });

    it('should handle project root targeting prevention', async () => {
      // Arrange
      mockFileUtils.isDirectory.mockResolvedValue(true);
      mockFileUtils.findProjectRoot.mockResolvedValue('/mock/project');
      
      // Act
      const args: RunTestsArgs = { target: '.' };
      const result = await handleRunTests(args);
      
      // Assert
      expect(result.success).toBe(false);
      expect(result.stderr).toContain('Cannot run tests on entire project root');
      expect(result.format).toBe('raw');
    });

    it('should handle command execution errors', async () => {
      // Arrange
      const mockChild = new EventEmitter() as any;
      mockChild.stdout = new EventEmitter();
      mockChild.stderr = new EventEmitter();
      mockChild.kill = vi.fn();
      mockSpawn.mockReturnValue(mockChild);
      
      process.nextTick(() => {
        mockChild.emit('error', new Error('Command failed'));
      });
      
      // Act
      const args: RunTestsArgs = { target: 'test.ts' };
      const result = await handleRunTests(args);
      
      // Assert
      expect(result.success).toBe(false);
      expect(result.stderr).toContain('Process error: Command failed');
    });

    it('should handle command timeout', async () => {
      // Arrange
      const mockChild = new EventEmitter() as any;
      mockChild.stdout = new EventEmitter();
      mockChild.stderr = new EventEmitter();
      mockChild.kill = vi.fn();
      mockSpawn.mockReturnValue(mockChild);
      
      // Act
      const args: RunTestsArgs = { target: 'test.ts' };
      const resultPromise = handleRunTests(args);
      
      // Fast-forward time to trigger timeout
      vi.advanceTimersByTime(30000);
      
      const result = await resultPromise;
      
      // Assert
      expect(result.success).toBe(false);
      expect(result.stderr).toContain('Command timed out');
      expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');
    });
  });

  describe('Smart Format Selection Logic', () => {
    it('should prioritize explicit format over smart defaults', () => {
      // Arrange
      const context: TestExecutionContext = {
        isMultiFile: true,
        targetType: 'directory'
      };
      
      // Act & Assert
      expect(determineFormat({ target: 'test', format: 'summary' }, context, true)).toBe('summary');
      expect(determineFormat({ target: 'test', format: 'json' }, context, false)).toBe('json');
    });

    it('should use detailed format for failures when no explicit format', () => {
      // Arrange
      const context: TestExecutionContext = {
        isMultiFile: false,
        targetType: 'file'
      };
      
      // Act & Assert
      expect(determineFormat({ target: 'test' }, context, true)).toBe('detailed');
    });

    it('should use detailed format for multi-file scenarios', () => {
      // Arrange
      const multiFileContext: TestExecutionContext = {
        isMultiFile: true,
        targetType: 'directory'
      };
      
      // Act & Assert
      expect(determineFormat({ target: 'test' }, multiFileContext)).toBe('detailed');
    });

    it('should use summary format for single file with no failures', () => {
      // Arrange
      const singleFileContext: TestExecutionContext = {
        isMultiFile: false,
        targetType: 'file'
      };
      
      // Act & Assert
      expect(determineFormat({ target: 'test' }, singleFileContext, false)).toBe('summary');
    });
  });

  describe('Context Creation', () => {
    it('should create correct execution context for file', async () => {
      // Arrange
      mockFileUtils.isDirectory.mockResolvedValue(false);
      
      // Act
      const context = await createExecutionContext('/path/to/test.ts');
      
      // Assert
      expect(context.isMultiFile).toBe(false);
      expect(context.targetType).toBe('file');
      expect(context.estimatedTestCount).toBeUndefined();
    });

    it('should create correct execution context for directory', async () => {
      // Arrange
      mockFileUtils.isDirectory.mockResolvedValue(true);
      
      // Act
      const context = await createExecutionContext('/path/to/tests');
      
      // Assert
      expect(context.isMultiFile).toBe(true);
      expect(context.targetType).toBe('directory');
      expect(context.estimatedTestCount).toBeUndefined();
    });
  });

  describe('Integration Tests - End-to-End MCP Functionality', () => {
    it('should handle complex success scenario with all formats', async () => {
      // Arrange
      const complexOutput = `
 RUN  v1.0.0 /project

✓ components/Button.test.ts (3) 120ms
  ✓ Button > should render correctly
  ✓ Button > should handle click events  
  ✓ Button > should apply custom styles
✓ utils/helpers.test.ts (2) 80ms
  ✓ helpers > should format date
  ✓ helpers > should validate email

Test Files  2 passed (2)
Tests  5 passed (5)
Time  200ms
      `;
      
      const formats: TestFormat[] = ['summary', 'detailed', 'json', 'raw'];
      
      for (const format of formats) {
        setupMockSpawn(complexOutput);
        mockOutputProcessor.processTestResult.mockReturnValue({
          command: 'npx vitest run src/',
          success: true,
          stdout: complexOutput,
          stderr: '',
          exitCode: 0,
          duration: 1500,
          format,
          processedOutput: `Processed output for ${format}`,
          summary: {
            totalTests: 5,
            passed: 5,
            failed: 0,
            skipped: 0,
            duration: 200
          },
          context: {
            isMultiFile: true,
            targetType: 'directory',
            hasFailures: false,
            actualTestCount: 5,
            executionTime: 1500
          }
        });

        // Act
        const args: RunTestsArgs = { target: 'src/', format };
        const result = await handleRunTests(args);

        // Assert
        expect(result.success).toBe(true);
        expect(result.format).toBe(format);
        expect(result.processedOutput).toBe(`Processed output for ${format}`);
        expect(result.summary?.totalTests).toBe(5);
        expect(result.summary?.passed).toBe(5);
        expect(result.summary?.failed).toBe(0);
        expect(result.context.isMultiFile).toBe(true);
        
        // Reset mocks for next iteration
        vi.clearAllMocks();
        mockFileUtils.fileExists.mockResolvedValue(true);
        mockFileUtils.isDirectory.mockResolvedValue(true);
        mockFileUtils.findProjectRoot.mockResolvedValue('/mock/project');
        mockOutputProcessor.processTestResult.mockImplementation((result, format, context) => ({
          ...result,
          format,
          processedOutput: `Processed output for ${format}`,
          summary: {
            totalTests: 5,
            passed: 5,
            failed: 0,
            skipped: 0,
            duration: 200
          },
          context: {
            ...context,
            actualTestCount: 5
          }
        }));
      }
    });

    it('should handle complex failure scenario with error details', async () => {
      // Arrange
      const failureOutput = `
 RUN  v1.0.0 /project

✓ components/Button.test.ts (2) 100ms
  ✓ Button > should render correctly
  ✓ Button > should handle click events
✗ components/Modal.test.ts (2) 150ms
  ✓ Modal > should open and close
  ✗ Modal > should handle escape key
    AssertionError: expected 'visible' to equal 'hidden'
    Expected: "hidden"
    Received: "visible"
    at /project/components/Modal.test.ts:25:18

Test Files  1 passed | 1 failed (2)
Tests  3 passed | 1 failed (4)
Time  250ms
      `;
      
      setupMockSpawn(failureOutput, '', 1);
      mockOutputProcessor.processTestResult.mockReturnValue({
        command: 'npx vitest run components/',
        success: false,
        stdout: failureOutput,
        stderr: '',
        exitCode: 1,
        duration: 2000,
        format: 'detailed',
        processedOutput: 'Detailed failure output with stack traces',
        summary: {
          totalTests: 4,
          passed: 3,
          failed: 1,
          skipped: 0,
          duration: 250
        },
        context: {
          isMultiFile: true,
          targetType: 'directory',
          hasFailures: true,
          actualTestCount: 4,
          executionTime: 2000
        }
      });

      // Act
      const args: RunTestsArgs = { target: 'components/' };
      const result = await handleRunTests(args);

      // Assert
      expect(result.success).toBe(false);
      expect(result.format).toBe('detailed'); // Should auto-select detailed for failures
      expect(result.processedOutput).toBe('Detailed failure output with stack traces');
      expect(result.summary?.failed).toBe(1);
      expect(result.context.hasFailures).toBe(true);
    });

    it('should handle coverage reporting integration', async () => {
      // Arrange
      const coverageOutput = `
✓ test.ts (1) 50ms
  ✓ should work with coverage

Tests  1 passed (1)
Coverage:
File       | % Stmts | % Branch | % Funcs | % Lines
-----------|---------|----------|---------|--------
test.ts    |   85.5  |   78.2   |   90.1  |   87.3
All files  |   85.5  |   78.2   |   90.1  |   87.3
Time  100ms
      `;
      
      setupMockSpawn(coverageOutput);
      mockOutputProcessor.processTestResult.mockReturnValue({
        command: 'npx vitest run test.ts --coverage',
        success: true,
        stdout: coverageOutput,
        stderr: '',
        exitCode: 0,
        duration: 1200,
        format: 'detailed',
        processedOutput: 'Coverage report included',
        summary: {
          totalTests: 1,
          passed: 1,
          failed: 0,
          skipped: 0,
          duration: 100,
          coverage: {
            lines: 87.3,
            functions: 90.1,
            branches: 78.2,
            statements: 85.5
          }
        },
        context: {
          isMultiFile: false,
          targetType: 'file',
          hasFailures: false,
          actualTestCount: 1,
          executionTime: 1200
        }
      });

      // Act
      const args: RunTestsArgs = { target: 'test.ts', coverage: true, format: 'detailed' };
      const result = await handleRunTests(args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.summary?.coverage).toBeDefined();
      expect(result.summary?.coverage?.lines).toBe(87.3);
      expect(mockSpawn).toHaveBeenCalledWith(
        'npx',
        expect.arrayContaining(['--coverage']),
        expect.any(Object)
      );
    });

    it('should handle mixed test results with skipped tests', async () => {
      // Arrange
      const mixedOutput = `
✓ test1.ts (1) 30ms
  ✓ should pass
✗ test2.ts (1) 40ms  
  ✗ should fail
⚠ test3.ts (1) 10ms
  ⚠ should skip

Test Files  1 passed | 1 failed | 1 skipped (3)
Tests  1 passed | 1 failed | 1 skipped (3)
Time  80ms
      `;
      
      setupMockSpawn(mixedOutput, '', 1);
      mockOutputProcessor.processTestResult.mockReturnValue({
        command: 'npx vitest run tests/',
        success: false,
        stdout: mixedOutput,
        stderr: '',
        exitCode: 1,
        duration: 1800,
        format: 'detailed',
        processedOutput: 'Mixed results with all statuses',
        summary: {
          totalTests: 3,
          passed: 1,
          failed: 1,
          skipped: 1,
          duration: 80
        },
        context: {
          isMultiFile: true,
          targetType: 'directory',
          hasFailures: true,
          actualTestCount: 3,
          executionTime: 1800
        }
      });

      // Act
      const args: RunTestsArgs = { target: 'tests/' };
      const result = await handleRunTests(args);

      // Assert
      expect(result.success).toBe(false);
      expect(result.summary?.passed).toBe(1);
      expect(result.summary?.failed).toBe(1);
      expect(result.summary?.skipped).toBe(1);
      expect(result.summary?.totalTests).toBe(3);
    });
  });

  describe('Edge Cases and Error Recovery', () => {
    it('should handle malformed JSON output gracefully', async () => {
      // Arrange
      const malformedJson = '{ "invalid": json, "missing": quotes }';
      setupMockSpawn(malformedJson);
      mockOutputProcessor.processTestResult.mockReturnValue({
        command: 'npx vitest run test.ts --reporter=json',
        success: false,
        stdout: malformedJson,
        stderr: '',
        exitCode: 0,
        duration: 1000,
        format: 'json',
        processedOutput: 'JSON parsing failed: Unexpected token',
        context: {
          isMultiFile: false,
          targetType: 'file',
          hasFailures: false,
          actualTestCount: 0,
          executionTime: 1000
        }
      });

      // Act
      const args: RunTestsArgs = { target: 'test.ts', format: 'json' };
      const result = await handleRunTests(args);

      // Assert
      expect(result.format).toBe('json');
      expect(result.processedOutput).toContain('JSON parsing failed');
    });

    it('should handle empty test output', async () => {
      // Arrange
      setupMockSpawn('');
      mockOutputProcessor.processTestResult.mockReturnValue({
        command: 'npx vitest run empty.ts',
        success: true,
        stdout: '',
        stderr: '',
        exitCode: 0,
        duration: 500,
        format: 'summary',
        processedOutput: '✅ 0 tests passed',
        summary: {
          totalTests: 0,
          passed: 0,
          failed: 0,
          skipped: 0,
          duration: 0
        },
        context: {
          isMultiFile: false,
          targetType: 'file',
          hasFailures: false,
          actualTestCount: 0,
          executionTime: 500
        }
      });

      // Act
      const args: RunTestsArgs = { target: 'empty.ts' };
      const result = await handleRunTests(args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.processedOutput).toContain('0 tests passed');
      expect(result.summary?.totalTests).toBe(0);
    });

    it('should handle stderr with warnings and errors', async () => {
      // Arrange
      const stdout = '✓ test passed\nTests  1 passed (1)';
      const stderr = `
npm WARN deprecated package@1.0.0
(node:1234) Warning: experimental feature
Real error: Configuration not found
Another real error message
      `;
      
      setupMockSpawn(stdout, stderr);
      mockOutputProcessor.processTestResult.mockReturnValue({
        command: 'npx vitest run test.ts',
        success: true,
        stdout,
        stderr,
        exitCode: 0,
        duration: 1000,
        format: 'detailed',
        processedOutput: 'Test passed with cleaned errors',
        summary: {
          totalTests: 1,
          passed: 1,
          failed: 0,
          skipped: 0,
          duration: 50
        },
        context: {
          isMultiFile: false,
          targetType: 'file',
          hasFailures: false,
          actualTestCount: 1,
          executionTime: 1000
        }
      });

      // Act
      const args: RunTestsArgs = { target: 'test.ts', format: 'detailed' };
      const result = await handleRunTests(args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.stderr).toBe(stderr);
      expect(mockOutputProcessor.processTestResult).toHaveBeenCalledWith(
        expect.objectContaining({ stderr }),
        'detailed',
        expect.any(Object)
      );
    });

    it('should handle very long test outputs', async () => {
      // Arrange
      const longOutput = Array.from({ length: 1000 }, (_, i) => `✓ test ${i + 1}`).join('\n') + '\nTests  1000 passed (1000)';
      setupMockSpawn(longOutput);
      mockOutputProcessor.processTestResult.mockReturnValue({
        command: 'npx vitest run large-suite/',
        success: true,
        stdout: longOutput,
        stderr: '',
        exitCode: 0,
        duration: 5000,
        format: 'summary',
        processedOutput: '✅ 1000 tests passed in 2000ms',
        summary: {
          totalTests: 1000,
          passed: 1000,
          failed: 0,
          skipped: 0,
          duration: 2000
        },
        context: {
          isMultiFile: true,
          targetType: 'directory',
          hasFailures: false,
          actualTestCount: 1000,
          executionTime: 5000
        }
      });

      // Act
      const args: RunTestsArgs = { target: 'large-suite/' };
      const result = await handleRunTests(args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.summary?.totalTests).toBe(1000);
      expect(result.context.actualTestCount).toBe(1000);
    });

    it('should handle partial command execution with mixed output', async () => {
      // Arrange
      const partialOutput = `
 RUN  v1.0.0 /project
Starting test execution...
✓ test1 passed
✗ test2 failed
Process interrupted
      `;
      
      setupMockSpawn(partialOutput, 'Process was terminated', 130);
      mockOutputProcessor.processTestResult.mockReturnValue({
        command: 'npx vitest run tests/',
        success: false,
        stdout: partialOutput,
        stderr: 'Process was terminated',
        exitCode: 130,
        duration: 3000,
        format: 'raw',
        processedOutput: partialOutput + '\n\nSTDERR:\nProcess was terminated',
        context: {
          isMultiFile: true,
          targetType: 'directory',
          hasFailures: true,
          actualTestCount: 0,
          executionTime: 3000
        }
      });

      // Act
      const args: RunTestsArgs = { target: 'tests/', format: 'raw' };
      const result = await handleRunTests(args);

      // Assert
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(130);
      expect(result.processedOutput).toContain('Process was terminated');
    });
  });

  describe('Format Validation and Smart Defaults', () => {
    it('should validate format parameter correctly in all scenarios', async () => {
      // Arrange
      const testScenarios = [
        { target: 'single.test.ts', isDir: false, hasFailures: false, expectedDefault: 'summary' },
        { target: 'tests/', isDir: true, hasFailures: false, expectedDefault: 'detailed' },
        { target: 'single.test.ts', isDir: false, hasFailures: true, expectedDefault: 'detailed' },
        { target: 'tests/', isDir: true, hasFailures: true, expectedDefault: 'detailed' }
      ];

      for (const scenario of testScenarios) {
        setupMockSpawn(scenario.hasFailures ? '✗ test failed' : '✓ test passed', '', scenario.hasFailures ? 1 : 0);
        mockFileUtils.isDirectory.mockResolvedValue(scenario.isDir);
        mockOutputProcessor.processTestResult.mockReturnValue({
          command: `npx vitest run ${scenario.target}`,
          success: !scenario.hasFailures,
          stdout: scenario.hasFailures ? '✗ test failed' : '✓ test passed',
          stderr: '',
          exitCode: scenario.hasFailures ? 1 : 0,
          duration: 1000,
          format: scenario.expectedDefault,
          processedOutput: 'processed',
          context: {
            isMultiFile: scenario.isDir,
            targetType: scenario.isDir ? 'directory' : 'file',
            hasFailures: scenario.hasFailures,
            actualTestCount: 1,
            executionTime: 1000
          }
        });

        // Act
        const args: RunTestsArgs = { target: scenario.target };
        const result = await handleRunTests(args);

        // Assert
        expect(result.format).toBe(scenario.expectedDefault);
        
        vi.clearAllMocks();
        mockFileUtils.fileExists.mockResolvedValue(true);
        mockFileUtils.findProjectRoot.mockResolvedValue('/mock/project');
      }
    });

    it('should ensure summary format produces valid output structure', async () => {
      // Arrange
      const standardOutput = '✓ test passed\nTests  1 passed (1)\nTime  100ms';
      setupMockSpawn(standardOutput);

      // Act
      const args: RunTestsArgs = { target: 'test.ts', format: 'summary' };
      const result = await handleRunTests(args);

      // Assert
      expect(result).toHaveProperty('command');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('stdout');
      expect(result).toHaveProperty('stderr');
      expect(result).toHaveProperty('exitCode');
      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('format');
      expect(result).toHaveProperty('processedOutput');
      expect(result).toHaveProperty('context');
      expect(result.format).toBe('summary');
    });

    it('should ensure json format produces valid output structure', async () => {
      // Arrange
      const standardOutput = '✓ test passed\nTests  1 passed (1)\nTime  100ms';
      setupMockSpawn(standardOutput);

      // Act
      const args: RunTestsArgs = { target: 'test.ts', format: 'json' };
      const result = await handleRunTests(args);

      // Assert
      expect(result).toHaveProperty('command');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('format');
      expect(result).toHaveProperty('processedOutput');
      expect(result).toHaveProperty('context');
      expect(result.format).toBe('json');
    });
  });
});