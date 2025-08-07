import {
  RawCoverageData,
  CoverageAnalysisResult,
} from "../types/coverage-types.js";
import { getVitestCoverageThresholds, checkThresholdsMet, getThresholdViolations } from './vitest-config-reader.js';
import { projectContext } from '../context/project-context.js';

// Coverage file data interface
interface CoverageFileData {
  s: Record<string, number>; // Statement counts
  f: Record<string, number>; // Function counts  
  b: Record<string, number[]>; // Branch counts
  statementMap?: Record<string, unknown>;
  fnMap?: Record<string, unknown>;
  branchMap?: Record<string, unknown>;
}

// File breakdown item interface
interface FileBreakdownItem {
  path: string;
  coverage: {
    lines: number;
    functions: number;
    branches: number;
    statements: number;
  };
  totals: {
    lines: number;
    functions: number;
    branches: number;
    statements: number;
  };
  covered: {
    lines: number;
    functions: number;
    branches: number;
    statements: number;
  };
}

export interface CoverageProcessingOptions {
  target: string;
}

/**
 * Main function to process raw coverage data into structured analysis
 */
export async function processCoverageData(
  rawData: RawCoverageData,
  format: "summary" | "detailed",
  options: CoverageProcessingOptions
): Promise<CoverageAnalysisResult> {
  try {
    const coverage = {
      lines: Math.round(rawData.summary.lines.pct),
      functions: Math.round(rawData.summary.functions.pct),
      branches: Math.round(rawData.summary.branches.pct),
      statements: Math.round(rawData.summary.statements.pct),
    };

    const fileEntries = Object.entries(rawData.files);
    const targetFile = fileEntries.length === 1 ? fileEntries[0][0] : undefined;

    const totals = extractTotals(rawData.summary);

    // Get thresholds from Vitest config and check if coverage meets them
    const projectRoot = projectContext.getProjectRoot();
    const thresholds = await getVitestCoverageThresholds(projectRoot);
    
    if (process.env.VITEST_MCP_DEBUG) {
      console.error('Coverage processor - thresholds:', thresholds, 'coverage:', coverage);
    }

    const result: CoverageAnalysisResult = {
      success: true,
      coverage,
      file: targetFile,
      totals,
      command: "",
      duration: 0,
    };

    // Only include threshold information if thresholds are configured
    if (thresholds) {
      const meetsThreshold = checkThresholdsMet(coverage, thresholds);
      const thresholdViolations = getThresholdViolations(coverage, thresholds);
      
      result.meetsThreshold = meetsThreshold;
      if (thresholdViolations.length > 0) {
        result.thresholdViolations = thresholdViolations;
      }
    }

    if (format === "detailed") {
      const uncovered = await extractUncoveredItems(
        rawData.files,
        options,
        format
      );
      result.uncovered = uncovered;
    }

    if (format === "detailed" && fileEntries.length > 0) {
      const fileBreakdown: FileBreakdownItem[] = [];

      for (const [filePath, fileData] of fileEntries) {
        const fileStats = calculateFileStats(fileData);
        fileBreakdown.push({
          path: filePath,
          coverage: {
            lines: fileStats.lines.pct,
            functions: fileStats.functions.pct,
            branches: fileStats.branches.pct,
            statements: fileStats.statements.pct,
          },
          totals: {
            lines: fileStats.lines.total,
            functions: fileStats.functions.total,
            branches: fileStats.branches.total,
            statements: fileStats.statements.total,
          },
          covered: {
            lines: fileStats.lines.covered,
            functions: fileStats.functions.covered,
            branches: fileStats.branches.covered,
            statements: fileStats.statements.covered,
          },
        });
      }

      result.fileBreakdown = fileBreakdown;
    }

    return result;
  } catch (error) {
    if (process.env.VITEST_MCP_DEBUG || process.env.CI !== "true") {
      console.error("Error processing coverage data:", error);
    } else if (process.env.CI === "true") {
      console.error(
        "Coverage processing failed:",
        error instanceof Error ? error.message : "Unknown error"
      );
    }
    throw new Error(
      `Failed to process coverage data: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Calculate statistics for a single file
 */
function calculateFileStats(fileData: CoverageFileData): {
  lines: { total: number; covered: number; pct: number };
  functions: { total: number; covered: number; pct: number };
  branches: { total: number; covered: number; pct: number };
  statements: { total: number; covered: number; pct: number };
} {
  const statements = Object.values(fileData.s || {}) as number[];
  const stmtTotal = statements.length;
  const stmtCovered = statements.filter((count) => count > 0).length;

  const functions = Object.values(fileData.f || {}) as number[];
  const fnTotal = functions.length;
  const fnCovered = functions.filter((count) => count > 0).length;

  const branches = Object.values(fileData.b || {}).flat() as number[];
  const branchTotal = branches.length;
  const branchCovered = branches.filter((count) => count > 0).length;

  return {
    lines: {
      total: stmtTotal,
      covered: stmtCovered,
      pct: stmtTotal > 0 ? Math.round((stmtCovered / stmtTotal) * 100) : 0,
    },
    functions: {
      total: fnTotal,
      covered: fnCovered,
      pct: fnTotal > 0 ? Math.round((fnCovered / fnTotal) * 100) : 0,
    },
    branches: {
      total: branchTotal,
      covered: branchCovered,
      pct:
        branchTotal > 0 ? Math.round((branchCovered / branchTotal) * 100) : 0,
    },
    statements: {
      total: stmtTotal,
      covered: stmtCovered,
      pct: stmtTotal > 0 ? Math.round((stmtCovered / stmtTotal) * 100) : 0,
    },
  };
}

/**
 * Extract uncovered items from all files
 */
async function extractUncoveredItems(
  files: RawCoverageData["files"],
  options: CoverageProcessingOptions,
  format: "summary" | "detailed" = "summary"
): Promise<{
  [filePath: string]: {
    lines: number[];
    functions: Array<{ name: string; line: number }>;
    branches: number[];
  };
}> {
  const uncoveredByFile: {
    [filePath: string]: {
      lines: number[];
      functions: Array<{ name: string; line: number }>;
      branches: number[];
    };
  } = {};

  if (format === "summary") {
    return uncoveredByFile;
  }

  for (const [filePath, fileData] of Object.entries(files)) {
    try {
      const fileName = filePath.split("/").pop() || filePath;

      const fileUncovered = {
        lines: [] as number[],
        functions: [] as Array<{ name: string; line: number }>,
        branches: [] as number[],
      };

      const statementMap = fileData.statementMap || {};
      const statements = fileData.s || {};

      for (const [stmtId, count] of Object.entries(statements)) {
        if ((count as number) === 0 && statementMap[stmtId]) {
          const stmt = statementMap[stmtId];
          const lineNum = stmt.start?.line || 0;
          if (lineNum > 0) {
            fileUncovered.lines.push(lineNum);
          }
        }
      }

      const functionMap = fileData.fnMap || {};
      const functions = fileData.f || {};

      for (const [fnId, count] of Object.entries(functions)) {
        if ((count as number) === 0 && functionMap[fnId]) {
          const fn = functionMap[fnId];
          fileUncovered.functions.push({
            name: fn.name || "anonymous",
            line: fn.decl?.start?.line || 0,
          });
        }
      }

      const branchMap = fileData.branchMap || {};
      const branches = fileData.b || {};

      for (const [branchId, counts] of Object.entries(branches)) {
        const countsArray = counts as number[];
        const branch = branchMap[branchId];

        if (branch && countsArray.some((count) => count === 0)) {
          const lineNum = branch.loc?.start?.line || 0;
          if (lineNum > 0) {
            fileUncovered.branches.push(lineNum);
          }
        }
      }

      if (
        fileUncovered.lines.length > 0 ||
        fileUncovered.functions.length > 0 ||
        fileUncovered.branches.length > 0
      ) {
        uncoveredByFile[fileName] = fileUncovered;
      }
    } catch (error) {
      console.error(`Error processing file ${filePath}:`, error);
    }
  }

  for (const fileName in uncoveredByFile) {
    const fileData = uncoveredByFile[fileName];
    fileData.lines = [...new Set(fileData.lines)].sort((a, b) => a - b);
    fileData.functions = fileData.functions.sort((a, b) => a.line - b.line);
    fileData.branches = [...new Set(fileData.branches)].sort((a, b) => a - b);
  }

  return uncoveredByFile;
}

/**
 * Extract totals from summary
 */
function extractTotals(summary: RawCoverageData["summary"]): {
  lines: number;
  functions: number;
  branches: number;
} {
  return {
    lines: summary.lines.total,
    functions: summary.functions.total,
    branches: summary.branches.total,
  };
}
