/**
 * Locates the project's own Vitest installation and runs it directly with Node.
 *
 * Running `node <project>/node_modules/vitest/vitest.mjs` instead of `npx vitest`
 * means arguments are never interpreted by a shell, a missing Vitest is reported
 * instead of silently downloaded, and the same code path works on every platform.
 */

import { spawn } from "child_process";
import { readFile, mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

export interface InstalledPackage {
  name: string;
  version: string;
  dir: string;
}

export interface VitestInstallation extends InstalledPackage {
  binPath: string;
}

export interface VitestRunOptions {
  cwd: string;
  args: string[];
  timeoutMs: number;
  env?: Record<string, string>;
}

export interface VitestRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

/** Exit code reported when Vitest is stopped for exceeding the timeout (matches `timeout(1)`). */
export const TIMEOUT_EXIT_CODE = 124;

/**
 * Find an installed package by walking up from `startDir` through each
 * `node_modules` directory, the same way Node resolves bare imports. This also
 * covers monorepos where dependencies are hoisted to the workspace root.
 */
export async function findInstalledPackage(
  startDir: string,
  name: string
): Promise<InstalledPackage | null> {
  let dir = resolve(startDir);

  for (;;) {
    const pkgDir = join(dir, "node_modules", name);
    try {
      const pkg = JSON.parse(await readFile(join(pkgDir, "package.json"), "utf-8"));
      if (typeof pkg.version === "string") {
        return { name, version: pkg.version, dir: pkgDir };
      }
    } catch {
      // Not installed at this level, keep walking up
    }

    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

/**
 * Find the Vitest installation that `projectRoot` would use.
 */
export async function findVitest(projectRoot: string): Promise<VitestInstallation | null> {
  const installed = await findInstalledPackage(projectRoot, "vitest");
  if (!installed) {
    return null;
  }

  let binPath = join(installed.dir, "vitest.mjs");
  try {
    const pkg = JSON.parse(await readFile(join(installed.dir, "package.json"), "utf-8"));
    const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.vitest;
    if (typeof bin === "string") {
      binPath = join(installed.dir, bin);
    }
  } catch {
    // Fall back to the conventional entry point
  }

  return { ...installed, binPath };
}

/**
 * Run Vitest with the given arguments. Never uses a shell.
 */
export function runVitest(
  vitest: VitestInstallation,
  options: VitestRunOptions
): Promise<VitestRunResult> {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [vitest.binPath, ...options.args], {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      windowsHide: true,
      env: {
        ...process.env,
        // Keep output machine-readable and stop watch mode / interactive UIs.
        CI: "true",
        FORCE_COLOR: "0",
        NO_COLOR: "1",
        ...options.env,
      },
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let timedOut = false;
    let settled = false;

    child.stdout?.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    let killTimer: NodeJS.Timeout | undefined;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), 2000);
      killTimer.unref();
    }, options.timeoutMs);

    const finish = (exitCode: number, extraStderr = "") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);

      let stderr = Buffer.concat(stderrChunks).toString("utf8") + extraStderr;
      if (timedOut) {
        stderr += `\nVitest was stopped after exceeding the ${Math.round(options.timeoutMs / 1000)}s timeout.`;
      }

      resolvePromise({
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr,
        exitCode: timedOut ? TIMEOUT_EXIT_CODE : exitCode,
        timedOut,
      });
    };

    // `code` is null when the process was killed by a signal; that is never a success.
    child.on("close", (code) => finish(code ?? 1));
    child.on("error", (error) => finish(1, `Failed to start Vitest: ${error.message}`));
  });
}

/**
 * Create a private temporary directory for one tool run and return it with a
 * cleanup function. Reports and logs go here so nothing is written to the project.
 */
export async function createRunDirectory(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "vitest-mcp-"));
  return {
    dir,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

/**
 * Absolute path of the console-capturing reporter shipped with this package.
 */
export function consoleReporterPath(): string {
  return fileURLToPath(new URL("../reporters/console-reporter.js", import.meta.url));
}
