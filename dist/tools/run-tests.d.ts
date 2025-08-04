import { Tool } from '@modelcontextprotocol/sdk/types.js';
/**
 * Tool for running Vitest commands safely
 */
export declare const runTestsTool: Tool;
export type TestFormat = 'summary' | 'detailed' | 'json';
export interface RunTestsArgs {
    target: string;
    coverage?: boolean;
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
    coverage?: {
        lines: number;
        functions: number;
        branches: number;
        statements: number;
    };
}
export interface TestFile {
    path: string;
    name: string;
    status: 'passed' | 'failed' | 'skipped';
    duration: number;
    tests: TestCase[];
}
export interface TestCase {
    name: string;
    fullName: string;
    status: 'passed' | 'failed' | 'skipped';
    duration?: number;
    error?: {
        message: string;
        expected?: string;
        actual?: string;
        stack?: string;
    };
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
    files?: TestFile[];
    failures?: Array<{
        file: string;
        test: string;
        error: string;
    }>;
    coverage?: {
        lines: number;
        functions: number;
        branches: number;
        statements: number;
    };
}
export interface ProcessedTestResult extends RunTestsResult {
    format: TestFormat;
    processedOutput: string;
    summary?: TestSummary;
    context: TestResultContext;
    structured: StructuredTestResult;
}
export interface OutputProcessor {
    process(result: RunTestsResult, format: TestFormat, context: TestResultContext): ProcessedTestResult;
}
/**
 * Determine the optimal format based on context and user preference
 */
export declare function determineFormat(args: RunTestsArgs, context: TestExecutionContext, hasFailures?: boolean): TestFormat;
/**
 * Create execution context from target path
 */
export declare function createExecutionContext(targetPath: string): Promise<TestExecutionContext>;
/**
 * Implementation of the run_tests tool
 */
export declare function handleRunTests(args: RunTestsArgs): Promise<ProcessedTestResult>;
//# sourceMappingURL=run-tests.d.ts.map