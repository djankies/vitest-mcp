import { findTestFiles, findProjectRoot, fileExists, isDirectory } from '../utils/file-utils.js';
import { resolve } from 'path';
/**
 * Tool for listing test files in the project
 */
export const listTestsTool = {
    name: 'list_tests',
    description: 'Find and list test files in the project or specified directory',
    inputSchema: {
        type: 'object',
        properties: {
            path: {
                type: 'string',
                description: 'Directory path to search for test files (defaults to project root)'
            }
        }
    }
};
/**
 * Implementation of the list_tests tool
 */
export async function handleListTests(args) {
    try {
        // Determine search path relative to server location, not current working directory  
        // From dist/tools/list-tests.js, go up to project root: ../..
        const serverDir = new URL('../..', import.meta.url).pathname;
        const projectRoot = await findProjectRoot(serverDir);
        const searchPath = args.path ? resolve(projectRoot, args.path) : projectRoot;
        // Validate search path exists
        if (!(await fileExists(searchPath))) {
            throw new Error(`Search path does not exist: ${searchPath}`);
        }
        // Ensure it's a directory
        if (!(await isDirectory(searchPath))) {
            throw new Error(`Search path is not a directory: ${searchPath}`);
        }
        // Find test files
        const testFiles = await findTestFiles(searchPath);
        return {
            testFiles: testFiles.map(file => ({
                path: file.path,
                relativePath: file.relativePath,
                type: file.type
            })),
            totalCount: testFiles.length,
            searchPath,
            projectRoot
        };
    }
    catch (error) {
        throw new Error(`Failed to list test files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
//# sourceMappingURL=list-tests.js.map