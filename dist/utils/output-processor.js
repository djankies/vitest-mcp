/**
 * Output processor for Vitest results - transforms raw Vitest output into LLM-optimized formats
 */
import { readFile } from 'fs/promises';
/**
 * Main output processor implementation
 */
export class VitestOutputProcessor {
    async process(result, format, context) {
        // Parse JSON data for all formats since we always use JSON reporter
        const jsonData = this.parseVitestJson(result.stdout);
        const summary = jsonData ? this.extractSummaryFromJson(jsonData) : undefined;
        // Generate structured data from JSON
        const structured = await this.generateStructuredResult(jsonData, result, summary, format);
        // Update context with actual test count from summary
        const updatedContext = {
            ...context,
            actualTestCount: summary?.totalTests || context.actualTestCount
        };
        return {
            ...result,
            stdout: result.stdout, // Keep original stdout
            format,
            processedOutput: '', // Not used anymore, structured data is in structured property
            summary,
            context: updatedContext,
            structured
        };
    }
    /**
     * Parse Vitest JSON output
     */
    parseVitestJson(stdout) {
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
                        }
                        catch {
                            continue;
                        }
                    }
                }
                return null;
            }
            return JSON.parse(jsonLine);
        }
        catch {
            return null;
        }
    }
    /**
     * Extract summary information from raw Vitest output
     */
    extractSummaryFromOutput(stdout) {
        const summary = {
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
                }
                else if (status === 'failed') {
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
        }
        return summary;
    }
    /**
     * Extract summary from Vitest JSON output
     */
    extractSummaryFromJson(jsonData) {
        // Calculate duration from test results if endTime is not available
        let duration = 0;
        if (jsonData.endTime && jsonData.startTime) {
            duration = jsonData.endTime - jsonData.startTime;
        }
        else if (jsonData.testResults && jsonData.testResults.length > 0) {
            // Sum up all test suite durations
            for (const suite of jsonData.testResults) {
                if (suite.endTime && suite.startTime) {
                    duration += suite.endTime - suite.startTime;
                }
                else {
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
    extractTestDetails(stdout) {
        const details = [];
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
    extractTestDetailsFromJson(jsonData) {
        const details = [];
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
    extractFailureDetailsFromJson(jsonData, concise = false) {
        const failures = [];
        for (const testResult of jsonData.testResults) {
            for (const assertion of testResult.assertionResults) {
                if (assertion.status === 'failed') {
                    const testName = assertion.fullName || `${assertion.ancestorTitles.join(' › ')} › ${assertion.title}`;
                    if (concise) {
                        failures.push(`• ${testName}`);
                    }
                    else {
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
    extractFailureDetails(stdout, concise = false) {
        const failures = [];
        const lines = stdout.split('\n');
        let inFailure = false;
        let currentFailure = [];
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
            }
            else if (inFailure) {
                // Look for error messages, expected/received, stack traces, and arrow messages
                if (line.includes('Expected:') || line.includes('Received:') ||
                    line.includes('AssertionError') || line.includes('Error:') ||
                    line.includes('→') || line.match(/^\s+at\s+/)) {
                    currentFailure.push(line.trim());
                }
                else if (line.trim() === '' && currentFailure.length > 0) {
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
    formatFailureDetail(testName, failureLines, concise) {
        if (concise) {
            // For summary format, just show test name and first error line
            const firstError = failureLines.find(line => line.includes('Expected:') || line.includes('Error:') || line.includes('AssertionError')) || failureLines[0];
            return `• ${testName}: ${firstError || 'Test failed'}`;
        }
        else {
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
    cleanStderr(stderr) {
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
    cleanJsonForLLM(jsonData) {
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
    async parseError(errorMessage, filePath) {
        const error = {
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
        }
        else if (firstLine.includes('TypeError:')) {
            error.type = 'TypeError';
            error.message = firstLine.replace('TypeError:', '').trim();
        }
        else if (firstLine.includes('ReferenceError:')) {
            error.type = 'ReferenceError';
            error.message = firstLine.replace('ReferenceError:', '').trim();
        }
        else if (firstLine.includes('Test timed out')) {
            error.type = 'TimeoutError';
            error.message = firstLine;
        }
        else if (firstLine.includes('Error:')) {
            error.type = 'Error';
            error.message = firstLine.replace('Error:', '').trim();
        }
        else {
            error.message = firstLine;
        }
        // Extract expected and actual values for assertion errors
        if (error.type === 'AssertionError') {
            // Parse Vitest assertion messages like "expected 4 to be 5"
            const toBeMatcher = error.message.match(/expected\s+(.+?)\s+to\s+(?:be|equal)\s+(.+?)(?:\s+\/\/|$)/i);
            if (toBeMatcher) {
                error.actual = this.parseValue(toBeMatcher[1].trim());
                error.expected = this.parseValue(toBeMatcher[2].trim());
            }
            else {
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
        }
        catch {
            // Code snippet extraction failed, continue without it
        }
        return error;
    }
    /**
     * Parse a value string into appropriate type
     */
    parseValue(valueStr) {
        // Remove quotes and try to parse as JSON
        const cleaned = valueStr.replace(/^['"`]|['"`]$/g, '');
        // Try to parse numbers
        const num = Number(cleaned);
        if (!isNaN(num) && isFinite(num)) {
            return num;
        }
        // Try to parse booleans
        if (cleaned === 'true')
            return true;
        if (cleaned === 'false')
            return false;
        if (cleaned === 'null')
            return null;
        if (cleaned === 'undefined')
            return undefined;
        // Try to parse objects/arrays
        try {
            return JSON.parse(cleaned);
        }
        catch {
            return cleaned; // Return as string if all else fails
        }
    }
    /**
     * Extract code snippet around the failing line
     */
    async extractCodeSnippet(filePath, lineNumber) {
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
        }
        catch {
            return null;
        }
    }
    /**
     * Generate structured test result for LLM consumption
     */
    async generateStructuredResult(jsonData, result, summary, format) {
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
        // Calculate pass rate
        const passRate = jsonData.numTotalTests > 0
            ? (jsonData.numPassedTests / jsonData.numTotalTests) * 100
            : 0;
        // Calculate duration from test results if endTime is not available
        let duration = 0;
        if (jsonData.endTime && jsonData.startTime) {
            duration = jsonData.endTime - jsonData.startTime;
        }
        else if (jsonData.testResults && jsonData.testResults.length > 0) {
            // Sum up all test suite durations
            for (const suite of jsonData.testResults) {
                if (suite.endTime && suite.startTime) {
                    duration += suite.endTime - suite.startTime;
                }
                else {
                    // Fallback to summing individual test durations
                    for (const test of suite.assertionResults || []) {
                        duration += test.duration || 0;
                    }
                }
            }
        }
        const structured = {
            status: jsonData.success ? 'success' : 'failure',
            summary: {
                total: jsonData.numTotalTests,
                passed: jsonData.numPassedTests,
                failed: jsonData.numFailedTests,
                skipped: jsonData.numSkippedTests,
                duration: Math.round(duration),
                passRate: Math.round(passRate * 100) / 100 // Round to 2 decimal places
            }
        };
        // For summary format: include summary data and failing test names
        if (format === 'summary') {
            // Include basic information about failed tests (names only, no detailed error info)
            if (jsonData.numFailedTests > 0) {
                const failedTestNames = [];
                for (const suite of jsonData.testResults || []) {
                    const fileName = suite.name.split('/').pop() || suite.name;
                    for (const assertion of suite.assertionResults || []) {
                        if (assertion.status === 'failed') {
                            failedTestNames.push({
                                file: fileName,
                                testName: assertion.fullName || `${assertion.ancestorTitles.join(' › ')} › ${assertion.title}`
                            });
                        }
                    }
                }
                if (failedTestNames.length > 0) {
                    structured.failedTestNames = failedTestNames;
                }
            }
            return structured;
        }
        // For detailed format: include detailed information about failing tests and summary of passing tests
        if (format === 'detailed') {
            // Build detailed information for failed tests only
            const failedTests = [];
            // Summary of passed tests by file
            const passedTestsSummary = [];
            for (const suite of jsonData.testResults || []) {
                const fileName = suite.name.split('/').pop() || suite.name;
                let passedCount = 0;
                let totalDuration = 0;
                for (const assertion of suite.assertionResults || []) {
                    if (assertion.status === 'passed') {
                        passedCount++;
                        totalDuration += assertion.duration || 0;
                    }
                    else if (assertion.status === 'failed') {
                        const failedTest = {
                            file: fileName,
                            testName: assertion.fullName || `${assertion.ancestorTitles.join(' › ')} › ${assertion.title}`,
                            duration: assertion.duration ? Math.round(assertion.duration * 100) / 100 : undefined,
                            error: {
                                type: 'UnknownError',
                                message: 'Test failed',
                                cleanStack: []
                            }
                        };
                        // Add parsed error information if available
                        if (assertion.failureMessages?.length) {
                            const errorMessage = assertion.failureMessages[0];
                            const parsedError = await this.parseError(errorMessage, suite.name);
                            failedTest.error = parsedError;
                        }
                        failedTests.push(failedTest);
                    }
                }
                if (passedCount > 0) {
                    passedTestsSummary.push({
                        file: fileName,
                        passedCount,
                        totalDuration: Math.round(totalDuration * 100) / 100
                    });
                }
            }
            // Add detailed failure information
            if (failedTests.length > 0) {
                structured.failedTests = failedTests;
            }
            // Add passed tests summary
            if (passedTestsSummary.length > 0) {
                structured.passedTestsSummary = passedTestsSummary;
            }
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
export function processTestResult(result, format, context) {
    return outputProcessor.process(result, format, context);
}
//# sourceMappingURL=output-processor.js.map