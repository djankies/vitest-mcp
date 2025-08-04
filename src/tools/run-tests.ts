import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { spawn } from 'child_process';
import { fileExists, findProjectRoot, isDirectory as isDirectoryPath } from '../utils/file-utils.js';
import { processTestResult } from '../utils/output-processor.js';
import { resolve, relative } from 'path';

/**
 * Tool for running Vitest commands safely
 */
export const runTestsTool: Tool = {
  name: 'run_tests',
  description: 'Execute Vitest commands with configurable output formatting optimized for LLM consumption',
  inputSchema: {
    type: 'object',
    properties: {
      target: {
        type: 'string', 
        description: 'File path or directory to test (required to prevent running all tests)'
      },
      coverage: {
        type: 'boolean',
        description: 'Enable coverage reporting',
        default: false
      },
      format: {
        type: 'string',
        enum: ['summary', 'detailed', 'json'],
        description: 'Output format: "summary" (concise pass/fail counts), "detailed" (includes test names and failure details), "json" (structured machine-readable format). Smart defaults: single file → summary, multiple files or failures → detailed',
        default: 'summary'
      }
    },
    required: ['target']
  }
};

export type TestFormat = 'summary' | 'detailed' | 'json';

export interface RunTestsArgs {
  target: string;
  coverage?: boolean;
  format?: TestFormat;
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
  targetType: 'file' | 'directory';
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
  skipped: number;
  duration: number;
  coverage?: {
    lines: number;
    functions: number;
    branches: number;
    statements: number;
  };
}

export interface TestFile {
  path: string;
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  tests: TestCase[];
}

export interface TestCase {
  name: string;
  fullName: string;
  status: 'passed' | 'failed' | 'skipped';
  duration?: number;
  error?: {
    message: string;
    expected?: string;
    actual?: string;
    stack?: string;
  };
}

export interface StructuredTestResult {
  status: 'success' | 'failure' | 'error';
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
    passRate: number;
  };
  files?: TestFile[];
  failures?: Array<{
    file: string;
    test: string;
    error: string;
  }>;
  coverage?: {
    lines: number;
    functions: number;
    branches: number;
    statements: number;
  };
}

export interface ProcessedTestResult extends RunTestsResult {
  format: TestFormat;
  processedOutput: string;
  summary?: TestSummary;
  context: TestResultContext;
  structured: StructuredTestResult;
}

export interface OutputProcessor {
  process(result: RunTestsResult, format: TestFormat, context: TestResultContext): ProcessedTestResult;
}

/**
 * Determine the optimal format based on context and user preference
 */
export function determineFormat(args: RunTestsArgs, context: TestExecutionContext, hasFailures?: boolean): TestFormat {
  // User explicitly specified format takes precedence
  if (args.format) {
    return args.format;
  }
  
  // Smart defaults logic
  // If we know there are failures, always use detailed for better debugging
  if (hasFailures === true) {
    return 'detailed';
  }
  
  // Multiple files typically need detailed output for better context
  if (context.isMultiFile || context.targetType === 'directory') {
    return 'detailed';
  }
  
  // Single file with no known failures gets summary
  return 'summary';
}

/**
 * Create execution context from target path
 */
export async function createExecutionContext(targetPath: string): Promise<TestExecutionContext> {
  const isDirectory = await isDirectoryPath(targetPath);
  
  return {
    isMultiFile: isDirectory,
    targetType: isDirectory ? 'directory' : 'file',
    estimatedTestCount: undefined // Could be enhanced to count test files
  };
}

/**
 * Implementation of the run_tests tool
 */
export async function handleRunTests(args: RunTestsArgs): Promise<ProcessedTestResult> {
  const startTime = Date.now();
  
  try {
    // Validate required target parameter
    if (!args.target || args.target.trim() === '') {
      throw new Error('Target parameter is required. Specify a file or directory to prevent running all tests.');
    }
    
    // Get project root relative to the server location, not current working directory
    // This fixes issues when MCP server is called from different working directories
    // From dist/tools/run-tests.js, go up to project root: ../..
    const serverDir = new URL('../..', import.meta.url).pathname;
    const projectRoot = await findProjectRoot(serverDir);
    const targetPath = resolve(projectRoot, args.target);
    
    // Validate target exists
    if (!(await fileExists(targetPath))) {
      throw new Error(`Target does not exist: ${args.target} (resolved to: ${targetPath})`);
    }
    
    // Additional safety check: prevent running on entire project root
    if (await isDirectoryPath(targetPath) && resolve(targetPath) === resolve(projectRoot)) {
      throw new Error('Cannot run tests on entire project root. Please specify a specific file or subdirectory.');
    }
    
    // Create execution context for smart defaults
    const executionContext = await createExecutionContext(targetPath);
    
    // Determine format (pre-execution, without failure info)
    const format = determineFormat(args, executionContext);
    
    // Build Vitest command with format-specific options
    const command = await buildVitestCommand(args, projectRoot, targetPath, format);
    
    // Execute the command
    const result = await executeCommand(command, projectRoot);
    
    // Create result context (post-execution, with failure info)
    const hasFailures = result.exitCode !== 0;
    
    // Re-evaluate format now that we know about failures
    const finalFormat = determineFormat(args, executionContext, hasFailures);
    
    // Create raw result object
    const rawResult: RunTestsResult = {
      command: command.join(' '),
      success: result.exitCode === 0,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      duration: Date.now() - startTime
    };
    
    // Create enhanced result context with actual execution data
    const resultContext: TestResultContext = {
      ...executionContext,
      hasFailures,
      actualTestCount: 0, // Will be populated by output processor
      executionTime: rawResult.duration
    };
    
    // Process the output using the output processor
    return processTestResult(rawResult, finalFormat, resultContext);
    
  } catch (error) {
    const errorResult: RunTestsResult = {
      command: '',
      success: false,
      stdout: '',
      stderr: error instanceof Error ? error.message : 'Unknown error',
      exitCode: 1,
      duration: Date.now() - startTime
    };
    
    const errorContext: TestResultContext = {
      isMultiFile: false,
      targetType: 'file',
      hasFailures: true,
      actualTestCount: 0,
      executionTime: errorResult.duration
    };
    
    // Process error result with detailed format to preserve error information
    return processTestResult(errorResult, 'detailed', errorContext);
  }
}

/**
 * Build the Vitest command array
 */
async function buildVitestCommand(args: RunTestsArgs, projectRoot: string, targetPath: string, format: TestFormat): Promise<string[]> {
  const command = ['npx', 'vitest', 'run']; // Always use run mode (never watch)
  
  // Use relative path from project root to target
  const relativePath = relative(projectRoot, targetPath);
  
  // Safety check: if relative path is empty or '.', it means we're targeting the root
  if (!relativePath || relativePath === '.') {
    throw new Error('Cannot target project root. Please specify a specific file or subdirectory.');
  }
  
  command.push(relativePath);
  
  // Add coverage flag if requested
  if (args.coverage) {
    command.push('--coverage');
  }
  
  // Always use JSON reporter internally for consistent parsing
  // Even 'raw' format will be processed from JSON for LLM consumption
  command.push('--reporter=json');
  
  return command;
}

/**
 * Execute a command and return the result
 */
function executeCommand(command: string[], cwd: string): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  return new Promise((resolve) => {
    const [cmd, ...args] = command;
    const child = spawn(cmd, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve({
        stdout,
        stderr,
        exitCode: code || 0
      });
    });
    
    child.on('error', (error) => {
      clearTimeout(timeout);
      resolve({
        stdout,
        stderr: `Process error: ${error.message}`,
        exitCode: 1
      });
    });
    
    // Set a timeout to prevent hanging (reduced to 30 seconds for safety)
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({
        stdout,
        stderr: 'Command timed out after 30 seconds. This usually means the command is trying to run too many tests.',
        exitCode: 124
      });
    }, 30000);
  });
}