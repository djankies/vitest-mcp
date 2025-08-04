/**
 * Output processor for Vitest results - transforms raw Vitest output into LLM-optimized formats
 */

import { 
  RunTestsResult, 
  ProcessedTestResult, 
  TestFormat, 
  TestResultContext, 
  TestSummary, 
  OutputProcessor,
  StructuredTestResult,
  TestFile,
  TestCase
} from '../tools/run-tests.js';

/**
 * JSON test result structure from Vitest JSON reporter
 */
interface VitestJsonResult {
  version: string;
  success: boolean;
  numTotalTestSuites: number;
  numPassedTestSuites: number;
  numFailedTestSuites: number;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numSkippedTests: number;
  startTime: number;
  endTime: number;
  testResults: TestSuiteResult[];
}

interface TestSuiteResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  startTime: number;
  endTime: number;
  message?: string;
  assertionResults: AssertionResult[];
}

interface AssertionResult {
  ancestorTitles: string[];
  title: string;
  fullName: string;
  status: 'passed' | 'failed' | 'skipped';
  duration?: number;
  failureMessages?: string[];
  failureDetails?: string[];
}

/**
 * Main output processor implementation
 */
export class VitestOutputProcessor implements OutputProcessor {
  process(result: RunTestsResult, format: TestFormat, context: TestResultContext): ProcessedTestResult {
    let processedOutput: string;
    let summary: TestSummary | undefined;

    // Parse JSON data for all formats since we always use JSON reporter
    const jsonData = this.parseVitestJson(result.stdout);

    switch (format) {
      case 'json':
        const jsonResult = this.processJson(result);
        processedOutput = jsonResult.output;
        summary = jsonResult.summary;
        break;
      case 'summary':
        const summaryResult = this.processSummary(result, context);
        processedOutput = summaryResult.output;
        summary = summaryResult.summary;
        break;
      case 'detailed':
      default:
        const detailedResult = this.processDetailed(result, context);
        processedOutput = detailedResult.output;
        summary = detailedResult.summary;
        break;
    }

    // Update context with actual test count from summary
    const updatedContext: TestResultContext = {
      ...context,
      actualTestCount: summary?.totalTests || context.actualTestCount
    };

    // Generate structured data from JSON
    const structured = this.generateStructuredResult(jsonData, result, summary);

    return {
      ...result,
      stdout: processedOutput, // Replace stdout with processed output for LLM consumption
      format,
      processedOutput,
      summary,
      context: updatedContext,
      structured
    };
  }

  /**
   * JSON format - parse and clean Vitest JSON output
   */
  private processJson(result: RunTestsResult): { output: string; summary?: TestSummary } {
    try {
      const jsonData = this.parseVitestJson(result.stdout);
      if (!jsonData) {
        return { output: result.stdout };
      }

      const summary = this.extractSummaryFromJson(jsonData);
      const cleanedJson = this.cleanJsonForLLM(jsonData);
      
      return {
        output: JSON.stringify(cleanedJson, null, 2),
        summary
      };
    } catch (error) {
      return { 
        output: `JSON parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}\n\nRaw output:\n${result.stdout}` 
      };
    }
  }

  /**
   * Summary format - minimal essential info optimized for LLMs
   */
  private processSummary(result: RunTestsResult, _context: TestResultContext): { output: string; summary?: TestSummary } {
    // Parse JSON output since we always use JSON reporter
    const jsonData = this.parseVitestJson(result.stdout);
    const summary = jsonData ? this.extractSummaryFromJson(jsonData) : undefined;
    const parts: string[] = [];

    // Success/failure indicator with counts
    if (!summary) {
      // Fallback if JSON parsing failed
      parts.push(result.success ? '✅ Tests passed' : '❌ Tests failed');
    } else if (result.success) {
      parts.push(`✅ ${summary.passed} test${summary.passed === 1 ? '' : 's'} passed`);
    } else {
      parts.push(`❌ ${summary.failed}/${summary.totalTests} test${summary.totalTests === 1 ? '' : 's'} failed`);
    }

    // Add timing if significant
    if (summary && summary.duration > 1000) {
      parts.push(`in ${Math.round(summary.duration)}ms`);
    }

    let output = parts.join(' ');

    // Add failure details if present (but keep concise)
    if (summary && summary.failed > 0 && jsonData) {
      const failures = this.extractFailureDetailsFromJson(jsonData, true); // concise = true
      if (failures.length > 0) {
        output += '\n\nFailed tests:\n' + failures.join('\n');
      }
    }

    // Add stderr if present and relevant
    if (result.stderr && result.stderr.trim() && !result.success) {
      const cleanStderr = this.cleanStderr(result.stderr);
      if (cleanStderr) {
        output += '\n\nErrors:\n' + cleanStderr;
      }
    }

    return { output, summary };
  }

  /**
   * Detailed format - comprehensive information for debugging
   */
  private processDetailed(result: RunTestsResult, _context: TestResultContext): { output: string; summary?: TestSummary } {
    // Parse JSON output since we always use JSON reporter
    const jsonData = this.parseVitestJson(result.stdout);
    const summary = jsonData ? this.extractSummaryFromJson(jsonData) : undefined;
    const parts: string[] = [];

    // Header with overall status
    if (result.success) {
      parts.push(`✅ Test execution successful`);
    } else {
      parts.push(`❌ Test execution failed`);
    }

    // Test statistics
    const stats = summary ? [
      `Total: ${summary.totalTests}`,
      `Passed: ${summary.passed}`,
      summary.failed > 0 ? `Failed: ${summary.failed}` : null,
      summary.skipped > 0 ? `Skipped: ${summary.skipped}` : null
    ].filter(Boolean).join(' | ') : 'Unable to parse test statistics';
    
    parts.push(`\nResults: ${stats}`);
    
    if (summary && summary.duration > 0) {
      parts.push(`Duration: ${Math.round(summary.duration)}ms`);
    }

    // Coverage information if available
    if (summary && summary.coverage) {
      const coverage = summary.coverage;
      parts.push(`\nCoverage: Lines: ${coverage.lines}% | Functions: ${coverage.functions}% | Branches: ${coverage.branches}% | Statements: ${coverage.statements}%`);
    }

    // Test details from JSON
    if (jsonData) {
      const testDetails = this.extractTestDetailsFromJson(jsonData);
      if (testDetails.length > 0) {
        parts.push('\nTest Details:');
        parts.push(...testDetails);
      }
    }

    // Failure details if present
    if (summary && summary.failed > 0 && jsonData) {
      const failures = this.extractFailureDetailsFromJson(jsonData, false); // concise = false
      if (failures.length > 0) {
        parts.push('\nFailure Details:');
        parts.push(...failures);
      }
    }

    // Add stderr if present
    if (result.stderr && result.stderr.trim()) {
      const cleanStderr = this.cleanStderr(result.stderr);
      if (cleanStderr) {
        parts.push('\nErrors:');
        parts.push(cleanStderr);
      }
    }

    return { output: parts.join('\n'), summary };
  }

  /**
   * Parse Vitest JSON output
   */
  private parseVitestJson(stdout: string): VitestJsonResult | null {
    try {
      // Vitest JSON output might have non-JSON content before/after
      // Look for the actual JSON object
      const lines = stdout.split('\n');
      let jsonLine = '';
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('{') && trimmed.includes('"version"')) {
          jsonLine = trimmed;
          break;
        }
      }

      if (!jsonLine) {
        // Try to find any line that looks like complete JSON
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            try {
              const parsed = JSON.parse(trimmed);
              if (parsed.testResults || parsed.numTotalTests !== undefined) {
                return parsed;
              }
            } catch {
              continue;
            }
          }
        }
        return null;
      }

      return JSON.parse(jsonLine);
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract summary information from raw Vitest output
   */
  private extractSummaryFromOutput(stdout: string): TestSummary {
    const summary: TestSummary = {
      totalTests: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      duration: 0
    };

    // Look for test result patterns in Vitest output
    const lines = stdout.split('\n');
    
    for (const line of lines) {
      // Match patterns like "Test Files  2 passed (2)"
      const testFilesMatch = line.match(/Test Files\s+(\d+)\s+passed(?:\s+\|\s+(\d+)\s+failed)?/);
      if (testFilesMatch) {
        summary.passed = parseInt(testFilesMatch[1], 10);
        summary.failed = testFilesMatch[2] ? parseInt(testFilesMatch[2], 10) : 0;
      }

      // Match patterns like "Tests  5 passed (5)" or "Tests  7 failed (7)"
      const testsMatch = line.match(/Tests\s+(\d+)\s+(passed|failed)(?:\s+\((\d+)\))?/);
      if (testsMatch) {
        const count = parseInt(testsMatch[1], 10);
        const status = testsMatch[2];
        
        if (status === 'passed') {
          summary.passed = count;
        } else if (status === 'failed') {
          summary.failed = count;
        }
        
        // Update total
        summary.totalTests = summary.passed + summary.failed + summary.skipped;
      }
      
      // Also look for comprehensive test result patterns like "Tests  2 passed | 3 failed"  
      const comprehensiveMatch = line.match(/Tests.*?(\d+)\s+passed.*?(?:(\d+)\s+failed)?.*?(?:(\d+)\s+skipped)?/);
      if (comprehensiveMatch) {
        summary.passed = parseInt(comprehensiveMatch[1], 10) || 0;
        summary.failed = comprehensiveMatch[2] ? parseInt(comprehensiveMatch[2], 10) : 0;
        summary.skipped = comprehensiveMatch[3] ? parseInt(comprehensiveMatch[3], 10) : 0;
        summary.totalTests = summary.passed + summary.failed + summary.skipped;
      }

      // Match duration patterns like "Time  123.45ms"
      const timeMatch = line.match(/Time\s+(\d+(?:\.\d+)?)(ms|s)/);
      if (timeMatch) {
        const time = parseFloat(timeMatch[1]);
        summary.duration = timeMatch[2] === 's' ? time * 1000 : time;
      }

      // Match coverage patterns
      const coverageMatch = line.match(/All files\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)/);
      if (coverageMatch) {
        summary.coverage = {
          statements: parseFloat(coverageMatch[1]),
          branches: parseFloat(coverageMatch[2]),
          functions: parseFloat(coverageMatch[3]),
          lines: parseFloat(coverageMatch[4])
        };
      }
    }

    return summary;
  }

  /**
   * Extract summary from Vitest JSON output
   */
  private extractSummaryFromJson(jsonData: VitestJsonResult): TestSummary {
    return {
      totalTests: jsonData.numTotalTests,
      passed: jsonData.numPassedTests,
      failed: jsonData.numFailedTests,
      skipped: jsonData.numSkippedTests,
      duration: jsonData.endTime - jsonData.startTime
    };
  }

  /**
   * Extract test details from output
   */
  private extractTestDetails(stdout: string): string[] {
    const details: string[] = [];
    const lines = stdout.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Look for test status indicators (✓, ×, ⚠)
      if (line.match(/^[✓×⚠]\s+/) || line.match(/^\s*[✓×⚠]\s+/)) {
        const status = line.includes('✓') ? '✅' : line.includes('×') ? '❌' : '⚠️';
        const testName = line.replace(/^\s*[✓×⚠]\s+/, '').trim();
        if (testName) {
          details.push(`${status} ${testName}`);
        }
      }
    }

    return details;
  }

  /**
   * Extract test details from JSON data
   */
  private extractTestDetailsFromJson(jsonData: any): string[] {
    const details: string[] = [];
    
    for (const testResult of jsonData.testResults) {
      const fileName = testResult.name.split('/').pop() || testResult.name;
      details.push(`• ${fileName}:`);
      
      for (const assertion of testResult.assertionResults) {
        const status = assertion.status === 'passed' ? '✓' : 
                       assertion.status === 'failed' ? '✗' : 
                       '○';
        const testName = assertion.title || assertion.fullName;
        details.push(`  ${status} ${testName}`);
      }
    }
    
    return details;
  }

  /**
   * Extract failure details from JSON data
   */
  private extractFailureDetailsFromJson(jsonData: any, concise: boolean = false): string[] {
    const failures: string[] = [];
    
    for (const testResult of jsonData.testResults) {
      for (const assertion of testResult.assertionResults) {
        if (assertion.status === 'failed') {
          const testName = assertion.fullName || `${assertion.ancestorTitles.join(' › ')} › ${assertion.title}`;
          
          if (concise) {
            failures.push(`• ${testName}`);
          } else {
            failures.push(`• ${testName}`);
            if (assertion.failureMessages && assertion.failureMessages.length > 0) {
              const message = assertion.failureMessages[0].split('\n')[0];
              failures.push(`  ${message}`);
            }
          }
        }
      }
    }
    
    return failures;
  }

  /**
   * Extract failure details from output
   */
  private extractFailureDetails(stdout: string, concise: boolean = false): string[] {
    const failures: string[] = [];
    const lines = stdout.split('\n');
    
    let inFailure = false;
    let currentFailure: string[] = [];
    let testName = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Look for failure markers
      if (line.match(/^[✗❌×]\s+/) || line.match(/^\s*[✗❌×]\s+/) || line.includes('FAIL')) {
        if (inFailure && currentFailure.length > 0) {
          failures.push(this.formatFailureDetail(testName, currentFailure, concise));
        }
        
        inFailure = true;
        testName = line.replace(/^[✗❌×]\s+/, '').replace(/^\s*[✗❌×]\s+/, '').replace(/FAIL\s+/, '').trim();
        currentFailure = [];
      } else if (inFailure) {
        // Look for error messages, expected/received, stack traces, and arrow messages
        if (line.includes('Expected:') || line.includes('Received:') || 
            line.includes('AssertionError') || line.includes('Error:') ||
            line.includes('→') || line.match(/^\s+at\s+/)) {
          currentFailure.push(line.trim());
        } else if (line.trim() === '' && currentFailure.length > 0) {
          // End of failure block
          failures.push(this.formatFailureDetail(testName, currentFailure, concise));
          inFailure = false;
          currentFailure = [];
          testName = '';
        }
      }
    }

    // Handle the last failure if we're still in one
    if (inFailure && currentFailure.length > 0) {
      failures.push(this.formatFailureDetail(testName, currentFailure, concise));
    }

    return failures;
  }

  /**
   * Format failure detail for output
   */
  private formatFailureDetail(testName: string, failureLines: string[], concise: boolean): string {
    if (concise) {
      // For summary format, just show test name and first error line
      const firstError = failureLines.find(line => 
        line.includes('Expected:') || line.includes('Error:') || line.includes('AssertionError')
      ) || failureLines[0];
      
      return `• ${testName}: ${firstError || 'Test failed'}`;
    } else {
      // For detailed format, show more context
      const indent = '  ';
      const formatted = [
        `• ${testName}:`,
        ...failureLines.slice(0, 5).map(line => `${indent}${line}`)
      ];
      
      if (failureLines.length > 5) {
        formatted.push(`${indent}... (${failureLines.length - 5} more lines)`);
      }
      
      return formatted.join('\n');
    }
  }

  /**
   * Clean stderr output for relevance
   */
  private cleanStderr(stderr: string): string {
    const lines = stderr.split('\n');
    const relevantLines = lines.filter(line => {
      const trimmed = line.trim();
      // Filter out npm/node noise, keep actual errors
      return trimmed && 
             !trimmed.includes('npm WARN') &&
             !trimmed.includes('experimental feature') &&
             !trimmed.startsWith('(') &&
             !trimmed.includes('coverage provider');
    });

    return relevantLines.join('\n').trim();
  }

  /**
   * Clean JSON output for LLM consumption
   */
  private cleanJsonForLLM(jsonData: VitestJsonResult): any {
    return {
      success: jsonData.success,
      summary: {
        total: jsonData.numTotalTests,
        passed: jsonData.numPassedTests,
        failed: jsonData.numFailedTests,
        skipped: jsonData.numSkippedTests,
        duration: jsonData.endTime - jsonData.startTime
      },
      testSuites: jsonData.testResults?.map(suite => ({
        name: suite.name,
        status: suite.status,
        duration: suite.endTime - suite.startTime,
        tests: suite.assertionResults?.map(test => ({
          name: test.title,
          fullName: test.fullName,
          status: test.status,
          duration: test.duration,
          failureMessages: test.failureMessages?.slice(0, 3) // Limit failure messages
        }))
      }))
    };
  }

  /**
   * Generate structured test result for LLM consumption
   */
  private generateStructuredResult(
    jsonData: VitestJsonResult | null, 
    result: RunTestsResult,
    summary?: TestSummary
  ): StructuredTestResult {
    // If we don't have JSON data, create a basic structured result
    if (!jsonData) {
      return {
        status: result.success ? 'success' : 'failure',
        summary: {
          total: summary?.totalTests || 0,
          passed: summary?.passed || 0,
          failed: summary?.failed || 0,
          skipped: summary?.skipped || 0,
          duration: summary?.duration || 0,
          passRate: summary?.totalTests ? ((summary?.passed || 0) / summary.totalTests) * 100 : 0
        }
      };
    }

    // Build structured test files
    const files: TestFile[] = jsonData.testResults?.map(suite => {
      const fileName = suite.name.split('/').pop() || suite.name;
      
      const tests: TestCase[] = suite.assertionResults?.map(assertion => {
        const testCase: TestCase = {
          name: assertion.title,
          fullName: assertion.fullName || `${assertion.ancestorTitles.join(' › ')} › ${assertion.title}`,
          status: assertion.status,
          duration: assertion.duration
        };

        // Add error details if test failed
        if (assertion.status === 'failed' && assertion.failureMessages?.length) {
          const errorMessage = assertion.failureMessages[0];
          const error: any = {
            message: errorMessage.split('\n')[0] // First line is usually the main error
          };

          // Try to extract expected/actual from error message
          const expectedMatch = errorMessage.match(/Expected[:\s]+(.+?)(?:\n|$)/);
          const actualMatch = errorMessage.match(/Received[:\s]+(.+?)(?:\n|$)/);
          
          if (expectedMatch) error.expected = expectedMatch[1].trim();
          if (actualMatch) error.actual = actualMatch[1].trim();

          // Extract stack trace if present
          const stackMatch = errorMessage.match(/\n\s+at\s+.+/g);
          if (stackMatch) {
            error.stack = stackMatch.slice(0, 3).join('\n'); // Limit stack trace
          }

          testCase.error = error;
        }

        return testCase;
      }) || [];

      return {
        path: suite.name,
        name: fileName,
        status: suite.status,
        duration: suite.endTime - suite.startTime,
        tests
      };
    }) || [];

    // Build failure summary for quick access
    const failures = files.flatMap(file => 
      file.tests
        .filter(test => test.status === 'failed')
        .map(test => ({
          file: file.name,
          test: test.name,
          error: test.error?.message || 'Test failed'
        }))
    );

    // Calculate pass rate
    const passRate = jsonData.numTotalTests > 0 
      ? (jsonData.numPassedTests / jsonData.numTotalTests) * 100 
      : 0;

    const structured: StructuredTestResult = {
      status: jsonData.success ? 'success' : 'failure',
      summary: {
        total: jsonData.numTotalTests,
        passed: jsonData.numPassedTests,
        failed: jsonData.numFailedTests,
        skipped: jsonData.numSkippedTests,
        duration: jsonData.endTime - jsonData.startTime,
        passRate: Math.round(passRate * 100) / 100 // Round to 2 decimal places
      }
    };

    // Add files if we have test details
    if (files.length > 0) {
      structured.files = files;
    }

    // Add failures if there are any
    if (failures.length > 0) {
      structured.failures = failures;
    }

    // Add coverage if available
    if (summary?.coverage) {
      structured.coverage = summary.coverage;
    }

    return structured;
  }
}

/**
 * Create and export a default processor instance
 */
export const outputProcessor = new VitestOutputProcessor();

/**
 * Convenience function for processing test results
 */
export function processTestResult(
  result: RunTestsResult, 
  format: TestFormat, 
  context: TestResultContext
): ProcessedTestResult {
  return outputProcessor.process(result, format, context);
}