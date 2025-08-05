// Commented out unused imports to fix linting
// import { readFile } from 'fs/promises';
// import { resolve, dirname } from 'path';
// import { fileExists } from './file-utils.js';
import {
  RawCoverageData,
  CoverageAnalysisResult
} from '../types/coverage-types.js';

export interface CoverageProcessingOptions {
  target: string;
  threshold: number;
  includeDetails: boolean;
  thresholds?: {
    lines?: number;
    functions?: number;
    branches?: number;
    statements?: number;
  };
}

/**
 * Main function to process raw coverage data into structured analysis
 */
export async function processCoverageData(
  rawData: RawCoverageData,
  format: 'summary' | 'detailed',
  options: CoverageProcessingOptions
): Promise<CoverageAnalysisResult> {
  try {
    // Extract overall coverage metrics
    const coverage = {
      lines: Math.round(rawData.summary.lines.pct),
      functions: Math.round(rawData.summary.functions.pct),
      branches: Math.round(rawData.summary.branches.pct),
      statements: Math.round(rawData.summary.statements.pct)
    };

    // Get file information for single file analysis
    const fileEntries = Object.entries(rawData.files);
    const targetFile = fileEntries.length === 1 ? fileEntries[0][0] : undefined;

    // Extract uncovered items and totals
    const uncovered = await extractUncoveredItems(rawData.files, options);
    const totals = extractTotals(rawData.summary);

    // Check if meets threshold
    const threshold = options.threshold;
    const meetsThreshold = coverage.lines >= threshold &&
                          coverage.functions >= threshold &&
                          coverage.branches >= threshold &&
                          coverage.statements >= threshold;

    return {
      success: true,
      coverage,
      file: targetFile,
      uncovered,
      totals,
      meetsThreshold,
      command: '', // Will be filled by caller
      duration: 0  // Will be filled by caller
    };
    
  } catch (error) {
    console.error('Error processing coverage data:', error);
    throw new Error(`Failed to process coverage data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract uncovered items from all files
 */
async function extractUncoveredItems(
  files: RawCoverageData['files'],
  options: CoverageProcessingOptions
): Promise<{
  lines: number[];
  functions: Array<{name: string; line: number}>;
  branches: number[];
}> {
  const uncoveredLines: number[] = [];
  const uncoveredFunctions: Array<{name: string; line: number}> = [];
  const uncoveredBranches: number[] = [];

  // Only extract details if requested
  if (!options.includeDetails) {
    return {
      lines: uncoveredLines,
      functions: uncoveredFunctions,
      branches: uncoveredBranches
    };
  }

  for (const [filePath, fileData] of Object.entries(files)) {
    try {
      // Extract uncovered lines
      const statementMap = fileData.statementMap || {};
      const statements = fileData.s || {};
      
      for (const [stmtId, count] of Object.entries(statements)) {
        if ((count as number) === 0 && statementMap[stmtId]) {
          const stmt = statementMap[stmtId];
          const lineNum = stmt.start?.line || 0;
          if (lineNum > 0) {
            uncoveredLines.push(lineNum);
          }
        }
      }

      // Extract uncovered functions
      const functionMap = fileData.fnMap || {};
      const functions = fileData.f || {};
      
      for (const [fnId, count] of Object.entries(functions)) {
        if ((count as number) === 0 && functionMap[fnId]) {
          const fn = functionMap[fnId];
          uncoveredFunctions.push({
            name: fn.name || 'anonymous',
            line: fn.decl?.start?.line || 0
          });
        }
      }

      // Extract uncovered branches
      const branchMap = fileData.branchMap || {};
      const branches = fileData.b || {};
      
      for (const [branchId, counts] of Object.entries(branches)) {
        const countsArray = counts as number[];
        const branch = branchMap[branchId];
        
        if (branch && countsArray.some(count => count === 0)) {
          const lineNum = branch.loc?.start?.line || 0;
          if (lineNum > 0) {
            uncoveredBranches.push(lineNum);
          }
        }
      }
    } catch (error) {
      console.error(`Error processing file ${filePath}:`, error);
    }
  }

  return {
    lines: [...new Set(uncoveredLines)].sort((a, b) => a - b),
    functions: uncoveredFunctions.sort((a, b) => a.line - b.line),
    branches: [...new Set(uncoveredBranches)].sort((a, b) => a - b)
  };
}

/**
 * Extract totals from summary
 */
function extractTotals(summary: RawCoverageData['summary']): {
  lines: number;
  functions: number;
  branches: number;
} {
  return {
    lines: summary.lines.total,
    functions: summary.functions.total,
    branches: summary.branches.total
  };
}