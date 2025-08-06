import { join } from "path";
import { fileExists } from "./file-utils.js";

/**
 * Finds the appropriate Vitest configuration file in the project root.
 * Priority order:
 * 1. vitest.mcp.config.ts (MCP-specific config)
 * 2. vitest.config.ts
 * 3. vitest.config.js
 * 4. vitest.config.mjs
 * 5. vite.config.ts (if it contains test configuration)
 * 6. vite.config.js (if it contains test configuration)
 * 7. vite.config.mjs (if it contains test configuration)
 * 
 * @param projectRoot The root directory of the project
 * @returns The path to the config file or null if none found
 */
export async function findVitestConfig(projectRoot: string): Promise<string | null> {
  const configCandidates = [
    "vitest.mcp.config.ts",
    "vitest.config.ts",
    "vitest.config.js",
    "vitest.config.mjs",
    "vite.config.ts",
    "vite.config.js",
    "vite.config.mjs",
  ];

  for (const configFile of configCandidates) {
    const configPath = join(projectRoot, configFile);
    if (await fileExists(configPath)) {
      return configPath;
    }
  }

  return null;
}

/**
 * Checks if a project has a valid Vitest configuration
 * @param projectRoot The root directory of the project
 * @returns true if a valid config exists
 */
export async function hasVitestConfig(projectRoot: string): Promise<boolean> {
  const config = await findVitestConfig(projectRoot);
  return config !== null;
}