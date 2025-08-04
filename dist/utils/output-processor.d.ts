/**
 * Output processor for Vitest results - transforms raw Vitest output into LLM-optimized formats
 */
import { RunTestsResult, ProcessedTestResult, TestFormat, TestResultContext, OutputProcessor } from '../tools/run-tests.js';
/**
 * Main output processor implementation
 */
export declare class VitestOutputProcessor implements OutputProcessor {
    process(result: RunTestsResult, format: TestFormat, context: TestResultContext): Promise<ProcessedTestResult>;
    /**
     * Parse Vitest JSON output
     */
    private parseVitestJson;
    /**
     * Extract summary information from raw Vitest output
     */
    private extractSummaryFromOutput;
    /**
     * Extract summary from Vitest JSON output
     */
    private extractSummaryFromJson;
    /**
     * Extract test details from output
     */
    private extractTestDetails;
    /**
     * Extract test details from JSON data
     */
    private extractTestDetailsFromJson;
    /**
     * Extract failure details from JSON data
     */
    private extractFailureDetailsFromJson;
    /**
     * Extract failure details from output
     */
    private extractFailureDetails;
    /**
     * Format failure detail for output
     */
    private formatFailureDetail;
    /**
     * Clean stderr output for relevance
     */
    private cleanStderr;
    /**
     * Clean JSON output for LLM consumption
     */
    private cleanJsonForLLM;
    /**
     * Parse error information from Vitest failure messages
     */
    private parseError;
    /**
     * Parse a value string into appropriate type
     */
    private parseValue;
    /**
     * Extract code snippet around the failing line
     */
    private extractCodeSnippet;
    /**
     * Generate structured test result for LLM consumption
     */
    private generateStructuredResult;
}
/**
 * Create and export a default processor instance
 */
export declare const outputProcessor: VitestOutputProcessor;
/**
 * Convenience function for processing test results
 */
export declare function processTestResult(result: RunTestsResult, format: TestFormat, context: TestResultContext): Promise<ProcessedTestResult>;
//# sourceMappingURL=output-processor.d.ts.map