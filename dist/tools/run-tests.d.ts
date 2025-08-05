import { Tool } from '@modelcontextprotocol/sdk/types.js';
/**
 * Tool for running Vitest commands safely
 */
export declare const runTestsTool: Tool;
export type TestFormat = 'summary' | 'detailed';
export interface RunTestsArgs {
    target: string;
    format?: TestFormat;
}
export interface RunTestsResult {
    command: string;
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
    duration: number;
}
export interface TestExecutionContext {
    isMultiFile: boolean;
    targetType: 'file' | 'directory';
    estimatedTestCount?: number;
}
export interface TestResultContext extends TestExecutionContext {
    hasFailures: boolean;
    actualTestCount: number;
    executionTime: number;
}
export interface TestSummary {
    totalTests: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
}
export interface StructuredTestResult {
    status: 'success' | 'failure' | 'error';
    summary: {
        total: number;
        passed: number;
        failed: number;
        skipped: number;
        duration: number;
        passRate: number;
    };
    failedTestNames?: Array<{
        file: string;
        testName: string;
    }>;
    failedTests?: Array<{
        file: string;
        testName: string;
        error: {
            type: string;
            message: string;
            expected?: any;
            actual?: any;
            testIntent?: string;
            codeSnippet?: string[];
            cleanStack: string[];
            rawError?: string;
        };
        duration?: number;
    }>;
    passedTestsSummary?: Array<{
        file: string;
        passedCount: number;
        totalDuration: number;
    }>;
}
export interface ProcessedTestResult extends RunTestsResult {
    format: TestFormat;
    processedOutput: string;
    summary?: TestSummary;
    context: TestResultContext;
    structured: StructuredTestResult;
}
export interface OutputProcessor {
    process(result: RunTestsResult, format: TestFormat, context: TestResultContext): Promise<ProcessedTestResult>;
}
/**
 * Determine the optimal format based on context and user preference
 */
export declare function determineFormat(args: RunTestsArgs, context: TestExecutionContext, hasFailures?: boolean): Promise<TestFormat>;
/**
 * Create execution context from target path
 */
export declare function createExecutionContext(targetPath: string): Promise<TestExecutionContext>;
/**
 * Implementation of the run_tests tool
 */
export declare function handleRunTests(args: RunTestsArgs): Promise<ProcessedTestResult>;
//# sourceMappingURL=run-tests.d.ts.map