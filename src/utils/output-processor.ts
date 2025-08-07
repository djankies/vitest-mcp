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
// Performance imports temporarily removed for build compatibility

/**
 * JSON test result structure from Vitest JSON reporter
 */
interface VitestJsonResult {
  version: string;
  success: boolean;
  numTotalTestSuites: number;
  numPassedTestSuites: number;
  numFailedTestSuites: number;
  numPendingTestSuites?: number;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numSkippedTests?: number; // This might be missing in some Vitest versions
  numPendingTests?: number; // Additional field in Vitest JSON
  numTodoTests?: number;    // Additional field for todo tests
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
  async process(result: RunTestsResult, format: TestFormat, _context: TestResultContext): Promise<ProcessedTestResult> {
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
    
    // If JSON parsing failed, try to extract information from raw output
    let summary: TestSummary;
    if (jsonData) {
      summary = this.extractSummaryFromJson(jsonData);
    } else {
      // Fallback to text parsing if JSON parsing failed
      if (process.env.VITEST_MCP_DEBUG) {
        console.error('[DEBUG] JSON parsing failed, falling back to text parsing');
      }
      summary = this.extractSummaryFromOutput(result.stdout);
      
      // If we still couldn't get any test counts and the exit code was 0, 
      // it might mean tests ran but output wasn't captured properly
      if (summary.totalTests === 0 && result.exitCode === 0 && result.stdout.includes('Test')) {
        console.warn('Warning: Tests may have run but output parsing failed. Consider enabling VITEST_MCP_DEBUG=true for troubleshooting.');
      }
    }

    // Generate test results from JSON
    const testResults = await this.generateTestResults(jsonData, format);

    // Build the clean response structure
    const processedResult: ProcessedTestResult = {
      command: result.command,
      success: result.success && result.exitCode === 0,
      summary,
      format,
      executionTimeMs: Math.round((result.duration || 0) * 100) / 100  // Total operation duration in milliseconds
    };

    // Only include testResults if there are failures or skipped tests
    if (testResults && (testResults.failedTests || testResults.skippedTests)) {
      processedResult.testResults = testResults;
    }

    return processedResult;
  }


  /**
   * Parse Vitest JSON output with improved robustness
   */
  private parseVitestJson(stdout: string): VitestJsonResult | null {
    const parseStartTime = performance.now();
    
    try {
      // Early exit for empty or very small outputs
      if (!stdout || stdout.length < 10) {
        if (process.env.VITEST_MCP_DEBUG) {
          console.error('[DEBUG] Output too short to contain valid JSON');
        }
        return null;
      }
      
      // Pre-compiled regex patterns for Vitest JSON detection
      const vitestPatterns = [
        /{"numTotalTestSuites":\d+/,
        /{"numTotalTests":\d+/,
        /{"testResults":\[/,
        /{"success":(true|false)/
      ];
      
      // Fast path: Try direct parsing first (works for clean JSON output)
      const trimmed = stdout.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (this.isVitestJson(parsed)) {
            if (process.env.VITEST_MCP_DEBUG) {
              console.error(`[DEBUG] JSON parsed successfully (direct): ${(performance.now() - parseStartTime).toFixed(1)}ms`);
              console.error(`[DEBUG] Found ${parsed.numTotalTests} tests`);
            }
            return parsed;
          }
        } catch (e) {
          if (process.env.VITEST_MCP_DEBUG) {
            console.error('[DEBUG] Direct JSON parse failed:', e instanceof Error ? e.message : 'Unknown error');
          }
          // Fall through to more complex parsing
        }
      }
      
      // Optimization: Use Boyer-Moore-like search for JSON boundaries
      let jsonStart = -1;
      for (const pattern of vitestPatterns) {
        const match = pattern.exec(stdout);
        if (match) {
          jsonStart = match.index;
          break;
        }
      }
      
      if (jsonStart === -1) {
        // Fallback: Look for any JSON-like structure with Vitest fields
        const lines = stdout.split('\n');
        if (process.env.VITEST_MCP_DEBUG) {
          console.error(`[DEBUG] Searching ${lines.length} lines for JSON`);
        }
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line.startsWith('{') && this.containsVitestFields(line)) {
            try {
              const parsed = JSON.parse(line);
              if (this.isVitestJson(parsed)) {
                if (process.env.VITEST_MCP_DEBUG) {
                  console.error(`[DEBUG] JSON found on line ${i + 1} (line search): ${(performance.now() - parseStartTime).toFixed(1)}ms`);
                  console.error(`[DEBUG] Found ${parsed.numTotalTests} tests`);
                }
                return parsed;
              }
            } catch (e) {
              if (process.env.VITEST_MCP_DEBUG) {
                console.error(`[DEBUG] Failed to parse line ${i + 1}: ${e instanceof Error ? e.message : 'Unknown error'}`);
              }
              continue;
            }
          }
        }
        
        if (process.env.VITEST_MCP_DEBUG) {
          console.error('[DEBUG] No valid JSON found in any line');
        }
        return null;
      }
      
      // Optimization: Efficient brace counting with early termination
      const jsonEnd = this.findJsonEnd(stdout, jsonStart);
      if (jsonEnd === -1) {
        return null;
      }
      
      const jsonString = stdout.substring(jsonStart, jsonEnd + 1);
      const parsed = JSON.parse(jsonString);
      
      if (process.env.VITEST_MCP_DEBUG) {
        console.error(`[PERF] JSON parse (boundary search): ${(performance.now() - parseStartTime).toFixed(1)}ms`);
        console.error(`[PERF] JSON size: ${jsonString.length} bytes`);
      }
      
      return parsed;
    } catch (error) {
      if (process.env.VITEST_MCP_DEBUG) {
        console.error(`[PERF] JSON parse failed after ${(performance.now() - parseStartTime).toFixed(1)}ms:`, error);
      }
      return null;
    }
  }
  
  /**
   * Check if string contains Vitest-specific fields (faster than regex)
   */
  private containsVitestFields(text: string): boolean {
    return text.includes('"numTotalTests"') || 
           text.includes('"testResults"') ||
           text.includes('"numTotalTestSuites"') ||
           text.includes('"success"');
  }
  
  /**
   * Optimized JSON end finder with bounds checking
   */
  private findJsonEnd(text: string, start: number): number {
    let braceCount = 0;
    let inString = false;
    let escaped = false;
    const maxSearch = Math.min(text.length, start + 100000); // Limit search to prevent hanging
    
    for (let i = start; i < maxSearch; i++) {
      const char = text[i];
      
      if (!inString) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            return i;
          }
        } else if (char === '"') {
          inString = true;
        }
      } else {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
      }
    }
    
    return -1;
  }
  
  /**
   * Validate that parsed JSON is Vitest output with improved checks
   */
  private isVitestJson(data: unknown): data is VitestJsonResult {
    if (!data || typeof data !== 'object') {
      return false;
    }
    const obj = data as Record<string, unknown>;
    
    // Check for key Vitest JSON reporter fields
    // Both old and new Vitest versions should have at least some of these
    const hasTestCounts = 
      typeof obj.numTotalTests === 'number' ||
      typeof obj.numTotalTestSuites === 'number';
    
    const hasTestResults = Array.isArray(obj.testResults);
    const hasSuccess = typeof obj.success === 'boolean';
    
    // Need at least two of these to be considered valid Vitest JSON
    const validFields = [hasTestCounts, hasTestResults, hasSuccess].filter(Boolean).length;
    
    if (process.env.VITEST_MCP_DEBUG && validFields > 0) {
      console.error(`[DEBUG] JSON validation: counts=${hasTestCounts}, results=${hasTestResults}, success=${hasSuccess}`);
    }
    
    return validFields >= 2;
  }

  /**
   * Extract summary information from raw Vitest output with improved patterns
   */
  private extractSummaryFromOutput(stdout: string): TestSummary {
    const summary: TestSummary = {
      totalTests: 0,
      passed: 0,
      failed: 0,
      skipped: 0
    };

    // Look for test result patterns in Vitest output
    const lines = stdout.split('\n');
    
    for (const line of lines) {
      // Match patterns like "Test Files  2 passed (2)" or "Test Files  1 failed | 2 passed (3)"
      const testFilesMatch = line.match(/Test Files\s+(?:(\d+)\s+failed\s*\|\s*)?(\d+)\s+passed(?:\s+\|[^(]+)?\s*\((\d+)\)/);
      if (testFilesMatch) {
        // Note: These are file counts, not test counts, but we continue looking for actual test counts
      }

      // Match patterns like "Tests  5 passed (5)" or "Tests  2 failed | 3 passed | 1 skipped (6)"
      const testsMatch = line.match(/Tests\s+(?:(\d+)\s+failed\s*\|?\s*)?(?:(\d+)\s+passed)?(?:\s*\|\s*(\d+)\s+skipped)?\s*\((\d+)\)/);
      if (testsMatch) {
        summary.failed = testsMatch[1] ? parseInt(testsMatch[1], 10) : 0;
        summary.passed = testsMatch[2] ? parseInt(testsMatch[2], 10) : 0;
        summary.skipped = testsMatch[3] ? parseInt(testsMatch[3], 10) : 0;
        summary.totalTests = parseInt(testsMatch[4], 10);
        
        if (process.env.VITEST_MCP_DEBUG) {
          console.error(`[DEBUG] Extracted from text: ${summary.totalTests} total, ${summary.passed} passed, ${summary.failed} failed`);
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

      // Duration is tracked at the operation level, not from stdout parsing

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
      skipped: 0
    };
  }

  /**
   * Extract summary from Vitest JSON output
   */
  private extractSummaryFromJson(jsonData: VitestJsonResult): TestSummary {
    // Handle different types of skipped tests
    // Vitest may report skipped tests in different fields depending on version and type
    const skippedCount = (jsonData.numSkippedTests || 0) + 
                        (jsonData.numPendingTests || 0) + 
                        (jsonData.numTodoTests || 0);
    
    return {
      totalTests: jsonData.numTotalTests,
      passed: jsonData.numPassedTests,
      failed: jsonData.numFailedTests,
      skipped: skippedCount
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