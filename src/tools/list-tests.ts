import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { findTestFiles, fileExists, isDirectory } from "../utils/file-utils.js";
import { resolve } from "path";
import { projectContext } from "../context/project-context.js";

/**
 * Tool for listing test files in the project
 */
export const listTestsTool: Tool = {
  name: "list_tests",
  description:
    'Discover and catalog test files across the project with support for common test file patterns (.test.*, .spec.*). Recursively searches directories and provides structured file information including paths and relative locations. Useful for understanding test organization and coverage scope. Requires set_project_root to be called first.\n\nUSE WHEN: User wants to explore test structure, find test files, understand test organization, or asks "what tests exist", "show me test files", or mentions exploring/finding tests. Also use when "vitest-mcp:" prefix is included and context involves test discovery.',
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          'Optional directory path to search for test files. Can be relative (e.g., "./src/components") or absolute. If not provided, searches the entire project root. Useful for limiting search scope to specific directories or modules.',
      },
    },
  },
};

export interface ListTestsArgs {
  path?: string;
}

export interface ListTestsResult {
  testFiles: Array<{
    path: string;
    relativePath: string;
  }>;
  totalCount: number;
  searchPath: string;
  projectRoot: string;
}

/**
 * Implementation of the list_tests tool
 */
export async function handleListTests(
  args: ListTestsArgs
): Promise<ListTestsResult> {
  try {
    let projectRoot: string;
    try {
      projectRoot = projectContext.getProjectRoot();
    } catch {
      throw new Error("Please call set_project_root first");
    }
    const searchPath = args.path
      ? resolve(projectRoot, args.path)
      : projectRoot;

    if (!(await fileExists(searchPath))) {
      throw new Error(`Search path does not exist: ${searchPath}`);
    }

    if (!(await isDirectory(searchPath))) {
      throw new Error(`Search path is not a directory: ${searchPath}`);
    }

    const testFiles = await findTestFiles(searchPath);

    return {
      testFiles: testFiles.map((file) => ({
        path: file.path,
        relativePath: file.relativePath,
      })),
      totalCount: testFiles.length,
      searchPath,
      projectRoot,
    };
  } catch (error) {
    throw new Error(
      `Failed to list test files: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}
