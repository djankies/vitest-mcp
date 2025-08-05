import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { findTestFiles, fileExists, isDirectory } from '../utils/file-utils.js';
import { resolve } from 'path';
import { projectContext } from '../context/project-context.js';

/**
 * Tool for listing test files in the project
 */
export const listTestsTool: Tool = {
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
export async function handleListTests(args: ListTestsArgs): Promise<ListTestsResult> {
  try {
    // Get project root from the project context (must be set first)
    let projectRoot: string;
    try {
      projectRoot = projectContext.getProjectRoot();
    } catch (error) {
      throw new Error('Project root has not been set. Please use the set_project_root tool first to specify which repository to work with.');
    }
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
    
  } catch (error) {
    throw new Error(`Failed to list test files: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}