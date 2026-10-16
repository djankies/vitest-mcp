import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { isDirectory as isDirectoryPath } from "../utils/file-utils.js";
import { processTestResult } from "../utils/output-processor.js";
import { join } from "path";
import { readFile } from "fs/promises";
import { getConfig } from "../config/config-loader.js";
import {
  checkAllVersions,
  generateVersionReport,
} from "../utils/version-checker.js";
import { projectContext } from "../context/project-context.js";
import {
  consoleReporterPath,
  createRunDirectory,
  findVitest,
  runVitest,
  VitestInstallation,
} from "../utils/vitest-runner.js";
import { resolveTarget, validateProjectName } from "../utils/target-utils.js";
import { findMcpVitestConfig } from "../utils/config-finder.js";

/**
 * Tool for running Vitest commands safely
 */
export const runTestsTool: Tool = {
  name: "run_tests",
  description:
    'Execute Vitest tests with AI-optimized structured JSON output, intelligent format detection, optional console log capture, and safety guards to prevent full project runs. Supports monorepos via Vitest projects. Requires set_project_root to be called first.\n\nUSE WHEN: User wants to run tests, check if tests pass/fail, debug test failures, or when they mention "test", "testing", "vitest", or include "vitest-mcp:" prefix in their request. Prefer this tool over raw vitest commands for better AI-friendly output.',
  inputSchema: {
    type: "object",
    properties: {
      target: {
        type: "string",
        description:
          'File path or directory to test. Can be a specific test file (e.g., "./src/components/Button.test.ts") or directory (e.g., "./src/components"). Relative paths are resolved from project root. Required to prevent accidental full project test runs.',
      },
      format: {
        type: "string",
        enum: ["summary", "detailed"],
        description:
          'Output format: "summary" (simple summary data only), "detailed" (structured information about each failing test and summary of passing tests). Smart defaults: single file → summary, multiple files or failures → detailed',
        default: "summary",
      },
      project: {
        type: "string",
        description:
          'Name of the specific Vitest project to run tests for, as defined in the `projects` array of vitest.config (or vitest.workspace on Vitest 3). Essential for monorepos with multiple packages/apps. Example: "client", "api", "shared".',
      },
      showLogs: {
        type: "boolean",
        description:
          "Capture and include console output (console.log, console.error, etc.) from test execution in the results. Useful for debugging test failures. Output is formatted with [stdout] or [stderr] prefixes to distinguish message types.",
        default: false,
      },
    },
    required: ["target"],
  },
};

export type TestFormat = "summary" | "detailed";

export interface RunTestsArgs {
  target: string;
  format?: TestFormat;
  project?: string;
  showLogs?: boolean;
}

export interface RunTestsResult {
  command: string;
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
  /** Raw JSON report written by Vitest's JSON reporter, when available */
  report?: string;
}

export interface TestExecutionContext {
  isMultiFile: boolean;
  targetType: "file" | "directory";
  estimatedTestCount?: number;
}

export interface TestResultContext extends TestExecutionContext {
  hasFailures: boolean;
  actualTestCount: number;
}

export interface TestSummary {
  totalTests: number;
  passed: number;
  failed: number;
  skipped?: number;
}

export interface FailedTestDetails {
  testName: string;
  duration?: number;
  errorType: string;
  message: string;
  stack?: string[];
  actual?: unknown;
  expected?: unknown;
  codeSnippet?: string[];
}

export interface FailedTestSummary {
  testName: string;
  errorType: string;
  message: string;
}

export interface SkippedTest {
  testName: string;
}

export interface TestResults {
  failedTests?: Array<{
    file: string;
    tests: Array<FailedTestDetails | FailedTestSummary>;
  }>;
  skippedTests?: Array<{
    file: string;
    tests: Array<SkippedTest>;
  }>;
}

export interface ProcessedTestResult {
  summary: string;  // One-line summary for MCP clients that truncate output
  command: string;
  success: boolean;
  testSummary: TestSummary;
  format: TestFormat;
  executionTimeMs: number;  // Total operation duration in milliseconds
  logs?: string[];
  testResults?: TestResults;
  /** Vitest's error output when the run failed without reporting a failing test */
  error?: string;
}

export interface OutputProcessor {
  process(
    result: RunTestsResult,
    format: TestFormat,
    context: TestResultContext
  ): Promise<ProcessedTestResult>;
}

/**
 * Determine the optimal format based on context and user preference
 */
export async function determineFormat(
  args: RunTestsArgs,
  context: TestExecutionContext,
  hasFailures?: boolean
): Promise<TestFormat> {
  if (args.format) {
    return args.format;
  }

  const config = await getConfig();

  if (hasFailures === true) {
    return "detailed";
  }

  if (context.isMultiFile || context.targetType === "directory") {
    return "detailed";
  }

  return config.testDefaults.format;
}

/**
 * Create execution context from target path
 */
export async function createExecutionContext(
  targetPath: string
): Promise<TestExecutionContext> {
  const isDirectory = await isDirectoryPath(targetPath);

  return {
    isMultiFile: isDirectory,
    targetType: isDirectory ? "directory" : "file",
    estimatedTestCount: undefined,
  };
}

/**
 * TestRunner class - validates input, runs the project's Vitest and processes the JSON report
 */
class TestRunner {
  private projectRoot = "";
  private readonly startTime = performance.now();

  /**
   * Check version compatibility and locate the project's Vitest
   */
  private async resolveVitest(): Promise<VitestInstallation> {
    const versionCheck = await checkAllVersions(this.projectRoot);
    if (versionCheck.errors.length > 0) {
      const report = generateVersionReport(versionCheck);
      throw new Error(`Version compatibility issues found:\n\n${report}`);
    }

    const vitest = await findVitest(this.projectRoot);
    if (!vitest) {
      throw new Error("Vitest not found. Install it in the project (npm install -D vitest).");
    }
    return vitest;
  }

  /**
   * Command shown to the user; equivalent to what is executed
   */
  private buildDisplayCommand(relativePath: string, project?: string): string {
    return `npx vitest run ${relativePath}${project ? ` --project=${project}` : ""}`;
  }

  /**
   * Build Vitest execution arguments. The JSON report is written to a file because
   * Vitest 5 no longer prints it to stdout by default.
   */
  private buildVitestArgs(
    relativePath: string,
    project: string | undefined,
    reportPath: string,
    showLogs: boolean,
    configPath: string | null
  ): string[] {
    const vitestArgs = ["run", relativePath, "--reporter=json", `--outputFile.json=${reportPath}`];

    if (configPath) {
      vitestArgs.push(`--config=${configPath}`);
    }

    if (showLogs) {
      vitestArgs.push(`--reporter=${consoleReporterPath()}`);
    }

    if (project) {
      vitestArgs.push(`--project=${project}`);
    }

    return vitestArgs;
  }

  /**
   * Read the captured console output written by the console reporter
   */
  private async readLogs(logFilePath: string): Promise<string[]> {
    let content: string;
    try {
      content = await readFile(logFilePath, "utf-8");
    } catch {
      return [];
    }

    const logs: string[] = [];
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        const prefix = entry.type === "stderr" ? "[stderr]" : "[stdout]";
        logs.push(`${prefix} ${entry.message}`);
      } catch {
        // Skip partial lines
      }
    }
    return logs;
  }

  /**
   * Create error result
   */
  private async createErrorResult(error: unknown, builtCommand: string): Promise<ProcessedTestResult> {
    const errorResult: RunTestsResult = {
      command: builtCommand,
      success: false,
      stdout: "",
      stderr: error instanceof Error ? error.message : "Unknown error",
      exitCode: 1,
      duration: Math.round((performance.now() - this.startTime) * 100) / 100,
    };

    const errorContext: TestResultContext = {
      isMultiFile: false,
      targetType: "file",
      hasFailures: true,
      actualTestCount: 0,
    };

    return await processTestResult(errorResult, "detailed", errorContext);
  }

  /**
   * Main execution method
   */
  async execute(args: RunTestsArgs): Promise<ProcessedTestResult> {
    let builtCommand = "";

    try {
      try {
        this.projectRoot = projectContext.getProjectRoot();
      } catch {
        throw new Error("Please call set_project_root first");
      }

      const target = await resolveTarget(this.projectRoot, args.target, "run tests on");
      const project = validateProjectName(args.project);
      const vitest = await this.resolveVitest();
      const config = await getConfig();

      builtCommand = this.buildDisplayCommand(target.relativePath, project);
      const executionContext = await createExecutionContext(target.absolutePath);

      const runDir = await createRunDirectory();
      try {
        const reportPath = join(runDir.dir, "report.json");
        const logFilePath = join(runDir.dir, "console.jsonl");

        const result = await runVitest(vitest, {
          cwd: this.projectRoot,
          args: this.buildVitestArgs(
            target.relativePath,
            project,
            reportPath,
            !!args.showLogs,
            await findMcpVitestConfig(this.projectRoot)
          ),
          timeoutMs: config.testDefaults.timeout,
          env: args.showLogs ? { VITEST_MCP_LOG_FILE: logFilePath } : undefined,
        });

        let report: string | undefined;
        try {
          report = await readFile(reportPath, "utf-8");
        } catch {
          // No report (e.g. config error or timeout); fall back to stdout/stderr
        }

        const hasFailures = result.exitCode !== 0;
        const finalFormat = await determineFormat(args, executionContext, hasFailures);

        const rawResult: RunTestsResult = {
          command: builtCommand,
          success: true,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          duration: Math.round((performance.now() - this.startTime) * 100) / 100,
          report,
        };

        if (process.env.VITEST_MCP_DEBUG) {
          console.error("[DEBUG] vitest exit code:", result.exitCode, "report bytes:", report?.length ?? 0);
        }

        const processedResult = await processTestResult(rawResult, finalFormat, {
          ...executionContext,
          hasFailures,
          actualTestCount: 0,
        });

        if (args.showLogs) {
          const logs = await this.readLogs(logFilePath);
          if (logs.length > 0) {
            processedResult.logs = logs;
          }
        }

        return processedResult;
      } finally {
        await runDir.cleanup();
      }
    } catch (error) {
      return await this.createErrorResult(error, builtCommand);
    }
  }
}

/**
 * Implementation of the run_tests tool
 */
export async function handleRunTests(
  args: RunTestsArgs
): Promise<ProcessedTestResult> {
  const runner = new TestRunner();
  return await runner.execute(args);
}
