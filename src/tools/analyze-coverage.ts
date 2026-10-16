import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { readdir, readFile } from "fs/promises";
import { join, relative, sep } from "path";
import {
  AnalyzeCoverageArgs,
  ProcessedCoverageResult,
  CoverageAnalysisResult,
  RawCoverageData,
} from "../types/coverage-types.js";
import { computeLineHits, processCoverageData } from "../utils/coverage-processor.js";
import { getConfig } from "../config/config-loader.js";
import {
  checkAllVersions,
  generateVersionReport,
} from "../utils/version-checker.js";
import { projectContext } from "../context/project-context.js";
import { findMcpVitestConfig } from "../utils/config-finder.js";
import {
  createRunDirectory,
  findVitest,
  runVitest,
  VitestInstallation,
  VitestRunResult,
} from "../utils/vitest-runner.js";
import { ResolvedTarget, resolveTarget, validateProjectName } from "../utils/target-utils.js";

/**
 * Tool for analyzing test coverage with actionable insights
 */
export const analyzeCoverageTool: Tool = {
  name: "analyze_coverage",
  description:
    'Perform comprehensive test coverage analysis with line-by-line gap identification, actionable insights, and detailed metrics for lines, functions, branches, and statements. Runs the tests that import the target (wherever they live, e.g. ./test or __tests__) and reports coverage for the target only, including files no test touches. Automatically excludes common non-production files (stories, mocks, e2e tests). Detects and prevents analysis on test files themselves. Requires set_project_root to be called first. Coverage thresholds are read from the Vitest config.\n\nUSE WHEN: User wants to check test coverage, identify untested code, improve test coverage, asks "what\'s not tested", "coverage report", "how well tested", or mentions coverage/testing quality. Essential when "vitest-mcp:" prefix is used with coverage-related requests. Prefer this over raw vitest coverage commands for actionable insights.',
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
      project: {
        type: "string",
        description:
          'Optional name of a Vitest project (from the `projects` array in vitest.config) whose tests should be used to measure coverage, e.g. "unit". Defaults to all projects.',
      },
      exclude: {
        type: "array",
        description:
          'Glob patterns to exclude from coverage analysis. Examples: ["**/*.stories.*", "**/e2e/**"]. Useful for excluding stories, mocks, or other non-production code from coverage calculations.',
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
  testsRun?: number;
}

/** Extensions Vitest can collect coverage for */
const SOURCE_EXTENSIONS = /\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/;
const TEST_FILE = /\.(?:test|spec)\.[^/\\]+$/;
const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist", "build", "coverage", "__tests__", "__mocks__"]);
/** Keep the command line well below the Windows limit (~32k characters) */
const MAX_RELATED_ARGS_LENGTH = 24_000;

/**
 * CoverageAnalyzer class - Handles coverage analysis with single responsibility methods
 */
class CoverageAnalyzer {
  private projectRoot = "";
  private readonly startTime = performance.now();

  /**
   * Check if the target is a test file
   */
  private isTestFile(target: string): boolean {
    return TEST_FILE.test(target) ||
      /(^|[/\\])(__tests__|tests?)([/\\]|$)/.test(target);
  }

  /**
   * Validate versions and locate the project's Vitest
   */
  private async resolveVitest(): Promise<VitestInstallation> {
    const versionCheck = await checkAllVersions(this.projectRoot);
    if (versionCheck.errors.length > 0) {
      const report = generateVersionReport(versionCheck);
      throw new Error(`Version compatibility issues found:\n\n${report}`);
    }

    if (!versionCheck.coverageProvider.version && process.env.CI !== "true") {
      console.error(
        "Warning: Coverage provider not found. Install @vitest/coverage-v8 for coverage analysis."
      );
    }

    const vitest = await findVitest(this.projectRoot);
    if (!vitest) {
      throw new Error("Vitest not found. Install it in the project (npm install -D vitest).");
    }
    return vitest;
  }

  /**
   * Source files covered by the target, relative to the project root
   */
  private async collectSourceFiles(target: ResolvedTarget): Promise<string[]> {
    if (!target.isDirectory) {
      return [target.relativePath];
    }

    const files: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!SKIPPED_DIRECTORIES.has(entry.name)) {
            await walk(fullPath);
          }
        } else if (
          SOURCE_EXTENSIONS.test(entry.name) &&
          !TEST_FILE.test(entry.name) &&
          !entry.name.endsWith(".d.ts")
        ) {
          files.push(relative(this.projectRoot, fullPath).split(sep).join("/"));
        }
      }
    };
    await walk(target.absolutePath);
    return files.sort();
  }

  /**
   * Build Vitest arguments.
   *
   * `vitest related <sources>` runs every test that imports the target, wherever the
   * tests live (fixes tests-outside-src layouts), and `coverage.include` limits the
   * report to the target while still listing files no test loads (needed on Vitest 4+,
   * which dropped `coverage.all`). Reports go to a private directory so the project's
   * own coverage output is never touched.
   */
  private buildCoverageArgs(options: {
    target: ResolvedTarget;
    sourceFiles: string[];
    project?: string;
    exclude: string[];
    reportPath: string;
    coverageDir: string;
    configPath: string | null;
  }): string[] {
    const { target, sourceFiles, project, exclude, reportPath, coverageDir, configPath } = options;

    const useRelated = sourceFiles.join(" ").length <= MAX_RELATED_ARGS_LENGTH;
    const args = useRelated ? ["related", ...sourceFiles, "--run"] : ["run"];

    if (configPath) {
      args.push(`--config=${configPath}`);
    }
    if (project) {
      args.push(`--project=${project}`);
    }

    args.push(
      "--passWithNoTests",
      "--reporter=json",
      `--outputFile.json=${reportPath}`,
      "--coverage.enabled=true",
      `--coverage.include=${target.isDirectory ? `${target.relativePath}/**` : target.relativePath}`,
      "--coverage.reporter=json",
      `--coverage.reportsDirectory=${coverageDir}`,
      "--coverage.clean=true",
      "--coverage.reportOnFailure=true"
    );

    for (const pattern of exclude) {
      args.push(`--coverage.exclude=${pattern}`);
    }

    return args;
  }

  /**
   * Execute coverage analysis and get raw results
   */
  private async executeCoverage(
    args: AnalyzeCoverageArgs,
    target: ResolvedTarget,
    vitest: VitestInstallation
  ): Promise<CoverageExecutionResult> {
    const config = await getConfig();
    const sourceFiles = await this.collectSourceFiles(target);
    if (sourceFiles.length === 0) {
      throw new Error(`No source files found in ${args.target}`);
    }

    const runDir = await createRunDirectory();
    try {
      const reportPath = join(runDir.dir, "report.json");
      const coverageDir = join(runDir.dir, "coverage");
      const vitestArgs = this.buildCoverageArgs({
        target,
        sourceFiles,
        project: validateProjectName(args.project),
        // Only forwarded when given: passing --coverage.exclude replaces the project's own list.
        // Common non-production files are filtered out afterwards instead.
        exclude: args.exclude ?? [],
        reportPath,
        coverageDir,
        configPath: await findMcpVitestConfig(this.projectRoot),
      });

      if (process.env.VITEST_MCP_DEBUG) {
        console.error("Executing: vitest", vitestArgs.join(" "));
      }

      const result: VitestRunResult = await runVitest(vitest, {
        cwd: this.projectRoot,
        args: vitestArgs,
        timeoutMs: config.testDefaults.timeout * 2,
        env: {
          STORYBOOK_DISABLE_TELEMETRY: "1",
          SKIP_STORYBOOK: "true",
          VITEST_DISABLE_STORYBOOK: "true",
          VITEST_UI: "false",
          HEADLESS: "true",
        },
      });

      let testsRun: number | undefined;
      try {
        testsRun = JSON.parse(await readFile(reportPath, "utf-8")).numTotalTests;
      } catch {
        // No test report; coverage may still have been written
      }

      let coverageData: RawCoverageData | undefined;
      try {
        const raw = JSON.parse(await readFile(join(coverageDir, "coverage-final.json"), "utf-8"));
        coverageData = transformCoverageData(raw, target.relativePath, this.projectRoot);
      } catch (error) {
        if (process.env.VITEST_MCP_DEBUG) {
          console.error("Coverage report not readable:", error);
        }
      }

      return {
        command: this.buildDisplayCommand(args),
        success: result.exitCode === 0,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        duration: 0,
        coverageData,
        testsRun,
      };
    } finally {
      await runDir.cleanup();
    }
  }

  /**
   * Process coverage results
   */
  private async processCoverageResults(
    args: AnalyzeCoverageArgs,
    coverageResult: CoverageExecutionResult
  ): Promise<ProcessedCoverageResult> {
    // Thresholds failing makes Vitest exit non-zero but the data is still valid,
    // so only fail when there is no coverage data at all.
    if (!coverageResult.coverageData) {
      const cleanedStderr = this.filterWarningsFromStderr(coverageResult.stderr);
      throw new Error(
        `Coverage analysis failed: ${cleanedStderr || "No coverage data available"}`
      );
    }

    const config = await getConfig();
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

    if (coverageResult.testsRun !== undefined) {
      result.testsRun = coverageResult.testsRun;
      if (coverageResult.testsRun === 0) {
        result.summary = `⚠️ No tests import ${args.target} - ${result.summary}`;
      }
    }

    return result;
  }

  /**
   * Create error result
   */
  private createErrorResult(error: unknown, builtCommand: string): ProcessedCoverageResult {
    const errorResult = createErrorAnalysis(error);
    errorResult.command = builtCommand;
    errorResult.duration = Math.round((performance.now() - this.startTime) * 100) / 100;
    errorResult.error = error instanceof Error ? error.message : "Unknown error";
    return errorResult;
  }

  /**
   * Command shown to the user
   */
  private buildDisplayCommand(args: AnalyzeCoverageArgs): string {
    const project = args.project ? ` --project=${args.project}` : "";
    return `npx vitest related ${args.target || ""} --run --coverage${project}`;
  }

  /**
   * Main execution method
   */
  async execute(args: AnalyzeCoverageArgs): Promise<ProcessedCoverageResult> {
    const builtCommand = this.buildDisplayCommand(args);

    try {
      if (!args.target || args.target.trim() === "") {
        throw new Error(
          "Target parameter is required. Specify a file or directory to analyze coverage."
        );
      }

      try {
        this.projectRoot = projectContext.getProjectRoot();
      } catch {
        throw new Error("Please call set_project_root first");
      }

      if (this.isTestFile(args.target)) {
        throw new Error(
          "Cannot analyze coverage for test file. Coverage analysis should target source code files, not test files. Try analyzing the source files that this test file covers instead."
        );
      }

      const target = await resolveTarget(this.projectRoot, args.target, "analyze coverage for");
      const vitest = await this.resolveVitest();
      const coverageResult = await this.executeCoverage(args, target, vitest);
      return await this.processCoverageResults(args, coverageResult);
    } catch (error) {
      return this.createErrorResult(error, builtCommand);
    }
  }

  /**
   * Filter out known warnings from stderr
   */
  private filterWarningsFromStderr(stderr: string): string {
    if (!stderr) return "";

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

      return trimmedLine.length > 0;
    });

    return filteredLines.join('\n').trim();
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

const NON_PRODUCTION_PATTERNS = [
  /\.(test|spec)\./,
  /(^|\/)__tests__\//,
  /\.(stories|story)\./,
  /(^|\/)e2e\//,
  /\.e2e\./,
  /(^|\/)(test-utils|mocks|__mocks__)\//,
  /(^|\/)(storybook|\.storybook|storybook-static)\//,
  /(^|\/)(node_modules|dist|build|coverage|\.next|\.nuxt)\//,
  /(^|\/)(eslint|vite|vitest|webpack|rollup|babel|jest)\.config\./,
];

/**
 * Keep only files inside the target and compute summary totals.
 *
 * Paths are matched relative to the project root so a target like "src" does not
 * match unrelated paths that merely contain "src".
 */
export function transformCoverageData(
  rawFiles: Record<string, CoverageFileData>,
  targetRelativePath?: string,
  projectRoot?: string
): RawCoverageData {
  const relevantFiles: Record<string, CoverageFileData> = {};
  const cleanTarget = targetRelativePath?.replace(/^\.\//, "").replace(/\/+$/, "");

  for (const [filePath, fileData] of Object.entries(rawFiles)) {
    const rel = (projectRoot ? relative(projectRoot, filePath) : filePath).split(sep).join("/");

    if (NON_PRODUCTION_PATTERNS.some((pattern) => pattern.test(rel))) {
      continue;
    }

    if (cleanTarget) {
      const insideTarget = projectRoot
        ? rel === cleanTarget || rel.startsWith(`${cleanTarget}/`)
        : filePath.includes(cleanTarget);
      if (!insideTarget) {
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

  for (const fileData of Object.values(relevantFiles)) {
    const statements = Object.values(fileData.s || {});
    totalStatements += statements.length;
    coveredStatements += statements.filter((count) => count > 0).length;

    const functions = Object.values(fileData.f || {});
    totalFunctions += functions.length;
    coveredFunctions += functions.filter((count) => count > 0).length;

    const branches = Object.values(fileData.b || {}).flat();
    totalBranches += branches.length;
    coveredBranches += branches.filter((count) => count > 0).length;

    const lines = [...computeLineHits(fileData).values()];
    totalLines += lines.length;
    coveredLines += lines.filter((count) => count > 0).length;
  }

  const pct = (covered: number, total: number) => (total > 0 ? (covered / total) * 100 : 0);

  return {
    files: relevantFiles,
    summary: {
      lines: { total: totalLines, covered: coveredLines, skipped: 0, pct: pct(coveredLines, totalLines) },
      functions: { total: totalFunctions, covered: coveredFunctions, skipped: 0, pct: pct(coveredFunctions, totalFunctions) },
      statements: { total: totalStatements, covered: coveredStatements, skipped: 0, pct: pct(coveredStatements, totalStatements) },
      branches: { total: totalBranches, covered: coveredBranches, skipped: 0, pct: pct(coveredBranches, totalBranches) },
    },
  };
}

/**
 * Create error analysis result
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
