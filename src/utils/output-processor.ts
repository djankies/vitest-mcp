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
  TestResults,
  FailedTestDetails,
  FailedTestSummary,
  SkippedTest
} from '../tools/run-tests.js';
import { readFile } from 'fs/promises';

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

interface ParsedError {
  type: string;
  message: string;
  expected?: unknown;
  actual?: unknown;
  testIntent?: string;
  codeSnippet?: string[];
  cleanStack: string[];
  rawError?: string;
}


/**
 * Main output processor implementation
 */
export class VitestOutputProcessor implements OutputProcessor {
  async process(result: RunTestsResult, format: TestFormat, context: TestResultContext): Promise<ProcessedTestResult> {
    // Parse JSON data for all formats since we always use JSON reporter
    const jsonData = this.parseVitestJson(result.stdout);
    
    if (process.env.VITEST_MCP_DEBUG) {
      console.error('[DEBUG] Processing output:');
      console.error('- stdout length:', result.stdout.length);
      console.error('- stdout sample:', result.stdout.substring(0, 200));
      console.error('- jsonData parsed:', !!jsonData);
      if (jsonData) {
        console.error('- numTotalTests:', jsonData.numTotalTests);
        console.error('- numPassedTests:', jsonData.numPassedTests);
      }
    }
    
    const summary = jsonData ? this.extractSummaryFromJson(jsonData) : this.getErrorSummary();

    // Generate test results from JSON
    const testResults = await this.generateTestResults(jsonData, format);

    // Update context with actual test count from summary
    const updatedContext: TestResultContext = {
      ...context,
      actualTestCount: summary.totalTests,
      executionTime: result.duration
    };

    // Build the clean response structure
    const processedResult: ProcessedTestResult = {
      command: result.command,
      success: result.success && result.exitCode === 0,
      context: updatedContext,
      summary,
      format
    };

    // Only include testResults if there are failures or skipped tests
    if (testResults && (testResults.failedTests || testResults.skippedTests)) {
      processedResult.testResults = testResults;
    }

    return processedResult;
  }


  /**
   * Parse Vitest JSON output
   */
  private parseVitestJson(stdout: string): VitestJsonResult | null {
    try {
      // First try to parse the entire stdout as JSON
      const trimmed = stdout.trim();
      if (trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed);
          // Verify it's actually Vitest JSON output
          if (parsed.numTotalTests !== undefined || parsed.testResults) {
            // Check if this is our custom reporter output with logs
            if (parsed.__logs) {
              // Store logs separately and remove from JSON structure
              delete parsed.__logs;
            }
            return parsed;
          }
        } catch {
          // Not valid JSON, continue with other methods
        }
      }
      
      // Vitest JSON output might have non-JSON content before/after
      // Try to find the JSON by looking for the characteristic structure
      const lines = stdout.split('\n');
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        // Look for lines that start with { and contain Vitest-specific fields
        if (trimmedLine.startsWith('{') && 
            (trimmedLine.includes('"numTotalTests"') || 
             trimmedLine.includes('"testResults"') ||
             trimmedLine.includes('"numTotalTestSuites"'))) {
          try {
            const parsed = JSON.parse(trimmedLine);
            // Verify it's actually Vitest JSON output
            if (parsed.numTotalTests !== undefined || parsed.testResults) {
              return parsed;
            }
          } catch {
            // Not valid JSON, continue searching
            continue;
          }
        }
      }

      // If no single-line JSON found, try to extract JSON block
      const jsonStartIndex = stdout.indexOf('{"numTotalTestSuites"');
      if (jsonStartIndex === -1) {
        // Try alternative start patterns
        const altStartIndex = stdout.indexOf('{"numTotalTests"');
        if (altStartIndex !== -1) {
          // Find the end of the JSON object
          let braceCount = 0;
          let jsonEnd = altStartIndex;
          for (let i = altStartIndex; i < stdout.length; i++) {
            if (stdout[i] === '{') braceCount++;
            if (stdout[i] === '}') braceCount--;
            if (braceCount === 0) {
              jsonEnd = i + 1;
              break;
            }
          }
          const jsonString = stdout.substring(altStartIndex, jsonEnd);
          try {
            return JSON.parse(jsonString);
          } catch {
            return null;
          }
        }
        return null;
      }

      // Find the end of the JSON object
      let braceCount = 0;
      let jsonEnd = jsonStartIndex;
      for (let i = jsonStartIndex; i < stdout.length; i++) {
        if (stdout[i] === '{') braceCount++;
        if (stdout[i] === '}') braceCount--;
        if (braceCount === 0) {
          jsonEnd = i + 1;
          break;
        }
      }

      const jsonString = stdout.substring(jsonStartIndex, jsonEnd);
      return JSON.parse(jsonString);
    } catch {
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
        summary.totalTests = summary.passed + summary.failed + (summary.skipped || 0);
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

    }

    return summary;
  }

  /**
   * Get error summary for when parsing fails
   */
  private getErrorSummary(): TestSummary {
    return {
      totalTests: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      duration: 0
    };
  }

  /**
   * Extract summary from Vitest JSON output
   */
  private extractSummaryFromJson(jsonData: VitestJsonResult): TestSummary {
    // Calculate duration from test results if endTime is not available
    let duration = 0;
    if (jsonData.endTime && jsonData.startTime) {
      duration = jsonData.endTime - jsonData.startTime;
    } else if (jsonData.testResults && jsonData.testResults.length > 0) {
      // Sum up all test suite durations
      for (const suite of jsonData.testResults) {
        if (suite.endTime && suite.startTime) {
          duration += suite.endTime - suite.startTime;
        } else {
          // Fallback to summing individual test durations
          for (const test of suite.assertionResults || []) {
            duration += test.duration || 0;
          }
        }
      }
    }
    
    return {
      totalTests: jsonData.numTotalTests,
      passed: jsonData.numPassedTests,
      failed: jsonData.numFailedTests,
      skipped: jsonData.numSkippedTests,
      duration: Math.round(duration) // Round to nearest millisecond
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
  private extractTestDetailsFromJson(jsonData: VitestJsonResult): string[] {
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
  private extractFailureDetailsFromJson(jsonData: VitestJsonResult, concise: boolean = false): string[] {
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
  private cleanJsonForLLM(jsonData: VitestJsonResult): Record<string, unknown> {
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
   * Parse error information from Vitest failure messages
   */
  private async parseError(
    errorMessage: string, 
    filePath: string
  ): Promise<ParsedError> {
    const error: ParsedError = {
      type: 'Error',
      message: '',
      cleanStack: [],
      rawError: errorMessage
    };

    // Extract error type and message
    const lines = errorMessage.split('\n');
    const firstLine = lines[0].trim();
    
    // Parse error type and message
    if (firstLine.includes('AssertionError:')) {
      error.type = 'AssertionError';
      error.message = firstLine.replace('AssertionError:', '').trim();
    } else if (firstLine.includes('TypeError:')) {
      error.type = 'TypeError';
      error.message = firstLine.replace('TypeError:', '').trim();
    } else if (firstLine.includes('ReferenceError:')) {
      error.type = 'ReferenceError';
      error.message = firstLine.replace('ReferenceError:', '').trim();
    } else if (firstLine.includes('Test timed out')) {
      error.type = 'TimeoutError';
      error.message = firstLine;
    } else if (firstLine.includes('Error:')) {
      error.type = 'Error';
      error.message = firstLine.replace('Error:', '').trim();
    } else {
      error.message = firstLine;
    }

    // Extract expected and actual values for assertion errors
    if (error.type === 'AssertionError') {
      // Parse Vitest assertion messages like "expected 4 to be 5"
      const toBeMatcher = error.message.match(/expected\s+(.+?)\s+to\s+(?:be|equal)\s+(.+?)(?:\s+\/\/|$)/i);
      if (toBeMatcher) {
        error.actual = this.parseValue(toBeMatcher[1].trim());
        error.expected = this.parseValue(toBeMatcher[2].trim());
      } else {
        // Try different patterns for expected/actual
        const expectedMatch = errorMessage.match(/Expected[:\s]*(.+?)(?:\n|$)/i) || 
                             errorMessage.match(/- Expected[:\s]*\n[+-]\s*(.+?)(?:\n|$)/);
        const actualMatch = errorMessage.match(/Received[:\s]*(.+?)(?:\n|$)/i) || 
                           errorMessage.match(/\+ Received[:\s]*\n[+-]\s*(.+?)(?:\n|$)/);
        
        if (expectedMatch) {
          error.expected = this.parseValue(expectedMatch[1].trim());
        }
        if (actualMatch) {
          error.actual = this.parseValue(actualMatch[1].trim());
        }
      }
    }

    // Extract and clean stack trace
    const stackLines = lines.filter(line => line.trim().startsWith('❯') || 
                                           line.trim().match(/^\s*at\s+/));
    error.cleanStack = stackLines
      .map(line => line.trim())
      .filter(line => !line.includes('node_modules') && 
                     !line.includes('vitest') && 
                     !line.includes('test-runner'))
      .slice(0, 3); // Limit to 3 most relevant stack entries

    // Extract code snippet if we can find line numbers
    try {
      const lineMatch = errorMessage.match(/(\d+):\d+/);
      if (lineMatch && filePath) {
        const lineNumber = parseInt(lineMatch[1], 10);
        const codeSnippet = await this.extractCodeSnippet(filePath, lineNumber);
        if (codeSnippet) {
          error.codeSnippet = codeSnippet;
        }
      }
    } catch {
      // Code snippet extraction failed, continue without it
    }


    return error;
  }

  /**
   * Parse a value string into appropriate type
   */
  private parseValue(valueStr: string): unknown {
    // Remove quotes and try to parse as JSON
    const cleaned = valueStr.replace(/^['"`]|['"`]$/g, '');
    
    // Try to parse numbers
    const num = Number(cleaned);
    if (!isNaN(num) && isFinite(num)) {
      return num;
    }
    
    // Try to parse booleans
    if (cleaned === 'true') return true;
    if (cleaned === 'false') return false;
    if (cleaned === 'null') return null;
    if (cleaned === 'undefined') return undefined;
    
    // Try to parse objects/arrays
    try {
      return JSON.parse(cleaned);
    } catch {
      return cleaned; // Return as string if all else fails
    }
  }

  /**
   * Extract code snippet around the failing line
   */
  private async extractCodeSnippet(filePath: string, lineNumber: number): Promise<string[] | null> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      
      // Get context around the failing line (2 lines before, 2 lines after)
      const start = Math.max(0, lineNumber - 3);
      const end = Math.min(lines.length, lineNumber + 2);
      
      const snippet = [];
      for (let i = start; i < end; i++) {
        const lineNum = i + 1;
        const isFailingLine = lineNum === lineNumber;
        const prefix = isFailingLine ? '❌' : '  ';
        snippet.push(`${lineNum.toString().padStart(2, ' ')}: ${prefix} ${lines[i]}`);
      }
      
      return snippet;
    } catch {
      return null;
    }
  }


  /**
   * Generate test results in the new format
   */
  private async generateTestResults(
    jsonData: VitestJsonResult | null,
    format: TestFormat
  ): Promise<TestResults | undefined> {
    if (!jsonData) {
      return undefined;
    }

    const testResults: TestResults = {};

    // Process failed tests
    const failedTestsByFile = new Map<string, Array<FailedTestDetails | FailedTestSummary>>();
    const skippedTestsByFile = new Map<string, Array<SkippedTest>>();

    for (const suite of jsonData.testResults || []) {
      const filePath = suite.name;

      for (const assertion of suite.assertionResults || []) {
        const testName = assertion.fullName || `${assertion.ancestorTitles.join(' › ')} › ${assertion.title}`;

        if (assertion.status === 'failed') {
          if (!failedTestsByFile.has(filePath)) {
            failedTestsByFile.set(filePath, []);
          }

          if (format === 'detailed' && assertion.failureMessages?.length) {
            // Detailed format with full error information
            const errorMessage = assertion.failureMessages[0];
            const parsedError = await this.parseError(errorMessage, suite.name);
            
            const detailedTest: FailedTestDetails = {
              testName,
              duration: assertion.duration,
              errorType: parsedError.type,
              message: parsedError.message,
              stack: parsedError.cleanStack,
              actual: parsedError.actual,
              expected: parsedError.expected,
              codeSnippet: parsedError.codeSnippet
            };
            
            failedTestsByFile.get(filePath)!.push(detailedTest);
          } else {
            // Summary format with basic error information
            const errorMessage = assertion.failureMessages?.[0] || 'Test failed';
            const parsedError = await this.parseError(errorMessage, suite.name);
            
            const summaryTest: FailedTestSummary = {
              testName,
              errorType: parsedError.type,
              message: parsedError.message
            };
            
            failedTestsByFile.get(filePath)!.push(summaryTest);
          }
        } else if (assertion.status === 'skipped') {
          if (!skippedTestsByFile.has(filePath)) {
            skippedTestsByFile.set(filePath, []);
          }
          
          const skippedTest: SkippedTest = {
            testName
          };
          
          skippedTestsByFile.get(filePath)!.push(skippedTest);
        }
      }
    }

    // Convert maps to arrays
    if (failedTestsByFile.size > 0) {
      testResults.failedTests = Array.from(failedTestsByFile.entries()).map(([file, tests]) => ({
        file,
        tests
      }));
    }

    if (skippedTestsByFile.size > 0) {
      testResults.skippedTests = Array.from(skippedTestsByFile.entries()).map(([file, tests]) => ({
        file,
        tests  
      }));
    }

    // Return undefined if no failures or skipped tests
    if (!testResults.failedTests && !testResults.skippedTests) {
      return undefined;
    }

    return testResults;
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
): Promise<ProcessedTestResult> {
  return outputProcessor.process(result, format, context);
}