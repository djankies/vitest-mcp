import { Tool } from '@modelcontextprotocol/sdk/types.js';
/**
 * Tool for listing test files in the project
 */
export declare const listTestsTool: Tool;
export interface ListTestsArgs {
    path?: string;
}
export interface ListTestsResult {
    testFiles: Array<{
        path: string;
        relativePath: string;
        type: 'unit' | 'integration' | 'e2e' | 'unknown';
    }>;
    totalCount: number;
    searchPath: string;
    projectRoot: string;
}
/**
 * Implementation of the list_tests tool
 */
export declare function handleListTests(args: ListTestsArgs): Promise<ListTestsResult>;
//# sourceMappingURL=list-tests.d.ts.map