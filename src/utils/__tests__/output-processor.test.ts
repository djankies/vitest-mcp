import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VitestOutputProcessor } from '../output-processor.js';
import type { RunTestsResult, TestResultContext } from '../../tools/run-tests.js';

describe('VitestOutputProcessor', () => {
  let processor: VitestOutputProcessor;
  
  beforeEach(() => {
    processor = new VitestOutputProcessor();
    vi.clearAllMocks();
  });

  describe('JSON parsing', () => {
    it('should parse valid Vitest JSON output', async () => {
      const validJson = '{"numTotalTests":5,"numPassedTests":3,"numFailedTests":2,"success":false,"testResults":[]}';
      const result: RunTestsResult = {
        command: 'vitest run',
        success: false,
        exitCode: 1,
        stdout: validJson,
        stderr: '',
        duration: 1.5
      };
      
      const processed = await processor.process(result, 'summary', {} as TestResultContext);
      
      expect(processed.success).toBe(false);
      expect(processed.summary).toContain('failed');
      expect(processed.testSummary.totalTests).toBe(5);
      expect(processed.testSummary.passed).toBe(3);
      expect(processed.testSummary.failed).toBe(2);
    });

    it('should handle malformed JSON gracefully', async () => {
      const result: RunTestsResult = {
        command: 'vitest run',
        success: false,
        exitCode: 1,
        stdout: 'invalid json output',
        stderr: '',
        duration: 1.0
      };
      
      const processed = await processor.process(result, 'summary', {} as TestResultContext);
      
      expect(processed.testSummary.totalTests).toBe(0);
      expect(processed.testSummary.passed).toBe(0);
      expect(processed.testSummary.failed).toBe(0);
    });

    it('should extract JSON from mixed output', async () => {
      const mixedOutput = `
        Some console output
        {"numTotalTests":2,"numPassedTests":2,"numFailedTests":0,"success":true,"testResults":[]}
        More console output
      `;
      const result: RunTestsResult = {
        command: 'vitest run',
        success: true,
        exitCode: 0,
        stdout: mixedOutput,
        stderr: '',
        duration: 0.8
      };
      
      const processed = await processor.process(result, 'summary', {} as TestResultContext);
      
      expect(processed.success).toBe(true);
      expect(processed.testSummary.totalTests).toBe(2);
      expect(processed.testSummary.passed).toBe(2);
      expect(processed.testSummary.failed).toBe(0);
    });
  });

  describe('test result processing', () => {
    it('should process successful test runs', async () => {
      const jsonData = {
        "numTotalTests": 3,
        "numPassedTests": 3,
        "numFailedTests": 0,
        "success": true,
        "testResults": []
      };
      
      const result: RunTestsResult = {
        command: 'vitest run',
        success: true,
        exitCode: 0,
        stdout: JSON.stringify(jsonData),
        stderr: '',
        duration: 1.2
      };
      
      const processed = await processor.process(result, 'summary', {} as TestResultContext);
      
      expect(processed.success).toBe(true);
      expect(processed.testSummary.totalTests).toBe(3);
      expect(processed.testSummary.passed).toBe(3);
      expect(processed.testSummary.failed).toBe(0);
      expect(processed.testResults).toBeUndefined(); // No failures to report
    });

    it('should process failed tests with detailed format', async () => {
      const jsonData = {
        "numTotalTests": 2,
        "numPassedTests": 1,
        "numFailedTests": 1,
        "success": false,
        "testResults": [
          {
            "name": "/path/to/test.ts",
            "status": "failed",
            "assertionResults": [
              {
                "title": "should work",
                "fullName": "test suite should work",
                "status": "failed",
                "failureMessages": ["AssertionError: expected 4 to be 5"]
              }
            ]
          }
        ]
      };
      
      const result: RunTestsResult = {
        command: 'vitest run',
        success: false,
        exitCode: 1,
        stdout: JSON.stringify(jsonData),
        stderr: '',
        duration: 1.8
      };
      
      const processed = await processor.process(result, 'detailed', {} as TestResultContext);
      
      expect(processed.success).toBe(false);
      expect(processed.testSummary.failed).toBe(1);
      expect(processed.testResults?.failedTests).toBeDefined();
      expect(processed.testResults?.failedTests?.[0].tests[0]).toMatchObject({
        testName: "test suite should work",
        errorType: "AssertionError"
      });
    });

    it('should handle skipped tests', async () => {
      const jsonData = {
        "numTotalTests": 3,
        "numPassedTests": 2,
        "numFailedTests": 0,
        "numSkippedTests": 1,
        "success": true,
        "testResults": [
          {
            "name": "/path/to/test.ts",
            "status": "passed",
            "assertionResults": [
              {
                "title": "should be skipped",
                "fullName": "test suite should be skipped",
                "status": "skipped"
              }
            ]
          }
        ]
      };
      
      const result: RunTestsResult = {
        command: 'vitest run',
        success: true,
        exitCode: 0,
        stdout: JSON.stringify(jsonData),
        stderr: '',
        duration: 0.5
      };
      
      const processed = await processor.process(result, 'summary', {} as TestResultContext);
      
      expect(processed.testSummary.skipped).toBe(1);
      expect(processed.testResults?.skippedTests).toBeDefined();
      expect(processed.testResults?.skippedTests?.[0].tests[0].testName).toBe("test suite should be skipped");
    });
  });

  describe('error handling', () => {
    it('should handle empty output', async () => {
      const result: RunTestsResult = {
        command: 'vitest run',
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: '',
        duration: 0.1
      };
      
      const processed = await processor.process(result, 'summary', {} as TestResultContext);
      
      expect(processed.testSummary.totalTests).toBe(0);
      expect(processed.success).toBe(false);
    });

    it('should preserve execution metadata', async () => {
      const result: RunTestsResult = {
        command: 'vitest run --reporter=json',
        success: true,
        exitCode: 0,
        stdout: '{"numTotalTests":1,"numPassedTests":1,"numFailedTests":0,"success":true,"testResults":[]}',
        stderr: '',
        duration: 2.5
      };
      
      const processed = await processor.process(result, 'detailed', {} as TestResultContext);
      
      expect(processed.command).toBe('vitest run --reporter=json');
      expect(processed.format).toBe('detailed');
      expect(processed.executionTimeMs).toBe(2.5);
    });
  });

  describe('report file and error reporting', () => {
    const base = { command: 'vitest run', success: true, stderr: '', duration: 1 };

    it('prefers the report file over stdout', async () => {
      const processed = await processor.process(
        {
          ...base,
          exitCode: 0,
          stdout: 'JSON report written to .vitest/json/output.json',
          report: '{"numTotalTests":4,"numPassedTests":4,"numFailedTests":0,"success":true,"testResults":[]}',
        },
        'summary',
        {} as TestResultContext
      );
      expect(processed.testSummary).toMatchObject({ totalTests: 4, passed: 4 });
    });

    it('reports a test file that failed to load', async () => {
      const report = JSON.stringify({
        numTotalTests: 0,
        numPassedTests: 0,
        numFailedTests: 0,
        success: false,
        testResults: [{
          name: '/project/src/broken.test.ts',
          status: 'failed',
          message: 'Failed to load url ./missing (resolved id: ./missing) in /project/src/broken.test.ts. Does the file exist?',
          assertionResults: [],
        }],
      });

      const processed = await processor.process({ ...base, exitCode: 1, stdout: '', report }, 'detailed', {} as TestResultContext);

      expect(processed.success).toBe(false);
      expect(processed.testResults?.failedTests?.[0]).toMatchObject({
        file: '/project/src/broken.test.ts',
        tests: [expect.objectContaining({ testName: '(test file failed to run)', message: expect.stringContaining('./missing') })],
      });
    });

    it('includes stderr when vitest fails without reporting a failing test', async () => {
      const processed = await processor.process(
        { ...base, exitCode: 1, stdout: '', stderr: 'Error: No projects matched the filter "api".' },
        'summary',
        {} as TestResultContext
      );
      expect(processed.error).toBe('Error: No projects matched the filter "api".');
      expect(processed.summary).toBe('❌ Error: No projects matched the filter "api".');
    });

    it('does not add an error field to successful runs', async () => {
      const processed = await processor.process(
        { ...base, exitCode: 0, stdout: '', stderr: 'some warning', report: '{"numTotalTests":1,"numPassedTests":1,"numFailedTests":0,"success":true,"testResults":[]}' },
        'summary',
        {} as TestResultContext
      );
      expect(processed.error).toBeUndefined();
    });
  });
});
