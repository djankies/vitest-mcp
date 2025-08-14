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
 * CoverageAnalyzer class - Handles coverage analysis with single responsibility methods
 */
class CoverageAnalyzer {
  private projectRoot: string;
  private startTime: number;
  private config: ResolvedVitestMCPConfig | null = null;

  constructor() {
    this.startTime = performance.now();
    this.projectRoot = "";
  }

  /**
   * Validate input arguments and project context
   */
  private async validateInput(args: AnalyzeCoverageArgs): Promise<{ targetPath: string; config: ResolvedVitestMCPConfig }> {
    if (!args.target || args.target.trim() === "") {
      throw new Error(
        "Target parameter is required. Specify a file or directory to analyze coverage."
      );
    }

    this.config = await getConfig();

    try {
      this.projectRoot = projectContext.getProjectRoot();
    } catch {
      throw new Error("Please call set_project_root first");
    }

    const targetPath = resolve(this.projectRoot, args.target);

    // Check if target is a test file
    if (this.isTestFile(args.target)) {
      throw new Error("Run coverage analysis on the source file, not the test file");
    }

    return { targetPath, config: this.config };
  }

  /**
   * Check if the target is a test file
   */
  private isTestFile(target: string): boolean {
    return /\.(test|spec)\.(js|ts|jsx|tsx|mjs|cjs)$/i.test(target) ||
      target.includes("/__tests__/") ||
      target.includes("/tests/") ||
      target.includes("\\__tests__\\") ||
      target.includes("\\tests\\");
  }

  /**
   * Validate versions and target path
   */
  private async validateEnvironment(targetPath: string): Promise<void> {
    const versionCheck = await checkAllVersions(this.projectRoot);
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
        `Target does not exist: ${targetPath}`
      );
    }

    if (
      (await isDirectoryPath(targetPath)) &&
      resolve(targetPath) === resolve(this.projectRoot)
    ) {
      throw new Error(
        "Cannot analyze coverage for entire project root. Please specify a specific file or subdirectory."
      );
    }

    // Additional test file check for single files
    if (!(await isDirectoryPath(targetPath))) {
      const isTestFile =
        targetPath.includes(".test.") ||
        targetPath.includes(".spec.") ||
        targetPath.includes("__tests__");

      if (isTestFile) {
        throw new Error(
          `Cannot analyze coverage for test file. Coverage analysis should target source code files, not test files. Try analyzing the source files that this test file covers instead.`
        );
      }
    }
  }

  /**
   * Execute coverage analysis and get raw results
   */
  private async executeCoverage(args: AnalyzeCoverageArgs): Promise<CoverageExecutionResult> {
    const { targetPath, config } = await this.validateInput(args);
    await this.validateEnvironment(targetPath);

    // Don't modify exclude here - let getExcludePatterns handle the defaults
    const finalArgs = {
      ...args,
      format: args.format ?? config.coverageDefaults.format,
    };

    return await this.executeCoverageAnalysis(finalArgs, config, targetPath);
  }

  /**
   * Process coverage results
   */
  private async processCoverageResults(
    args: AnalyzeCoverageArgs,
    coverageResult: CoverageExecutionResult
  ): Promise<ProcessedCoverageResult> {
    // Only throw if we have neither success nor coverage data
    // When thresholds fail, success is false but we still have coverage data
    if (!coverageResult.coverageData) {
      // Filter out known warnings from stderr before using it in error message
      const cleanedStderr = this.filterWarningsFromStderr(coverageResult.stderr);
      throw new Error(
        `Coverage analysis failed: ${cleanedStderr || "No coverage data available"}`
      );
    }

    const config = this.config!;
    const format = args.format ?? config.coverageDefaults.format;
    
    const result = await processCoverageData(
      coverageResult.coverageData,
      format as "summary" | "detailed",
      {
        target: args.target,
      }
    );

    result.command = coverageResult.command;
    result.duration = Math.round((performance.now() - this.startTime) * 100) / 100;

    return result;
  }

  /**
   * Create error result
   */
  private createErrorResult(error: unknown, builtCommand: string): ProcessedCoverageResult {
    const errorResult = createErrorAnalysis(error);
    errorResult.command = builtCommand;
    errorResult.duration = Date.now() - this.startTime;
    errorResult.error = error instanceof Error ? error.message : "Unknown error";
    return errorResult;
  }

  /**
   * Build command for display purposes
   */
  private buildDisplayCommand(args: AnalyzeCoverageArgs): string {
    try {
      return `npx vitest run --coverage ${args.target || ""}`;
    } catch {
      return `npx vitest run --coverage ${args.target || ""}`;
    }
  }

  /**
   * Main execution method
   */
  async execute(args: AnalyzeCoverageArgs): Promise<ProcessedCoverageResult> {
    let builtCommand = "";

    try {
      builtCommand = this.buildDisplayCommand(args);
      
      const coverageResult = await this.executeCoverage(args);
      return await this.processCoverageResults(args, coverageResult);
    } catch (error) {
      return this.createErrorResult(error, builtCommand);
    }
  }

  /**
   * Execute Vitest coverage analysis with proper command building
   */
  private async executeCoverageAnalysis(
    args: AnalyzeCoverageArgs,
    config: ResolvedVitestMCPConfig,
    targetPath: string
  ): Promise<CoverageExecutionResult> {
    const command = await this.buildCoverageCommand(args, config, targetPath);
    const result = await executeCommand(command, this.projectRoot);

    let coverageData: RawCoverageData | undefined;

    // Try to parse coverage data regardless of exit code
    // Coverage might still be generated even if tests fail
    try {
      coverageData = await this.parseCoverageData(result.stdout, args.target);
    } catch (parseError) {
      this.handleParseError(parseError, result);
    }

    return {
      ...result,
      coverageData,
    };
  }

  /**
   * Parse coverage data from stdout or fallback to file
   */
  private async parseCoverageData(stdout: string, target: string): Promise<RawCoverageData | undefined> {
    if (!stdout.trim()) {
      // If no stdout, try loading from file directly
      return await this.loadCoverageFromFile(target);
    }

    try {
      let jsonOutput;
      const trimmedStdout = stdout.trim();

      // Extract JSON from stdout
      const firstBrace = trimmedStdout.indexOf("{");
      if (firstBrace !== -1) {
        let braceCount = 0;
        let jsonEnd = firstBrace;

        for (let i = firstBrace; i < trimmedStdout.length; i++) {
          if (trimmedStdout[i] === "{") braceCount++;
          if (trimmedStdout[i] === "}") braceCount--;

          if (braceCount === 0) {
            jsonEnd = i + 1;
            break;
          }
        }

        const jsonString = trimmedStdout.substring(firstBrace, jsonEnd);
        jsonOutput = JSON.parse(jsonString);
      } else {
        jsonOutput = JSON.parse(trimmedStdout);
      }

      // Check if we have json-summary format (has 'total' field)
      if (jsonOutput.total) {
        // json-summary format - we still need to load the detailed coverage from file
        // But we can use the summary for quick validation
        if (process.env.VITEST_MCP_DEBUG) {
          console.error("Found json-summary in stdout, loading detailed coverage from file");
        }
        return await this.loadCoverageFromFile(target);
      }

      // Check for coverageMap (old format)
      if (jsonOutput.coverageMap && Object.keys(jsonOutput.coverageMap).length > 0) {
        return transformCoverageData(jsonOutput.coverageMap, target);
      }
    } catch (parseError) {
      if (process.env.VITEST_MCP_DEBUG) {
        console.error("Failed to parse stdout as JSON:", parseError);
      }
    }

    // Fallback to coverage file
    return await this.loadCoverageFromFile(target);
  }

  /**
   * Load coverage data from file as fallback
   */
  private async loadCoverageFromFile(target: string): Promise<RawCoverageData | undefined> {
    if (process.env.VITEST_MCP_DEBUG) {
      console.error("No coverageMap found in JSON output, trying coverage-final.json fallback");
    }

    const coverageFilePath = resolve(this.projectRoot, "coverage", "coverage-final.json");

    if (await fileExists(coverageFilePath)) {
      const coverageFileContent = await readFile(coverageFilePath, "utf-8");
      const rawCoverageFiles = JSON.parse(coverageFileContent);

      const coverageData = transformCoverageData(rawCoverageFiles, target);

      if (process.env.VITEST_MCP_DEBUG) {
        console.error("Coverage data loaded from file, files count:", Object.keys(rawCoverageFiles).length);
        console.error("Coverage summary:", coverageData?.summary);
      }

      return coverageData;
    } else {
      if (process.env.VITEST_MCP_DEBUG) {
        console.error("Coverage file not found at:", coverageFilePath);
      }
    }

    return undefined;
  }

  /**
   * Handle coverage data parsing errors
   */
  private handleParseError(parseError: unknown, result: CoverageExecutionResult): void {
    if (process.env.VITEST_MCP_DEBUG || process.env.CI !== "true") {
      console.error("Failed to parse coverage data:", parseError);
      console.error("Raw stdout length:", result.stdout.length);
      console.error("Raw stdout preview:", result.stdout.substring(0, 500));
    }

    if (process.env.CI === "true" && !result.success) {
      console.error("Critical: Coverage parsing failed and command failed in CI");
      console.error("Error:", parseError instanceof Error ? parseError.message : parseError);
    }
  }

  /**
   * Build Vitest coverage command with all necessary flags
   */
  private async buildCoverageCommand(
    args: AnalyzeCoverageArgs,
    config: ResolvedVitestMCPConfig,
    targetPath: string
  ): Promise<string[]> {
    const command = ["npx", "vitest", "run"];

    // Basic coverage settings
    // Don't force browser mode - let the project configuration determine this
    // Coverage works with or without browser mode depending on project setup
    command.push("--ui=false");
    command.push("--coverage.clean=true");
    command.push("--coverage.cleanOnRerun=true");

    // Add target files first (must come before --coverage flag)
    await this.addTargetToCommand(command, args, targetPath);

    // Enable coverage
    command.push("--coverage");

    // Add coverage exclusions (not test exclusions)
    // Note: --exclude is for test files, --coverage.exclude is for coverage reporting
    const excludePatterns = this.getExcludePatterns(args);
    for (const pattern of excludePatterns) {
      command.push(`--coverage.exclude=${pattern}`);
    }

    // Use JSON reporter for coverage output
    // This creates coverage/coverage-final.json file
    command.push("--coverage.reporter=json");
    
    command.push("--passWithNoTests");
    command.push("--reporter=json");

    return command;
  }

  /**
   * Get exclude patterns for coverage
   */
  private getExcludePatterns(args: AnalyzeCoverageArgs): string[] {
    // Only use custom patterns if explicitly provided and non-empty
    if (args.exclude && args.exclude.length > 0) {
      return args.exclude;
    }

    // Default patterns for common non-production files
    return [
      "**/storybook/**",
      "**/.storybook/**",
      "**/storybook-static/**",
      "**/*.stories.*",
      "**/*.story.*",
    ];
  }

  /**
   * Add target to command, finding test files if needed
   */
  private async addTargetToCommand(
    command: string[],
    args: AnalyzeCoverageArgs,
    targetPath: string
  ): Promise<void> {
    if (
      !targetPath.includes(".test.") &&
      !targetPath.includes(".spec.") &&
      !targetPath.includes("__tests__")
    ) {
      const testFilePath = await this.findTestFile(targetPath);
      if (testFilePath) {
        const relativeTestPath = relative(this.projectRoot, testFilePath);
        command.push(relativeTestPath);
        return;
      }
    }

    const relativePath = relative(this.projectRoot, targetPath);
    if (!relativePath || relativePath === ".") {
      throw new Error(
        "Cannot target project root. Please specify a specific file or subdirectory."
      );
    }
    command.push(relativePath);
  }

  /**
   * Filter out known warnings from stderr
   */
  private filterWarningsFromStderr(stderr: string): string {
    if (!stderr) return "";
    
    // Split into lines and filter out known warnings
    const lines = stderr.split('\n');
    const filteredLines = lines.filter(line => {
      const trimmedLine = line.trim();
      
      // Filter out Vite CJS deprecation warning
      if (trimmedLine.includes('The CJS build of Vite\'s Node API is deprecated')) {
        return false;
      }
      if (trimmedLine.includes('https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated')) {
        return false;
      }
      
      // Filter out other known non-error warnings
      if (trimmedLine.includes('DEPRECATED')) {
        return false;
      }
      
      // Keep actual errors
      return trimmedLine.length > 0;
    });
    
    return filteredLines.join('\n').trim();
  }

  /**
   * Find corresponding test file for a source file
   */
  private async findTestFile(targetPath: string): Promise<string | null> {
    const baseName = targetPath.replace(/\.(ts|js|tsx|jsx|mjs|cjs)$/, "");
    const fileExtension = targetPath.match(/\.(ts|js|tsx|jsx|mjs|cjs)$/)?.[1] || "ts";
    const parentDir = targetPath.substring(0, targetPath.lastIndexOf("/"));
    const fileName = targetPath
      .substring(targetPath.lastIndexOf("/") + 1)
      .replace(/\.(ts|js|tsx|jsx|mjs|cjs)$/, "");

    const possibleTestFiles = [
      `${baseName}.test.${fileExtension}`,
      `${baseName}.spec.${fileExtension}`,
      `${parentDir}/__tests__/${fileName}.test.${fileExtension}`,
      `${parentDir}/__tests__/${fileName}.spec.${fileExtension}`,
      `${parentDir}/tests/${fileName}.test.${fileExtension}`,
      `${parentDir}/tests/${fileName}.spec.${fileExtension}`,
      `${this.projectRoot}/tests/${fileName}.test.${fileExtension}`,
      `${this.projectRoot}/__tests__/${fileName}.test.${fileExtension}`,
    ];

    for (const testFile of possibleTestFiles) {
      if (await fileExists(testFile)) {
        return testFile;
      }
    }

    return null;
  }

}

/**
 * Main handler for coverage analysis
 */
export async function handleAnalyzeCoverage(
  args: AnalyzeCoverageArgs
): Promise<ProcessedCoverageResult> {
  const analyzer = new CoverageAnalyzer();
  return await analyzer.execute(args);
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
        
        // Suppress Vite CJS deprecation warning
        VITE_CJS_IGNORE_WARNING: "true",
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
      if (process.env.VITEST_MCP_DEBUG) {
        console.error('Command exit code:', code, 'stderr length:', stderr.length);
        if (stderr) {
          console.error('stderr content:', stderr.substring(0, 200));
        }
      }
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
    summary: "❌ Coverage analysis failed",
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
    command: "",
    duration: 0,
  };
}
