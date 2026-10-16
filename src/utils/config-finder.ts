import { join } from "path";
import { fileExists } from "./file-utils.js";

const CONFIG_EXTENSIONS = ["ts", "mts", "cts", "js", "mjs", "cjs"];
const MCP_CONFIG_FILES = CONFIG_EXTENSIONS.map((ext) => `vitest.mcp.config.${ext}`);

/**
 * Finds the Vitest configuration file in the project root.
 * Priority order: vitest.mcp.config.*, then vitest.config.*, then vite.config.*,
 * each checked in the order ts, mts, cts, js, mjs, cjs.
 *
 * @param projectRoot The root directory of the project
 * @returns The path to the config file or null if none found
 */
export async function findVitestConfig(projectRoot: string): Promise<string | null> {
  const configCandidates = [
    ...MCP_CONFIG_FILES,
    ...CONFIG_EXTENSIONS.map((ext) => `vitest.config.${ext}`),
    ...CONFIG_EXTENSIONS.map((ext) => `vite.config.${ext}`),
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

/**
 * Finds an MCP-specific Vitest config (vitest.mcp.config.*). When present it is
 * passed to Vitest with --config; otherwise Vitest resolves the project's config itself.
 */
export async function findMcpVitestConfig(projectRoot: string): Promise<string | null> {
  for (const configFile of MCP_CONFIG_FILES) {
    const configPath = join(projectRoot, configFile);
    if (await fileExists(configPath)) {
      return configPath;
    }
  }
  return null;
}
