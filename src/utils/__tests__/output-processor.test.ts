import { describe, it, expect, beforeEach } from 'vitest';
import { VitestOutputProcessor, processTestResult } from '../output-processor.js';
import { RunTestsResult, TestResultContext, TestFormat } from '../../tools/run-tests.js';

describe('VitestOutputProcessor', () => {
  let processor: VitestOutputProcessor;
  let mockResult: RunTestsResult;
  let mockContext: TestResultContext;

  beforeEach(() => {
    // Arrange
    processor = new VitestOutputProcessor();
    
    mockResult = {
      command: 'npx vitest run test.ts',
      success: true,
      stdout: '',
      stderr: '',
      exitCode: 0,
      duration: 1000
    };

    mockContext = {
      isMultiFile: false,
      targetType: 'file',
      hasFailures: false,
      actualTestCount: 1,
      executionTime: 1000
    };
  });

  describe('Raw Format Processing', () => {
    it('should return stdout as-is when stderr is empty', () => {
      // Arrange
      mockResult.stdout = 'Test output here';
      mockResult.stderr = '';

      // Act
      const result = processor.process(mockResult, 'raw', mockContext);

      // Assert
      expect(result.processedOutput).toBe('Test output here');
      expect(result.format).toBe('raw');
    });

    it('should include stderr when present', () => {
      // Arrange
      mockResult.stdout = 'Test output here';
      mockResult.stderr = 'Error message';

      // Act
      const result = processor.process(mockResult, 'raw', mockContext);

      // Assert
      expect(result.processedOutput).toBe('Test output here\n\nSTDERR:\nError message');
      expect(result.format).toBe('raw');
    });

    it('should handle empty stdout with stderr', () => {
      // Arrange
      mockResult.stdout = '';
      mockResult.stderr = 'Error occurred';

      // Act
      const result = processor.process(mockResult, 'raw', mockContext);

      // Assert
      expect(result.processedOutput).toBe('\n\nSTDERR:\nError occurred');
    });

    it('should handle stderr with only whitespace', () => {
      // Arrange
      mockResult.stdout = 'Test output';
      mockResult.stderr = '   \n  \t  ';

      // Act
      const result = processor.process(mockResult, 'raw', mockContext);

      // Assert
      expect(result.processedOutput).toBe('Test output');
    });
  });

  describe('JSON Format Processing', () => {
    it('should parse valid Vitest JSON output', () => {
      // Arrange
      const validJson = {
        version: '1.0.0',
        success: true,
        numTotalTests: 3,
        numPassedTests: 3,
        numFailedTests: 0,
        numSkippedTests: 0,
        startTime: 1000,
        endTime: 2000,
        testResults: [{
          name: 'test.ts',
          status: 'passed' as const,
          startTime: 1000,
          endTime: 1500,
          assertionResults: [{
            ancestorTitles: ['describe block'],
            title: 'should work',
            fullName: 'describe block should work',
            status: 'passed' as const,
            duration: 100
          }]
        }]
      };
      mockResult.stdout = JSON.stringify(validJson);

      // Act
      const result = processor.process(mockResult, 'json', mockContext);

      // Assert
      const parsedOutput = JSON.parse(result.processedOutput);
      expect(parsedOutput.success).toBe(true);
      expect(parsedOutput.summary.total).toBe(3);
      expect(parsedOutput.summary.passed).toBe(3);
      expect(parsedOutput.summary.failed).toBe(0);
      expect(parsedOutput.summary.duration).toBe(1000);
      expect(result.summary?.totalTests).toBe(3);
      expect(result.summary?.passed).toBe(3);
      expect(result.summary?.failed).toBe(0);
    });

    it('should handle JSON with multiple test suites', () => {
      // Arrange
      const validJson = {
        version: '1.0.0',
        success: false,
        numTotalTests: 5,
        numPassedTests: 3,
        numFailedTests: 2,
        numSkippedTests: 0,
        startTime: 1000,
        endTime: 3000,
        testResults: [
          {
            name: 'test1.ts',
            status: 'passed' as const,
            startTime: 1000,
            endTime: 1500,
            assertionResults: [
              {
                ancestorTitles: ['Suite 1'],
                title: 'test 1',
                fullName: 'Suite 1 test 1',
                status: 'passed' as const,
                duration: 50
              },
              {
                ancestorTitles: ['Suite 1'],
                title: 'test 2',
                fullName: 'Suite 1 test 2',
                status: 'passed' as const,
                duration: 75
              }
            ]
          },
          {
            name: 'test2.ts',
            status: 'failed' as const,
            startTime: 1500,
            endTime: 3000,
            assertionResults: [
              {
                ancestorTitles: ['Suite 2'],
                title: 'test 3',
                fullName: 'Suite 2 test 3',
                status: 'passed' as const,
                duration: 100
              },
              {
                ancestorTitles: ['Suite 2'],
                title: 'test 4',
                fullName: 'Suite 2 test 4',
                status: 'failed' as const,
                duration: 200,
                failureMessages: ['Expected true but got false', 'Additional error details']
              },
              {
                ancestorTitles: ['Suite 2'],
                title: 'test 5',
                fullName: 'Suite 2 test 5',
                status: 'failed' as const,
                duration: 150,
                failureMessages: ['Test failed with assertion error']
              }
            ]
          }
        ]
      };
      mockResult.stdout = JSON.stringify(validJson);

      // Act
      const result = processor.process(mockResult, 'json', mockContext);

      // Assert
      const parsedOutput = JSON.parse(result.processedOutput);
      expect(parsedOutput.success).toBe(false);
      expect(parsedOutput.summary.total).toBe(5);
      expect(parsedOutput.summary.passed).toBe(3);
      expect(parsedOutput.summary.failed).toBe(2);
      expect(parsedOutput.testSuites).toHaveLength(2);
      expect(parsedOutput.testSuites[0].status).toBe('passed');
      expect(parsedOutput.testSuites[1].status).toBe('failed');
      expect(parsedOutput.testSuites[1].tests[1].failureMessages).toHaveLength(2);
    });

    it('should handle malformed JSON gracefully', () => {
      // Arrange
      mockResult.stdout = '{ invalid json content }';

      // Act
      const result = processor.process(mockResult, 'json', mockContext);

      // Assert
      expect(result.processedOutput).toContain('JSON parsing failed');
      expect(result.processedOutput).toContain('Raw output:');
      expect(result.processedOutput).toContain('{ invalid json content }');
    });

    it('should handle JSON mixed with other output', () => {
      // Arrange
      const validJson = {
        version: '1.0.0',
        success: true,
        numTotalTests: 1,
        numPassedTests: 1,
        numFailedTests: 0,
        numSkippedTests: 0,
        startTime: 1000,
        endTime: 1500,
        testResults: []
      };
      mockResult.stdout = `Starting tests...\n${JSON.stringify(validJson)}\nDone!`;

      // Act
      const result = processor.process(mockResult, 'json', mockContext);

      // Assert
      const parsedOutput = JSON.parse(result.processedOutput);
      expect(parsedOutput.success).toBe(true);
      expect(parsedOutput.summary.total).toBe(1);
    });

    it('should handle empty JSON output', () => {
      // Arrange
      mockResult.stdout = '';

      // Act
      const result = processor.process(mockResult, 'json', mockContext);

      // Assert
      expect(result.processedOutput).toBe('');
    });

    it('should limit failure messages in cleaned JSON', () => {
      // Arrange
      const validJson = {
        version: '1.0.0',
        success: false,
        numTotalTests: 1,
        numPassedTests: 0,
        numFailedTests: 1,
        numSkippedTests: 0,
        startTime: 1000,
        endTime: 2000,
        testResults: [{
          name: 'test.ts',
          status: 'failed' as const,
          startTime: 1000,
          endTime: 2000,
          assertionResults: [{
            ancestorTitles: ['test'],
            title: 'should fail',
            fullName: 'test should fail',
            status: 'failed' as const,
            failureMessages: ['Error 1', 'Error 2', 'Error 3', 'Error 4', 'Error 5']
          }]
        }]
      };
      mockResult.stdout = JSON.stringify(validJson);

      // Act
      const result = processor.process(mockResult, 'json', mockContext);

      // Assert
      const parsedOutput = JSON.parse(result.processedOutput);
      expect(parsedOutput.testSuites[0].tests[0].failureMessages).toHaveLength(3);
    });
  });

  describe('Summary Format Processing', () => {
    it('should create concise summary for successful tests', () => {
      // Arrange
      mockResult.stdout = `
✓ test 1
✓ test 2  
✓ test 3

Test Files  1 passed (1)
Tests  3 passed (3)
Time  1234ms
      `;
      mockResult.success = true;

      // Act
      const result = processor.process(mockResult, 'summary', mockContext);

      // Assert
      expect(result.processedOutput).toContain('✅ 3 tests passed');
      expect(result.processedOutput).toContain('in 1234ms');
      expect(result.summary?.totalTests).toBe(3);
      expect(result.summary?.passed).toBe(3);
      expect(result.summary?.failed).toBe(0);
    });

    it('should show failure details in summary format', () => {
      // Arrange
      mockResult.stdout = `
✓ test 1
✗ test 2
  Expected: true
  Received: false
✗ test 3
  AssertionError: Values not equal

Test Files  1 failed (1)
Tests  1 passed | 2 failed (3)
Time  2500ms
      `;
      mockResult.success = false;
      mockResult.exitCode = 1;

      // Act
      const result = processor.process(mockResult, 'summary', mockContext);

      // Assert
      expect(result.processedOutput).toContain('❌ 2/3 tests failed');
      expect(result.processedOutput).toContain('Failed tests:');
      expect(result.processedOutput).toContain('• test 2: Expected: true');
      expect(result.processedOutput).toContain('• test 3: AssertionError: Values not equal');
      expect(result.summary?.totalTests).toBe(3);
      expect(result.summary?.passed).toBe(1);
      expect(result.summary?.failed).toBe(2);
    });

    it('should include stderr in summary when test fails', () => {
      // Arrange
      mockResult.stdout = `
✗ test failed

Tests  1 failed (1)
      `;
      mockResult.stderr = 'npm WARN deprecated\nActual error message here';
      mockResult.success = false;

      // Act
      const result = processor.process(mockResult, 'summary', mockContext);

      // Assert
      expect(result.processedOutput).toContain('Errors:');
      expect(result.processedOutput).toContain('Actual error message here');
      expect(result.processedOutput).not.toContain('npm WARN');
    });

    it('should handle single test pass', () => {
      // Arrange
      mockResult.stdout = `
✓ single test

Tests  1 passed (1)
Time  500ms
      `;
      mockResult.success = true;

      // Act
      const result = processor.process(mockResult, 'summary', mockContext);

      // Assert
      expect(result.processedOutput).toContain('✅ 1 test passed');
      expect(result.processedOutput).not.toContain('tests passed'); // Should be singular
    });

    it('should handle single test failure', () => {
      // Arrange
      mockResult.stdout = `
✗ single test failed

Tests  1 failed (1)
      `;
      mockResult.success = false;

      // Act
      const result = processor.process(mockResult, 'summary', mockContext);

      // Assert
      expect(result.processedOutput).toContain('❌ 1/1 test failed');
      expect(result.processedOutput).not.toContain('tests failed'); // Should be singular
    });

    it('should not show timing for short duration tests', () => {
      // Arrange
      mockResult.stdout = `
✓ quick test

Tests  1 passed (1)
Time  50ms
      `;
      mockResult.success = true;

      // Act
      const result = processor.process(mockResult, 'summary', mockContext);

      // Assert
      expect(result.processedOutput).toContain('✅ 1 test passed');
      expect(result.processedOutput).not.toContain('in 50ms');
    });
  });

  describe('Detailed Format Processing', () => {
    it('should create comprehensive output for successful tests', () => {
      // Arrange
      mockResult.stdout = `
✓ test 1
✓ test 2
✓ test 3

Test Files  1 passed (1)
Tests  3 passed (3)
Time  1500ms
      `;
      mockResult.success = true;

      // Act
      const result = processor.process(mockResult, 'detailed', mockContext);

      // Assert
      expect(result.processedOutput).toContain('✅ Test execution successful');
      expect(result.processedOutput).toContain('Results: Total: 3 | Passed: 3');
      expect(result.processedOutput).toContain('Duration: 1500ms');
      expect(result.processedOutput).toContain('Test Details:');
      expect(result.processedOutput).toContain('✅ test 1');
      expect(result.processedOutput).toContain('✅ test 2');
      expect(result.processedOutput).toContain('✅ test 3');
    });

    it('should show failure details with full context', () => {
      // Arrange
      mockResult.stdout = `
✓ test 1
✗ test 2
  Expected: true
  Received: false
  at Object.toBe (test.ts:10:20)
  at processTicksAndRejections
✗ test 3
  AssertionError: Values not equal
  Expected: "hello"
  Received: "world"

Test Files  1 failed (1) 
Tests  1 passed | 2 failed (3)
Time  2000ms
      `;
      mockResult.success = false;

      // Act
      const result = processor.process(mockResult, 'detailed', mockContext);

      // Assert
      expect(result.processedOutput).toContain('❌ Test execution failed');
      expect(result.processedOutput).toContain('Results: Total: 3 | Passed: 1 | Failed: 2');
      expect(result.processedOutput).toContain('Failure Details:');
      expect(result.processedOutput).toContain('• test 2:');
      expect(result.processedOutput).toContain('  Expected: true');
      expect(result.processedOutput).toContain('  Received: false');
      expect(result.processedOutput).toContain('• test 3:');
      expect(result.processedOutput).toContain('  AssertionError: Values not equal');
    });

    it('should include coverage information when available', () => {
      // Arrange
      mockResult.stdout = `
✓ test with coverage

Test Files  1 passed (1)
Tests  1 passed (1)

Coverage:
All files       |   85.5 |   78.2 |   90.1 |   87.3
Time  1000ms
      `;
      mockResult.success = true;

      // Act
      const result = processor.process(mockResult, 'detailed', mockContext);

      // Assert
      expect(result.processedOutput).toContain('Coverage: Lines: 87.3% | Functions: 90.1% | Branches: 78.2% | Statements: 85.5%');
      expect(result.summary?.coverage?.lines).toBe(87.3);
      expect(result.summary?.coverage?.functions).toBe(90.1);
      expect(result.summary?.coverage?.branches).toBe(78.2);
      expect(result.summary?.coverage?.statements).toBe(85.5);
    });

    it('should include skipped tests in statistics', () => {
      // Arrange
      mockResult.stdout = `
✓ test 1
⚠ test 2 (skipped)
✗ test 3

Tests  1 passed | 1 failed | 1 skipped (3)
      `;
      mockResult.success = false;

      // Act
      const result = processor.process(mockResult, 'detailed', mockContext);

      // Assert
      expect(result.processedOutput).toContain('Results: Total: 3 | Passed: 1 | Failed: 1 | Skipped: 1');
      expect(result.summary?.skipped).toBe(1);
    });

    it('should include stderr with detailed format', () => {
      // Arrange
      mockResult.stdout = `
✗ test failed

Tests  1 failed (1)
      `;
      mockResult.stderr = 'npm WARN deprecated\nSome config warning\nActual error here';
      mockResult.success = false;

      // Act
      const result = processor.process(mockResult, 'detailed', mockContext);

      // Assert
      expect(result.processedOutput).toContain('Errors:');
      expect(result.processedOutput).toContain('Actual error here');
      expect(result.processedOutput).not.toContain('npm WARN');
    });

    it('should limit failure detail lines to prevent excessive output', () => {
      // Arrange
      const longFailureOutput = Array.from({ length: 10 }, (_, i) => `  Line ${i + 1} of failure`).join('\n');
      mockResult.stdout = `
✗ test with long failure
${longFailureOutput}

Tests  1 failed (1)
      `;
      mockResult.success = false;

      // Act
      const result = processor.process(mockResult, 'detailed', mockContext);

      // Assert
      expect(result.processedOutput).toContain('• test with long failure:');
      expect(result.processedOutput).toContain('... (5 more lines)');
      const failureSection = result.processedOutput.split('Failure Details:')[1];
      const failureLines = failureSection.split('\n').filter(line => line.startsWith('  Line'));
      expect(failureLines).toHaveLength(5);
    });
  });

  describe('Summary Extraction from Text', () => {
    it('should parse complex test result patterns', () => {
      // Arrange
      mockResult.stdout = `
 RUN  v1.0.0 /path/to/project

✓ test1.ts (2) 150ms
  ✓ Suite 1 > should work
  ✓ Suite 1 > should also work
✗ test2.ts (1) 200ms
  ✗ Suite 2 > should fail

Test Files  1 passed | 1 failed (2)
Tests  2 passed | 1 failed (3)  
Time  350ms (in thread)
      `;

      // Act
      const result = processor.process(mockResult, 'summary', mockContext);

      // Assert
      expect(result.summary?.totalTests).toBe(3);
      expect(result.summary?.passed).toBe(2);
      expect(result.summary?.failed).toBe(1);
    });

    it('should handle different time formats', () => {
      // Arrange
      mockResult.stdout = `
✓ test

Tests  1 passed (1)
Time  2.5s
      `;

      // Act
      const result = processor.process(mockResult, 'summary', mockContext);

      // Assert
      expect(result.summary?.duration).toBe(2500); // Should convert seconds to milliseconds
    });

    it('should extract test details with various status symbols', () => {
      // Arrange
      mockResult.stdout = `
✓ passing test
× failing test  
⚠ skipped test
✓ another passing test
Tests  2 passed | 1 failed | 1 skipped (4)
      `;

      // Act
      const result = processor.process(mockResult, 'detailed', mockContext);

      // Assert
      expect(result.processedOutput).toContain('✅ passing test');
      expect(result.processedOutput).toContain('❌ failing test');
      expect(result.processedOutput).toContain('⚠️ skipped test');
      expect(result.processedOutput).toContain('✅ another passing test');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty output gracefully', () => {
      // Arrange
      mockResult.stdout = '';
      mockResult.stderr = '';

      // Act
      const result = processor.process(mockResult, 'summary', mockContext);

      // Assert
      expect(result.processedOutput).toContain('✅ 0 tests passed');
      expect(result.summary?.totalTests).toBe(0);
    });

    it('should handle output with only whitespace', () => {
      // Arrange
      mockResult.stdout = '   \n\t  \n  ';
      mockResult.stderr = '';

      // Act
      const result = processor.process(mockResult, 'raw', mockContext);

      // Assert
      expect(result.processedOutput).toBe('   \n\t  \n  ');
    });

    it('should update context with actual test count', () => {
      // Arrange
      mockResult.stdout = `
Tests  5 passed (5)
      `;
      mockContext.actualTestCount = 0; // Initially unknown

      // Act
      const result = processor.process(mockResult, 'summary', mockContext);

      // Assert
      expect(result.context.actualTestCount).toBe(5);
    });

    it('should handle format fallback to detailed for unknown format', () => {
      // Arrange
      mockResult.stdout = `
✓ test

Tests  1 passed (1)
      `;

      // Act
      const result = processor.process(mockResult, 'unknown' as TestFormat, mockContext);

      // Assert
      expect(result.format).toBe('unknown');
      expect(result.processedOutput).toContain('✅ Test execution successful');
    });

    it('should filter irrelevant stderr content', () => {
      // Arrange
      mockResult.stderr = `
npm WARN deprecated package@1.0.0
(node:12345) ExperimentalWarning: Feature is experimental
coverage provider warning message
Some actual error message
      `;
      mockResult.success = false;

      // Act
      const result = processor.process(mockResult, 'summary', mockContext);

      // Assert
      expect(result.processedOutput).toContain('Some actual error message');
      expect(result.processedOutput).not.toContain('npm WARN');
      expect(result.processedOutput).not.toContain('ExperimentalWarning');
      expect(result.processedOutput).not.toContain('coverage provider');
    });
  });

  describe('Convenience Function', () => {
    it('should work through the convenience function', () => {
      // Arrange
      mockResult.stdout = `
✓ test

Tests  1 passed (1)
      `;

      // Act
      const result = processTestResult(mockResult, 'summary', mockContext);

      // Assert
      expect(result.format).toBe('summary');
      expect(result.processedOutput).toContain('✅ 1 test passed');
      expect(result.summary?.totalTests).toBe(1);
    });
  });
});