/**
 * TypeScript interfaces for coverage analysis data structures
 */

export interface CoverageThreshold {
  lines?: number;
  functions?: number;
  branches?: number;
  statements?: number;
}

export interface CoverageMetrics {
  lines: number;
  functions: number;
  branches: number;
  statements: number;
}

export interface UncoveredLine {
  line: number;
  column?: number;
}

export interface FileCoverageDetails {
  path: string;
  coverage: CoverageMetrics;
  uncoveredLines: UncoveredLine[];
  totalLines: number;
  coveredLines: number;
  functions: {
    total: number;
    covered: number;
    uncovered: Array<{
      name: string;
      line: number;
    }>;
  };
  branches: {
    total: number;
    covered: number;
    uncovered: Array<{
      line: number;
    }>;
  };
}





export interface CoverageQualityScore {
  overall: number;
  breakdown: {
    coverage: number;
    testCompleteness: number;
  };
  factors: {
    meetsThresholds: boolean;
  };
}

export interface CoverageAnalysisResult {
  summary: string;  // One-line summary for MCP clients that truncate output
  success: boolean;
  coverage: {
    lines: number;
    functions: number;
    branches: number;
    statements: number;
  };
  file?: string;
  
  uncovered?: {
    [filePath: string]: {
      lines: number[];
      functions: Array<{name: string; line: number}>;
      branches: number[];
    };
  };
  totals: {
    lines: number;
    functions: number;
    branches: number;
  };
  meetsThreshold?: boolean;  // Optional - only present if thresholds are configured
  command: string;
  duration: number;
  error?: string;
  
  fileBreakdown?: Array<{
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
  }>;
  thresholdViolations?: string[];  // Optional - only present if thresholds are violated
}

export interface AnalyzeCoverageArgs {
  target: string;
  format?: 'summary' | 'detailed';
  exclude?: string[];
}

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

export interface RawCoverageData {
  
  files: Record<string, {
    path: string;
    statementMap: Record<string, StatementMapping>;
    fnMap: Record<string, FunctionMapping>;
    branchMap: Record<string, BranchMapping>;
    s: Record<string, number>;
    f: Record<string, number>;
    b: Record<string, number[]>;
    inputSourceMap?: unknown;
  }>;
  summary: {
    lines: { total: number; covered: number; skipped: number; pct: number };
    functions: { total: number; covered: number; skipped: number; pct: number };
    statements: { total: number; covered: number; skipped: number; pct: number };
    branches: { total: number; covered: number; skipped: number; pct: number };
  };
}


export type ProcessedCoverageResult = CoverageAnalysisResult;