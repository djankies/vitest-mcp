import { fileExists, isDirectory } from "../utils/file-utils.js";
import { join } from "path";

/**
 * Manages the project root context for the MCP server session
 * This ensures all tools operate on the correct repository
 */
class ProjectContextManager {
  private projectRoot: string | null = null;
  private isValidated: boolean = false;

  /**
   * Set the project root directory
   * @param absolutePath - Must be an absolute path to a valid project directory
   */
  async setProjectRoot(absolutePath: string): Promise<void> {
    if (!absolutePath.startsWith("/") && !absolutePath.match(/^[A-Z]:\\/)) {
      throw new Error(
        "Project root must be an absolute path (starting with / on Unix or drive letter on Windows)"
      );
    }

    if (!(await fileExists(absolutePath))) {
      throw new Error(`Directory does not exist: ${absolutePath}`);
    }

    if (!(await isDirectory(absolutePath))) {
      throw new Error(`Path is not a directory: ${absolutePath}`);
    }

    const hasPackageJson = await fileExists(join(absolutePath, "package.json"));
    const hasVitestConfig =
      (await fileExists(join(absolutePath, "vitest.config.ts"))) ||
      (await fileExists(join(absolutePath, "vitest.config.js"))) ||
      (await fileExists(join(absolutePath, "vitest.config.mjs")));

    if (!hasPackageJson && !hasVitestConfig) {
      throw new Error(
        `Directory does not appear to be a valid project (no package.json or vitest.config found): ${absolutePath}`
      );
    }

    if (hasPackageJson && process.env.VITEST_MCP_DEV_MODE !== "true") {
      try {
        const { readFile } = await import("fs/promises");
        const packageJsonPath = join(absolutePath, "package.json");
        const packageContent = await readFile(packageJsonPath, "utf-8");
        const packageData = JSON.parse(packageContent);

        if (packageData.name === "@djankies/vitest-mcp") {
          throw new Error(
            "Cannot set project root to the Vitest MCP package itself. This tool is meant to test other projects, not itself. (Set VITEST_MCP_DEV_MODE=true to override for development)"
          );
        }
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("Vitest MCP package")
        ) {
          throw error;
        }
      }
    }

    this.projectRoot = absolutePath;
    this.isValidated = true;
  }

  /**
   * Get the current project root
   * @throws Error if project root has not been set
   */
  getProjectRoot(): string {
    if (!this.projectRoot) {
      throw new Error(
        "Project root has not been set. Please use the set_project_root tool first to specify which repository to work with."
      );
    }
    return this.projectRoot;
  }

  /**
   * Check if project root has been set
   */
  hasProjectRoot(): boolean {
    return this.projectRoot !== null && this.isValidated;
  }

  /**
   * Clear the project root (mainly for testing)
   */
  reset(): void {
    this.projectRoot = null;
    this.isValidated = false;
  }

  /**
   * Get project info for display
   */
  getProjectInfo(): { path: string; name: string } | null {
    if (!this.projectRoot) {
      return null;
    }

    const parts = this.projectRoot.split("/").filter(Boolean);
    const name = parts[parts.length - 1] || "unknown";

    return {
      path: this.projectRoot,
      name,
    };
  }
}

export const projectContext = new ProjectContextManager();
