import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "child_process";
import {
  fileExists,
  isDirectory as isDirectoryPath,
} from "../utils/file-utils.js";
import { resolve, relative } from "path";
import { readFile } from "fs/promises";
import {
  AnalyzeCoverageArgs,
  ProcessedCoverageResult,
  CoverageAnalysisResult,
  RawCoverageData,
} from "../types/coverage-types.js";
import { processCoverageData } from "../utils/coverage-processor.js";
import { getConfig } from "../config/config-loader.js";
import { ResolvedVitestMCPConfig } from "../types/config-types.js";
import {
  checkAllVersions,
  generateVersionReport,
} from "../utils/version-checker.js";
import { projectContext } from "../context/project-context.js";

/**
 * Tool for analyzing test coverage with actionable insights
 */
export const analyzeCoverageTool: Tool = {
  name: "analyze_coverage",
  description:
    'Perform comprehensive test coverage analysis with line-by-line gap identification, actionable insights, and detailed metrics for lines, functions, branches, and statements. Automatically excludes common non-production files (stories, mocks, e2e tests) and provides recommendations for improving coverage. Detects and prevents analysis on test files themselves. Requires set_project_root to be called first.\n\nUSE WHEN: User wants to check test coverage, identify untested code, improve test coverage, asks "what\'s not tested", "coverage report", "how well tested", or mentions coverage/testing quality. Essential when "vitest-mcp:" prefix is used with coverage-related requests. Prefer this over raw vitest coverage commands for actionable insights.',
  inputSchema: {
    type: "object",
    properties: {
      target: {
        type: "string",
        description:
          'Source file path or directory to analyze coverage for. Should target the actual source code files, NOT test files. Can be a specific source file (e.g., "./src/utils/helper.ts") or directory (e.g., "./src/components"). Relative paths resolved from project root. Required to prevent accidental full project analysis which can be slow and resource-intensive.',
      },
      format: {
        type: "string",
        enum: ["summary", "detailed"],
        description:
          'Output format: "summary" (basic metrics), "detailed" (comprehensive analysis with file details)',
        default: "summary",
      },
      exclude: {
        type: "array",
        description:
          'Glob patterns to exclude from coverage analysis. Examples: ["***.test.*", "**/e2emocks/**"]. Useful for excluding test files, stories, mocks, or other non-production code from coverage calculations.',
        items: {
          type: "string",
        },
        default: [],
      },
    },
    required: ["target"],
  },
};

export interface CoverageExecutionResult {
  command: string;
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
  coverageData?: RawCoverageData;
}

/**
 * Main handler for coverage analysis
 */
export async function handleAnalyzeCoverage(
  args: AnalyzeCoverageArgs
): Promise<ProcessedCoverageResult> {
  const startTime = Date.now();
  let builtCommand = "";

  try {
    if (!args.target || args.target.trim() === "") {
      throw new Error(
        "Target parameter is required. Specify a file or directory to analyze coverage."
      );
    }

    const config = await getConfig();

    const threshold = config.coverageDefaults.threshold;
    const format = args.format ?? config.coverageDefaults.format;
    const thresholds = config.coverageDefaults.thresholds;
    const exclude = args.exclude ?? config.coverageDefaults.exclude ?? [];

    let projectRoot: string;
    try {
      projectRoot = projectContext.getProjectRoot();
    } catch {
      return "Please call set_project_root first" as unknown as ProcessedCoverageResult;
    }
    const targetPath = resolve(projectRoot, args.target);

    const isTestFile =
      /\.(test|spec)\.(js|ts|jsx|tsx|mjs|cjs)$/i.test(args.target) ||
      args.target.includes("/__tests__/") ||
      args.target.includes("/tests/") ||
      args.target.includes("\\__tests__\\") ||
      args.target.includes("\\tests\\");

    if (isTestFile) {
      return "Run coverage analysis on the source file, not the test file" as unknown as ProcessedCoverageResult;
    }

    try {
      const commandArray = await buildCoverageCommand(
        { ...args, format, exclude },
        config,
        projectRoot,
        targetPath
      );
      builtCommand = commandArray.join(" ");
    } catch {
      builtCommand = `npx vitest run --coverage ${args.target || ""}`;
    }

    const versionCheck = await checkAllVersions(projectRoot);
    if (versionCheck.errors.length > 0) {
      const report = generateVersionReport(versionCheck);
      throw new Error(`Version compatibility issues found:\n\n${report}`);
    }

    if (!versionCheck.coverageProvider.version) {
      if (process.env.CI !== "true") {
        console.error(
          "Warning: Coverage provider not found. Install @vitest/coverage-v8 for coverage analysis."
        );
      }
    }

    if (!(await fileExists(targetPath))) {
      throw new Error(
        `Target does not exist: ${args.target} (resolved to: ${targetPath})`
      );
    }

    if (
      (await isDirectoryPath(targetPath)) &&
      resolve(targetPath) === resolve(projectRoot)
    ) {
      throw new Error(
        "Cannot analyze coverage for entire project root. Please specify a specific file or subdirectory."
      );
    }

    if (!(await isDirectoryPath(targetPath))) {
      const isTestFile =
        targetPath.includes(".test.") ||
        targetPath.includes(".spec.") ||
        targetPath.includes("__tests__");

      if (isTestFile) {
        throw new Error(
          `Cannot analyze coverage for test file: ${args.target}. Coverage analysis should target source code files, not test files. Try analyzing the source files that this test file covers instead.`
        );
      }
    }

    const coverageResult = await executeCoverageAnalysis(
      { ...args, format, exclude },
      config,
      projectRoot,
      targetPath
    );

    if (!coverageResult.success && !coverageResult.coverageData) {
      throw new Error(
        `Coverage analysis failed: ${coverageResult.stderr || "Unknown error"}`
      );
    }

    if (!coverageResult.coverageData) {
      throw new Error(
        "No coverage data available - coverage analysis may have failed to generate data"
      );
    }

    const result = await processCoverageData(
      coverageResult.coverageData,
      format as "summary" | "detailed",
      {
        target: args.target,
        threshold,
        includeDetails: format === "detailed",
        thresholds: thresholds,
      }
    );

    result.command = coverageResult.command;
    result.duration = Date.now() - startTime;

    return result;
  } catch (error) {
    const errorResult = createErrorAnalysis(error);
    errorResult.command = builtCommand;
    errorResult.duration = Date.now() - startTime;
    errorResult.error =
      error instanceof Error ? error.message : "Unknown error";
    return errorResult;
  }
}

/**
 * Execute Vitest coverage analysis
 */
async function executeCoverageAnalysis(
  args: AnalyzeCoverageArgs,
  config: ResolvedVitestMCPConfig,
  projectRoot: string,
  targetPath: string
): Promise<CoverageExecutionResult> {
  const command = await buildCoverageCommand(
    args,
    config,
    projectRoot,
    targetPath
  );
  const result = await executeCommand(command, projectRoot);

  let coverageData: RawCoverageData | undefined;

  if (result.success || result.stdout) {
    try {
      if (result.stdout.trim()) {
        let jsonOutput;
        const stdout = result.stdout.trim();

        const firstBrace = stdout.indexOf("{");
        if (firstBrace !== -1) {
          let braceCount = 0;
          let jsonEnd = firstBrace;

          for (let i = firstBrace; i < stdout.length; i++) {
            if (stdout[i] === "{") braceCount++;
            if (stdout[i] === "}") braceCount--;

            if (braceCount === 0) {
              jsonEnd = i + 1;
              break;
            }
          }

          const jsonString = stdout.substring(firstBrace, jsonEnd);
          jsonOutput = JSON.parse(jsonString);
        } else {
          jsonOutput = JSON.parse(stdout);
        }

        if (
          jsonOutput.coverageMap &&
          Object.keys(jsonOutput.coverageMap).length > 0
        ) {
          coverageData = transformCoverageData(
            jsonOutput.coverageMap,
            args.target
          );
        } else {
          if (process.env.VITEST_MCP_DEBUG) {
            console.error("JSON output keys:", Object.keys(jsonOutput));
            console.error(
              "No coverageMap found in JSON output, trying coverage-final.json fallback"
            );
          }

          const coverageFilePath = resolve(
            projectRoot,
            "coverage",
            "coverage-final.json"
          );

          if (await fileExists(coverageFilePath)) {
            const coverageFileContent = await readFile(
              coverageFilePath,
              "utf-8"
            );
            const rawCoverageFiles = JSON.parse(coverageFileContent);

            coverageData = transformCoverageData(rawCoverageFiles, args.target);

            if (process.env.VITEST_MCP_DEBUG) {
              console.error(
                "Coverage data loaded from file, files count:",
                Object.keys(rawCoverageFiles).length
              );
              console.error("Coverage summary:", coverageData?.summary);
            }
          } else {
            if (process.env.VITEST_MCP_DEBUG) {
              console.error("Coverage file not found at:", coverageFilePath);
            }
          }
        }
      }
    } catch (parseError) {
      if (process.env.VITEST_MCP_DEBUG || process.env.CI !== "true") {
        console.error("Failed to parse coverage data:", parseError);
        console.error("Raw stdout length:", result.stdout.length);
        console.error("Raw stdout preview:", result.stdout.substring(0, 500));
      }

      if (process.env.CI === "true" && !result.success) {
        console.error(
          "Critical: Coverage parsing failed and command failed in CI"
        );
        console.error(
          "Error:",
          parseError instanceof Error ? parseError.message : parseError
        );
      }
    }
  }

  return {
    ...result,
    coverageData,
  };
}

/**
 * Transform raw coverage file data to expected RawCoverageData format
 */
interface StatementMapping {
  start?: {
    line?: number;
  };
}

interface FunctionMapping {
  name?: string;
  decl?: {
    start?: {
      line?: number;
    };
  };
}

interface BranchMapping {
  loc?: {
    start?: {
      line?: number;
    };
  };
}

interface CoverageFileData {
  path: string;
  statementMap: Record<string, StatementMapping>;
  fnMap: Record<string, FunctionMapping>;
  branchMap: Record<string, BranchMapping>;
  s: Record<string, number>;
  f: Record<string, number>;
  b: Record<string, number[]>;
  inputSourceMap?: unknown;
}

function transformCoverageData(
  rawFiles: Record<string, CoverageFileData>,
  targetPath?: string
): RawCoverageData {
  const relevantFiles: Record<string, CoverageFileData> = {};

  for (const [filePath, fileData] of Object.entries(rawFiles)) {
    if (
      filePath.includes(".test.") ||
      filePath.includes(".spec.") ||
      filePath.includes("__tests__")
    ) {
      continue;
    }

    if (filePath.includes(".stories.") || filePath.includes(".story.")) {
      continue;
    }

    if (filePath.includes("/e2e/") || filePath.includes(".e2e.")) {
      continue;
    }

    if (
      filePath.includes("/test-utils/") ||
      filePath.includes("/mocks/") ||
      filePath.includes("/__mocks__/")
    ) {
      continue;
    }

    const skipPatterns = [
      "/node_modules/",
      "/dist/",
      "/build/",
      "/coverage/",
      "/.next/",
      "/.nuxt/",
      "eslint.config.",
      "vite.config.",
      "vitest.config.",
      "webpack.config.",
      "rollup.config.",
      "babel.config.",
      "jest.config.",
      "tsconfig.",
      "package.json",
      "package-lock.json",
      "yarn.lock",
      "pnpm-lock.",
      ".gitignore",
      ".env",
      "README.",
      "CHANGELOG.",
      "LICENSE",
    ];

    const shouldSkip = skipPatterns.some((pattern) =>
      filePath.includes(pattern)
    );
    if (shouldSkip) {
      continue;
    }

    if (targetPath) {
      const cleanTarget = targetPath.replace(/^\.\//, "");
      const cleanFilePath = filePath.replace(/.*\/([^/]+\/[^/]+)$/, "$1");

      if (
        !filePath.includes(cleanTarget) &&
        !cleanFilePath.includes(cleanTarget)
      ) {
        continue;
      }
    }

    relevantFiles[filePath] = fileData;
  }

  let totalStatements = 0,
    coveredStatements = 0;
  let totalFunctions = 0,
    coveredFunctions = 0;
  let totalBranches = 0,
    coveredBranches = 0;
  let totalLines = 0,
    coveredLines = 0;

  for (const [, fileData] of Object.entries(relevantFiles)) {
    if (fileData.s) {
      const statements = Object.values(fileData.s) as number[];
      totalStatements += statements.length;
      coveredStatements += statements.filter((count) => count > 0).length;
    }

    if (fileData.f) {
      const functions = Object.values(fileData.f) as number[];
      totalFunctions += functions.length;
      coveredFunctions += functions.filter((count) => count > 0).length;
    }

    if (fileData.b) {
      const branches = Object.values(fileData.b).flat() as number[];
      totalBranches += branches.length;
      coveredBranches += branches.filter((count) => count > 0).length;
    }

    if (fileData.s) {
      const statements = Object.values(fileData.s) as number[];
      totalLines += statements.length;
      coveredLines += statements.filter((count) => count > 0).length;
    }
  }

  const summary = {
    lines: {
      total: totalLines,
      covered: coveredLines,
      skipped: 0,
      pct: totalLines > 0 ? (coveredLines / totalLines) * 100 : 0,
    },
    functions: {
      total: totalFunctions,
      covered: coveredFunctions,
      skipped: 0,
      pct: totalFunctions > 0 ? (coveredFunctions / totalFunctions) * 100 : 0,
    },
    statements: {
      total: totalStatements,
      covered: coveredStatements,
      skipped: 0,
      pct:
        totalStatements > 0 ? (coveredStatements / totalStatements) * 100 : 0,
    },
    branches: {
      total: totalBranches,
      covered: coveredBranches,
      skipped: 0,
      pct: totalBranches > 0 ? (coveredBranches / totalBranches) * 100 : 0,
    },
  };

  return {
    files: relevantFiles,
    summary,
  };
}

/**
 * Build Vitest coverage command
 */
async function buildCoverageCommand(
  args: AnalyzeCoverageArgs,
  config: ResolvedVitestMCPConfig,
  projectRoot: string,
  targetPath: string
): Promise<string[]> {
  const command = ["npx", "vitest", "run"];

  command.push("--browser.headless=true");
  command.push("--ui=false");

  command.push("--coverage.clean=true");
  command.push("--coverage.cleanOnRerun=true");

  let excludePatterns: string[];

  if (args.exclude && args.exclude.length > 0) {
    excludePatterns = args.exclude;
  } else {
    excludePatterns = [
      "**/storybook/**",
      "**/.storybook/**",
      "**/storybook-static/**",
      "**/*.stories.*",
      "**/*.story.*",
    ];
  }

  for (const pattern of excludePatterns) {
    command.push("--exclude", pattern);
  }

  if (
    !targetPath.includes(".test.") &&
    !targetPath.includes(".spec.") &&
    !targetPath.includes("__tests__")
  ) {
    const baseName = targetPath.replace(/\.(ts|js|tsx|jsx)$/, "");
    const fileExtension = targetPath.match(/\.(ts|js|tsx|jsx)$/)?.[1] || "ts";
    const parentDir = targetPath.substring(0, targetPath.lastIndexOf("/"));
    const fileName = targetPath
      .substring(targetPath.lastIndexOf("/") + 1)
      .replace(/\.(ts|js|tsx|jsx)$/, "");

    const possibleTestFiles = [
      `${baseName}.test.${fileExtension}`,
      `${baseName}.spec.${fileExtension}`,

      `${parentDir}/__tests__/${fileName}.test.${fileExtension}`,
      `${parentDir}/__tests__/${fileName}.spec.${fileExtension}`,

      `${parentDir}/tests/${fileName}.test.${fileExtension}`,
      `${parentDir}/tests/${fileName}.spec.${fileExtension}`,

      `${projectRoot}/tests/${fileName}.test.${fileExtension}`,
      `${projectRoot}/__tests__/${fileName}.test.${fileExtension}`,
    ];

    let testFilePath: string | null = null;
    for (const testFile of possibleTestFiles) {
      if (await fileExists(testFile)) {
        testFilePath = testFile;
        break;
      }
    }

    if (testFilePath) {
      const relativeTestPath = relative(projectRoot, testFilePath);
      command.push(relativeTestPath);
    }
  } else {
    const relativePath = relative(projectRoot, targetPath);
    if (!relativePath || relativePath === ".") {
      throw new Error(
        "Cannot target project root. Please specify a specific file or subdirectory."
      );
    }
    command.push(relativePath);
  }

  command.push("--coverage");

  for (const pattern of excludePatterns) {
    command.push("--coverage.exclude", pattern);
  }

  command.push("--passWithNoTests");

  command.push("--reporter=json");

  const thresholds = config.coverageDefaults.thresholds;
  if (thresholds) {
    if (thresholds.lines !== undefined && thresholds.lines > 0) {
      command.push(`--coverage.thresholds.lines=${thresholds.lines}`);
    }
    if (thresholds.functions !== undefined && thresholds.functions > 0) {
      command.push(`--coverage.thresholds.functions=${thresholds.functions}`);
    }
    if (thresholds.branches !== undefined && thresholds.branches > 0) {
      command.push(`--coverage.thresholds.branches=${thresholds.branches}`);
    }
    if (thresholds.statements !== undefined && thresholds.statements > 0) {
      command.push(`--coverage.thresholds.statements=${thresholds.statements}`);
    }
  } else if (
    config.coverageDefaults.threshold &&
    config.coverageDefaults.threshold > 0
  ) {
    const threshold = config.coverageDefaults.threshold;
    command.push(`--coverage.thresholds.lines=${threshold}`);
    command.push(`--coverage.thresholds.functions=${threshold}`);
    command.push(`--coverage.thresholds.branches=${threshold}`);
    command.push(`--coverage.thresholds.statements=${threshold}`);
  }

  return command;
}

/**
 * Execute command and return result
 */
async function executeCommand(
  command: string[],
  cwd: string
): Promise<CoverageExecutionResult> {
  const config = await getConfig();

  if (process.env.VITEST_MCP_DEBUG) {
    console.error("Executing command:", command.join(" "));
  }

  return new Promise((resolve) => {
    const [cmd, ...args] = command;

    const child = spawn(cmd, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],

      shell: false,

      ...(process.platform === "win32" && cmd === "npx" ? { shell: true } : {}),

      env: {
        ...process.env,

        STORYBOOK_DISABLE_TELEMETRY: "1",
        SKIP_STORYBOOK: "true",

        VITEST_DISABLE_STORYBOOK: "true",

        CI: "true",

        VITEST_UI: "false",

        HEADLESS: "true",

        FORCE_COLOR: "0",
        NO_COLOR: "1",
      },
    });

    let stdout = "";
    let stderr = "";

    const timeoutMs = config.testDefaults.timeout * 2;
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({
        command: command.join(" "),
        success: false,
        stdout,
        stderr: `Coverage analysis timed out after ${
          timeoutMs / 1000
        } seconds. Try analyzing a smaller target.`,
        exitCode: 124,
        duration: timeoutMs,
      });
    }, timeoutMs);

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({
        command: command.join(" "),
        success: code === 0,
        stdout,
        stderr,
        exitCode: code || 0,
        duration: 0,
      });
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({
        command: command.join(" "),
        success: false,
        stdout,
        stderr: `Process error: ${error.message}`,
        exitCode: 1,
        duration: 0,
      });
    });
  });
}

/**
 * Create error analysis result with specific guidance based on error type
 */
function createErrorAnalysis(_error: unknown): CoverageAnalysisResult {
  return {
    success: false,
    coverage: {
      lines: 0,
      functions: 0,
      branches: 0,
      statements: 0,
    },
    totals: {
      lines: 0,
      functions: 0,
      branches: 0,
    },
    meetsThreshold: false,
    command: "",
    duration: 0,
  };
}
