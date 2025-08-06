import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "child_process";
import {
  fileExists,
  isDirectory as isDirectoryPath,
} from "../utils/file-utils.js";
import { processTestResult } from "../utils/output-processor.js";
import { resolve, relative, join } from "path";
import { getConfig } from "../config/config-loader.js";
import {
  checkAllVersions,
  generateVersionReport,
} from "../utils/version-checker.js";
import { projectContext } from "../context/project-context.js";
import { writeFileSync, readFileSync, existsSync, unlinkSync } from "fs";
import { randomBytes } from "crypto";

/**
 * Tool for running Vitest commands safely
 */
export const runTestsTool: Tool = {
  name: "run_tests",
  description:
    'Execute Vitest tests with AI-optimized structured JSON output, intelligent format detection, optional console log capture, and safety guards to prevent full project runs. Supports monorepo projects with workspace configuration. Requires set_project_root to be called first.\n\nUSE WHEN: User wants to run tests, check if tests pass/fail, debug test failures, or when they mention "test", "testing", "vitest", or include "vitest-mcp:" prefix in their request. Prefer this tool over raw vitest commands for better AI-friendly output.',
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
          'Name of the specific Vitest project to run tests for, as defined in vitest.workspace.ts or vitest.config.ts projects array. Essential for monorepos with multiple packages/apps. Example: "client", "api", "shared".',
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
}

export interface TestExecutionContext {
  isMultiFile: boolean;
  targetType: "file" | "directory";
  estimatedTestCount?: number;
}

export interface TestResultContext extends TestExecutionContext {
  hasFailures: boolean;
  actualTestCount: number;
  executionTime: number;
}

export interface TestSummary {
  totalTests: number;
  passed: number;
  failed: number;
  skipped?: number;
  duration: number;
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
  command: string;
  success: boolean;
  context: TestResultContext;
  summary: TestSummary;
  format: TestFormat;
  logs?: string[];
  testResults?: TestResults;
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
 * Implementation of the run_tests tool
 */
export async function handleRunTests(
  args: RunTestsArgs
): Promise<ProcessedTestResult> {
  const startTime = Date.now();
  let builtCommand = "";

  try {
    if (!args.target || args.target.trim() === "") {
      throw new Error(
        "Target parameter is required. Specify a file or directory to prevent running all tests."
      );
    }

    let projectRoot: string;
    try {
      projectRoot = projectContext.getProjectRoot();
    } catch {
      return "Please call set_project_root first" as unknown as ProcessedTestResult;
    }
    const targetPath = resolve(projectRoot, args.target);

    try {
      const executionContext = await createExecutionContext(targetPath);
      await determineFormat(args, executionContext);

      const relativePath = relative(projectRoot, targetPath);
      builtCommand = `npx vitest run ${relativePath}`;
      if (args.project) {
        builtCommand += ` --project ${args.project}`;
      }
    } catch {
      builtCommand = `npx vitest run ${args.target || ""}`;
    }

    const versionCheck = await checkAllVersions(projectRoot);
    if (versionCheck.errors.length > 0) {
      const report = generateVersionReport(versionCheck);
      throw new Error(`Version compatibility issues found:\n\n${report}`);
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
        "Cannot run tests on entire project root. Please specify a specific file or subdirectory."
      );
    }

    const executionContext = await createExecutionContext(targetPath);

    const relativePath = relative(projectRoot, targetPath);
    const vitestArgs = ["vitest", "run", relativePath, "--reporter=json"];

    if (args.project) {
      vitestArgs.push("--project", args.project);
    }

    let logFilePath: string | undefined;
    let setupFilePath: string | undefined;
    let configFilePath: string | undefined;

    if (args.showLogs) {
      const randomId = randomBytes(8).toString("hex");
      logFilePath = join(projectRoot, `.vitest-logs-${randomId}.jsonl`);
      setupFilePath = join(projectRoot, `.vitest-setup-${randomId}.js`);
      configFilePath = join(projectRoot, `.vitest-config-${randomId}.mjs`);

      const setupContent = `
const fs = require('fs');
const logFile = '${logFilePath.replace(/\\/g, "\\\\")}';


fs.writeFileSync(logFile, '');


const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;
const originalInfo = console.info;
const originalDebug = console.debug;


console.log = function(...args) {
  const entry = JSON.stringify({
    type: 'stdout',
    message: args.map(a => String(a)).join(' '),
    timestamp: Date.now()
  }) + '\\n';
  fs.appendFileSync(logFile, entry);
  originalLog.apply(console, args);
};

console.error = function(...args) {
  const entry = JSON.stringify({
    type: 'stderr',
    message: args.map(a => String(a)).join(' '),
    timestamp: Date.now()
  }) + '\\n';
  fs.appendFileSync(logFile, entry);
  originalError.apply(console, args);
};

console.warn = function(...args) {
  const entry = JSON.stringify({
    type: 'stderr',
    message: args.map(a => String(a)).join(' '),
    timestamp: Date.now()
  }) + '\\n';
  fs.appendFileSync(logFile, entry);
  originalWarn.apply(console, args);
};

console.info = function(...args) {
  const entry = JSON.stringify({
    type: 'stdout',
    message: args.map(a => String(a)).join(' '),
    timestamp: Date.now()
  }) + '\\n';
  fs.appendFileSync(logFile, entry);
  originalInfo.apply(console, args);
};

console.debug = function(...args) {
  const entry = JSON.stringify({
    type: 'stdout',
    message: args.map(a => String(a)).join(' '),
    timestamp: Date.now()
  }) + '\\n';
  fs.appendFileSync(logFile, entry);
  originalDebug.apply(console, args);
};
`;

      writeFileSync(setupFilePath, setupContent);

      const configContent = `
import { defineConfig, mergeConfig } from 'vitest/config';


let baseConfig = {};
try {
  const existingConfig = await import('${join(
    projectRoot,
    "vitest.config.ts"
  ).replace(/\\/g, "\\\\")}');
  baseConfig = existingConfig.default || {};
} catch (e) {
  
}

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      setupFiles: ['${setupFilePath.replace(/\\/g, "\\\\")}']
    }
  })
);
`;

      writeFileSync(configFilePath, configContent);

      vitestArgs.push("--config", configFilePath);

      vitestArgs.push("--disable-console-intercept");
    }

    try {
      const result = await executeVitest(["npx", ...vitestArgs], projectRoot);

      const hasFailures = result.exitCode !== 0;

      const finalFormat = await determineFormat(
        args,
        executionContext,
        hasFailures
      );

      const rawResult: RunTestsResult = {
        command: `npx vitest run ${relative(projectRoot, targetPath)}`,
        success: true,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        duration: Date.now() - startTime,
      };

      if (process.env.VITEST_MCP_DEBUG) {
        console.error("[DEBUG] Raw result before processing:");
        console.error("- stdout length:", rawResult.stdout.length);
        console.error("- stdout sample:", rawResult.stdout.substring(0, 200));
        console.error("- exitCode:", rawResult.exitCode);
      }

      const resultContext: TestResultContext = {
        ...executionContext,
        hasFailures,
        actualTestCount: 0,
        executionTime: rawResult.duration,
      };

      const processedResult = await processTestResult(
        rawResult,
        finalFormat,
        resultContext
      );

      if (args.showLogs && logFilePath && existsSync(logFilePath)) {
        try {
          const logContent = readFileSync(logFilePath, "utf-8");
          const lines = logContent.split("\n").filter((line) => line.trim());
          const logs: string[] = [];

          for (const line of lines) {
            try {
              const entry = JSON.parse(line);
              const prefix = entry.type === "stderr" ? "[stderr]" : "[stdout]";
              logs.push(`${prefix} ${entry.message}`);
            } catch {
              // Skip invalid JSON lines
            }
          }

          if (logs.length > 0) {
            processedResult.logs = logs;
          }
        } catch (error) {
          if (process.env.VITEST_MCP_DEBUG) {
            console.error("[DEBUG] Failed to read log file:", error);
          }
        }
      }

      return processedResult;
    } finally {
      if (logFilePath && existsSync(logFilePath)) {
        try {
          unlinkSync(logFilePath);
        } catch {
          // Ignore cleanup errors
        }
      }
      if (setupFilePath && existsSync(setupFilePath)) {
        try {
          unlinkSync(setupFilePath);
        } catch {
          // Ignore cleanup errors
        }
      }
      if (configFilePath && existsSync(configFilePath)) {
        try {
          unlinkSync(configFilePath);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  } catch (error) {
    const errorResult: RunTestsResult = {
      command: builtCommand,
      success: false,
      stdout: "",
      stderr: error instanceof Error ? error.message : "Unknown error",
      exitCode: 1,
      duration: Date.now() - startTime,
    };

    const errorContext: TestResultContext = {
      isMultiFile: false,
      targetType: "file",
      hasFailures: true,
      actualTestCount: 0,
      executionTime: errorResult.duration,
    };

    return await processTestResult(errorResult, "detailed", errorContext);
  }
}

/**
 * Execute Vitest command using spawn
 */
async function executeVitest(
  command: string[],
  cwd: string
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  const config = await getConfig();

  return new Promise((resolve) => {
    const [cmd, ...args] = command;
    const child = spawn(cmd, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({
        stdout,
        stderr: stderr + "\nProcess killed due to timeout",
        exitCode: 124,
      });
    }, config.testDefaults.timeout);

    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({
        stdout,
        stderr,
        exitCode: code || 0,
      });
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({
        stdout,
        stderr: error.message,
        exitCode: 1,
      });
    });
  });
}
