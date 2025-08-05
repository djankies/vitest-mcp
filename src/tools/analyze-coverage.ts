import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { spawn } from 'child_process';
import { fileExists, isDirectory as isDirectoryPath } from '../utils/file-utils.js';
import { resolve, relative } from 'path';
import { readFile } from 'fs/promises';
import { 
  AnalyzeCoverageArgs, 
  ProcessedCoverageResult, 
  CoverageAnalysisResult,
  RawCoverageData
} from '../types/coverage-types.js';
import { processCoverageData } from '../utils/coverage-processor.js';
import { getConfig } from '../config/config-loader.js';
import { checkAllVersions, generateVersionReport } from '../utils/version-checker.js';
import { projectContext } from '../context/project-context.js';

/**
 * Tool for analyzing test coverage with actionable insights
 */
export const analyzeCoverageTool: Tool = {
  name: 'analyze_coverage',
  description: 'Run comprehensive coverage analysis with detailed metrics about line, function, and branch coverage',
  inputSchema: {
    type: 'object',
    properties: {
      target: {
        type: 'string',
        description: 'File path or directory to analyze coverage for (required to prevent analyzing entire project)'
      },
      threshold: {
        type: 'number',
        description: 'Minimum coverage threshold percentage (default: 80)',
        default: 80,
        minimum: 0,
        maximum: 100
      },
      includeDetails: {
        type: 'boolean',
        description: 'Include detailed line-by-line coverage analysis',
        default: false
      },
      format: {
        type: 'string',
        enum: ['summary', 'detailed'],
        description: 'Output format: "summary" (basic metrics), "detailed" (comprehensive analysis with file details)',
        default: 'summary'
      },
      thresholds: {
        type: 'object',
        description: 'Custom coverage thresholds for different metrics',
        properties: {
          lines: { type: 'number', minimum: 0, maximum: 100 },
          functions: { type: 'number', minimum: 0, maximum: 100 },
          branches: { type: 'number', minimum: 0, maximum: 100 },
          statements: { type: 'number', minimum: 0, maximum: 100 }
        },
        additionalProperties: false
      },
      exclude: {
        type: 'array',
        description: 'Patterns to exclude from coverage (e.g., ["**/*.stories.*", "**/*.test.*", "**/e2e/**"])',
        items: {
          type: 'string'
        },
        default: []
      }
    },
    required: ['target']
  }
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
export async function handleAnalyzeCoverage(args: AnalyzeCoverageArgs): Promise<ProcessedCoverageResult> {
  const startTime = Date.now();
  
  try {
    // Validate required target parameter
    if (!args.target || args.target.trim() === '') {
      throw new Error('Target parameter is required. Specify a file or directory to analyze coverage.');
    }
    
    // Get configuration
    const config = await getConfig();
    
    // Use config defaults for unspecified values
    const threshold = args.threshold ?? config.coverageDefaults.threshold;
    if (threshold < 0 || threshold > 100) {
      throw new Error('Threshold must be between 0 and 100');
    }
    
    const format = args.format ?? config.coverageDefaults.format;
    const includeDetails = args.includeDetails ?? config.coverageDefaults.includeDetails;
    const thresholds = args.thresholds ?? config.coverageDefaults.thresholds;
    const exclude = args.exclude ?? config.coverageDefaults.exclude ?? [];
    
    // Get project root from the project context (must be set first)
    let projectRoot: string;
    try {
      projectRoot = projectContext.getProjectRoot();
    } catch {
      throw new Error('Project root has not been set. Please use the set_project_root tool first to specify which repository to work with.');
    }
    const targetPath = resolve(projectRoot, args.target);
    
    // Check Vitest and coverage provider version compatibility
    const versionCheck = await checkAllVersions(projectRoot);
    if (versionCheck.errors.length > 0) {
      const report = generateVersionReport(versionCheck);
      throw new Error(`Version compatibility issues found:\n\n${report}`);
    }
    
    // Warn if coverage provider is missing but don't fail
    if (!versionCheck.coverageProvider.version) {
      console.error('Warning: Coverage provider not found. Install @vitest/coverage-v8 for coverage analysis.');
    }
    
    // Validate target exists
    if (!(await fileExists(targetPath))) {
      throw new Error(`Target does not exist: ${args.target} (resolved to: ${targetPath})`);
    }
    
    // Prevent analyzing entire project root
    if (await isDirectoryPath(targetPath) && resolve(targetPath) === resolve(projectRoot)) {
      throw new Error('Cannot analyze coverage for entire project root. Please specify a specific file or subdirectory.');
    }
    
    // Check if user is trying to analyze test files (common mistake)
    if (!await isDirectoryPath(targetPath)) {
      const isTestFile = targetPath.includes('.test.') || 
                        targetPath.includes('.spec.') ||
                        targetPath.includes('__tests__');
      
      if (isTestFile) {
        throw new Error(`Cannot analyze coverage for test file: ${args.target}. Coverage analysis should target source code files, not test files. Try analyzing the source files that this test file covers instead.`);
      }
    }
    
    // Execute coverage analysis with resolved config values
    const coverageResult = await executeCoverageAnalysis(
      { ...args, threshold, format, includeDetails, thresholds, exclude },
      projectRoot, 
      targetPath
    );
    
    // Don't fail if we have coverage data, even if thresholds weren't met
    if (!coverageResult.success && !coverageResult.coverageData) {
      throw new Error(`Coverage analysis failed: ${coverageResult.stderr || 'Unknown error'}`);
    }
    
    // Process coverage data into structured analysis
    const result = await processCoverageData(
      coverageResult.coverageData!,
      format as 'summary' | 'detailed',
      {
        target: args.target,
        threshold,
        includeDetails: includeDetails,
        thresholds: thresholds
      }
    );
    
    // Fill in command and duration
    result.command = coverageResult.command;
    result.duration = Date.now() - startTime;
    
    return result;
    
  } catch (error) {
    const errorResult = createErrorAnalysis(error);
    errorResult.command = '';
    errorResult.duration = Date.now() - startTime;
    errorResult.error = error instanceof Error ? error.message : 'Unknown error';
    return errorResult;
  }
}

/**
 * Execute Vitest coverage analysis
 */
async function executeCoverageAnalysis(
  args: AnalyzeCoverageArgs,
  projectRoot: string,
  targetPath: string
): Promise<CoverageExecutionResult> {
  const command = await buildCoverageCommand(args, projectRoot, targetPath);
  const result = await executeCommand(command, projectRoot);
  
  let coverageData: RawCoverageData | undefined;
  
  if (result.success || result.stdout) {
    try {
      // Extract coverage data from JSON reporter output
      if (result.stdout.trim()) {
        // Parse JSON from stdout - it may have other output after the JSON
        let jsonOutput;
        const stdout = result.stdout.trim();
        
        // Try to find the complete JSON object by looking for opening and closing braces
        const firstBrace = stdout.indexOf('{');
        if (firstBrace !== -1) {
          let braceCount = 0;
          let jsonEnd = firstBrace;
          
          for (let i = firstBrace; i < stdout.length; i++) {
            if (stdout[i] === '{') braceCount++;
            if (stdout[i] === '}') braceCount--;
            
            if (braceCount === 0) {
              jsonEnd = i + 1;
              break;
            }
          }
          
          const jsonString = stdout.substring(firstBrace, jsonEnd);
          jsonOutput = JSON.parse(jsonString);
        } else {
          // Fallback to parsing the entire stdout
          jsonOutput = JSON.parse(stdout);
        }
        
        // Check if coverageMap exists in the JSON output
        if (jsonOutput.coverageMap && Object.keys(jsonOutput.coverageMap).length > 0) {
          // Transform the coverage data from JSON reporter to our expected format
          coverageData = transformCoverageData(jsonOutput.coverageMap, args.target);
        } else {
          console.warn('No coverageMap found in JSON output, trying coverage-final.json fallback');
          
          // Fallback to coverage-final.json file
          const coverageFilePath = resolve(projectRoot, 'coverage', 'coverage-final.json');
          
          if (await fileExists(coverageFilePath)) {
            const coverageFileContent = await readFile(coverageFilePath, 'utf-8');
            const rawCoverageFiles = JSON.parse(coverageFileContent);
            
            // Transform the coverage data to our expected format
            coverageData = transformCoverageData(rawCoverageFiles, args.target);
          } else {
            console.error('Coverage file not found at:', coverageFilePath);
          }
        }
      }
    } catch (parseError) {
      console.error('Failed to parse coverage data:', parseError);
      console.error('Raw stdout length:', result.stdout.length);
      console.error('Raw stdout preview:', result.stdout.substring(0, 500));
    }
  }
  
  return {
    ...result,
    coverageData
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

function transformCoverageData(rawFiles: Record<string, CoverageFileData>, targetPath?: string): RawCoverageData {
  // Filter files to only include relevant ones - exclude test files and irrelevant project files
  const relevantFiles: Record<string, CoverageFileData> = {};
  
  for (const [filePath, fileData] of Object.entries(rawFiles)) {
    // Skip test files
    if (filePath.includes('.test.') || filePath.includes('.spec.') || filePath.includes('__tests__')) {
      continue;
    }
    
    // Skip Storybook files
    if (filePath.includes('.stories.') || filePath.includes('.story.')) {
      continue;
    }
    
    // Skip e2e test files
    if (filePath.includes('/e2e/') || filePath.includes('.e2e.')) {
      continue;
    }
    
    // Skip test utility and mock files
    if (filePath.includes('/test-utils/') || filePath.includes('/mocks/') || filePath.includes('/__mocks__/')) {
      continue;
    }
    
    // Skip non-source files (config files, etc.)
    if (!filePath.includes('/src/') && !filePath.endsWith('.ts') && !filePath.endsWith('.js')) {
      continue;
    }
    
    // If we have a specific target, only include that file
    if (targetPath && !filePath.includes(targetPath)) {
      continue;
    }
    
    relevantFiles[filePath] = fileData;
  }
  
  // Calculate overall summary from relevant files only
  let totalStatements = 0, coveredStatements = 0;
  let totalFunctions = 0, coveredFunctions = 0;
  let totalBranches = 0, coveredBranches = 0;
  let totalLines = 0, coveredLines = 0;
  
  for (const [, fileData] of Object.entries(relevantFiles)) {
    if (fileData.s) {
      const statements = Object.values(fileData.s) as number[];
      totalStatements += statements.length;
      coveredStatements += statements.filter(count => count > 0).length;
    }
    
    if (fileData.f) {
      const functions = Object.values(fileData.f) as number[];
      totalFunctions += functions.length;
      coveredFunctions += functions.filter(count => count > 0).length;
    }
    
    if (fileData.b) {
      const branches = Object.values(fileData.b).flat() as number[];
      totalBranches += branches.length;
      coveredBranches += branches.filter(count => count > 0).length;
    }
    
    // For lines, use statements as a proxy (common approach)
    if (fileData.s) {
      const statements = Object.values(fileData.s) as number[];
      totalLines += statements.length;
      coveredLines += statements.filter(count => count > 0).length;
    }
  }
  
  return {
    files: relevantFiles,
    summary: {
      lines: {
        total: totalLines,
        covered: coveredLines,
        skipped: 0,
        pct: totalLines > 0 ? (coveredLines / totalLines) * 100 : 0
      },
      functions: {
        total: totalFunctions,
        covered: coveredFunctions,
        skipped: 0,
        pct: totalFunctions > 0 ? (coveredFunctions / totalFunctions) * 100 : 0
      },
      statements: {
        total: totalStatements,
        covered: coveredStatements,
        skipped: 0,
        pct: totalStatements > 0 ? (coveredStatements / totalStatements) * 100 : 0
      },
      branches: {
        total: totalBranches,
        covered: coveredBranches,
        skipped: 0,
        pct: totalBranches > 0 ? (coveredBranches / totalBranches) * 100 : 0
      }
    }
  };
}

/**
 * Build Vitest coverage command
 */
async function buildCoverageCommand(
  args: AnalyzeCoverageArgs,
  projectRoot: string,
  targetPath: string
): Promise<string[]> {
  const command = ['npx', 'vitest', 'run'];
  
  // If targeting a source file, find its corresponding test file
  if (!targetPath.includes('.test.') && !targetPath.includes('.spec.') && !targetPath.includes('__tests__')) {
    // Look for corresponding test files
    const possibleTestFiles = [
      targetPath.replace(/\.ts$/, '.test.ts'),
      targetPath.replace(/\.js$/, '.test.js'),
      targetPath.replace(/\.ts$/, '.spec.ts'),
      targetPath.replace(/\.js$/, '.spec.js'),
      targetPath.replace(/\.ts$/, '.test.tsx'),
      targetPath.replace(/\.jsx?$/, '.test.jsx')
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
    } else {
      // No test file found - run all tests but filter coverage to target
      // Don't add any specific file - run all tests
    }
  } else {
    // User specified a test file directly
    const relativePath = relative(projectRoot, targetPath);
    if (!relativePath || relativePath === '.') {
      throw new Error('Cannot target project root. Please specify a specific file or subdirectory.');
    }
    command.push(relativePath);
  }
  
  // Enable coverage
  command.push('--coverage');
  
  // Add exclude patterns if provided
  if (args.exclude && args.exclude.length > 0) {
    for (const pattern of args.exclude) {
      command.push(`--coverage.exclude=${pattern}`);
    }
  }
  
  // Use JSON reporter for structured output
  command.push('--reporter=json');
  
  // Add coverage thresholds
  // If custom thresholds are provided, use those; otherwise use the general threshold
  if (args.thresholds) {
    // Use custom thresholds for each metric
    if (args.thresholds.lines !== undefined) {
      command.push(`--coverage.thresholds.lines=${args.thresholds.lines}`);
    }
    if (args.thresholds.functions !== undefined) {
      command.push(`--coverage.thresholds.functions=${args.thresholds.functions}`);
    }
    if (args.thresholds.branches !== undefined) {
      command.push(`--coverage.thresholds.branches=${args.thresholds.branches}`);
    }
    if (args.thresholds.statements !== undefined) {
      command.push(`--coverage.thresholds.statements=${args.thresholds.statements}`);
    }
  } else if (args.threshold && args.threshold > 0) {
    // Use general threshold for all metrics
    command.push(`--coverage.thresholds.lines=${args.threshold}`);
    command.push(`--coverage.thresholds.functions=${args.threshold}`);
    command.push(`--coverage.thresholds.branches=${args.threshold}`);
    command.push(`--coverage.thresholds.statements=${args.threshold}`);
  }
  
  return command;
}

/**
 * Execute command and return result
 */
async function executeCommand(command: string[], cwd: string): Promise<CoverageExecutionResult> {
  const config = await getConfig();
  
  return new Promise((resolve) => {
    const [cmd, ...args] = command;
    const child = spawn(cmd, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true
    });
    
    let stdout = '';
    let stderr = '';
    
    // Set timeout for coverage analysis (use double the test timeout)
    const timeoutMs = config.testDefaults.timeout * 2;
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({
        command: command.join(' '),
        success: false,
        stdout,
        stderr: `Coverage analysis timed out after ${timeoutMs / 1000} seconds. Try analyzing a smaller target.`,
        exitCode: 124,
        duration: timeoutMs
      });
    }, timeoutMs);
    
    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve({
        command: command.join(' '),
        success: code === 0,
        stdout,
        stderr,
        exitCode: code || 0,
        duration: 0 // Will be calculated by caller
      });
    });
    
    child.on('error', (error) => {
      clearTimeout(timeout);
      resolve({
        command: command.join(' '),
        success: false,
        stdout,
        stderr: `Process error: ${error.message}`,
        exitCode: 1,
        duration: 0
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
      statements: 0
    },
    uncovered: {
      lines: [],
      functions: [],
      branches: []
    },
    totals: {
      lines: 0,
      functions: 0,
      branches: 0
    },
    meetsThreshold: false,
    command: '',
    duration: 0
  };
}

// Removed generateErrorRecommendations function - LLMs can analyze error messages and decide on appropriate actions