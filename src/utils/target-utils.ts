/**
 * Validation for user-supplied targets and project names before they are
 * passed to Vitest as command-line arguments.
 */

import { isAbsolute, relative, resolve, sep } from "path";
import { fileExists, isDirectory } from "./file-utils.js";

export interface ResolvedTarget {
  absolutePath: string;
  /** Path relative to the project root, using forward slashes. */
  relativePath: string;
  isDirectory: boolean;
}

/**
 * Resolve a target against the project root and make sure it is safe to hand to Vitest.
 */
export async function resolveTarget(
  projectRoot: string,
  target: string | undefined,
  kind: "run tests on" | "analyze coverage for"
): Promise<ResolvedTarget> {
  if (!target || target.trim() === "") {
    throw new Error(
      `Target parameter is required. Specify a file or directory to ${kind} (prevents accidental full-project runs).`
    );
  }

  const absolutePath = resolve(projectRoot, target);
  const rel = relative(projectRoot, absolutePath);

  if (rel === "") {
    throw new Error(
      `Cannot ${kind} the entire project root. Please specify a specific file or subdirectory.`
    );
  }

  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`Target must be inside the project root: ${target}`);
  }

  if (!(await fileExists(absolutePath))) {
    throw new Error(`Target does not exist: ${target} (resolved to: ${absolutePath})`);
  }

  const relativePath = rel.split(sep).join("/");
  if (relativePath.startsWith("-")) {
    throw new Error(`Target paths starting with "-" are not supported: ${target}`);
  }

  return {
    absolutePath,
    relativePath,
    isDirectory: await isDirectory(absolutePath),
  };
}

/**
 * Vitest project names come from the user's config; reject anything that could be
 * read as a flag or that contains control characters.
 */
export function validateProjectName(project: string | undefined): string | undefined {
  if (project === undefined) {
    return undefined;
  }
  const trimmed = project.trim();
  if (trimmed === "") {
    return undefined;
  }
  // eslint-disable-next-line no-control-regex
  if (trimmed.startsWith("-") || /[\u0000-\u001f]/.test(trimmed)) {
    throw new Error(`Invalid project name: ${JSON.stringify(project)}`);
  }
  return trimmed;
}
