/**
 * Basic file utilities for the Vitest MCP server
 */
export interface TestFile {
    path: string;
    relativePath: string;
    type: 'unit' | 'integration' | 'e2e' | 'unknown';
}
/**
 * Check if a file or directory exists
 */
export declare function fileExists(path: string): Promise<boolean>;
/**
 * Check if a path is a directory
 */
export declare function isDirectory(path: string): Promise<boolean>;
/**
 * Find test files in a directory recursively
 */
export declare function findTestFiles(searchPath?: string): Promise<TestFile[]>;
/**
 * Get project root directory (look for package.json)
 */
export declare function findProjectRoot(startPath?: string): Promise<string>;
//# sourceMappingURL=file-utils.d.ts.map