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

// TestDuplication interface removed - not feasible with current Vitest coverage data

// CoverageGap removed - no interpretations, just raw data

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
  success: boolean;
  coverage: {
    lines: number;
    functions: number;
    branches: number;
    statements: number;
  };
  file?: string;
  uncovered: {
    lines: number[];
    functions: Array<{name: string; line: number}>;
    branches: number[];
  };
  totals: {
    lines: number;
    functions: number;
    branches: number;
  };
  meetsThreshold: boolean;
  command: string;
  duration: number;
  error?: string;
}

export interface AnalyzeCoverageArgs {
  target: string;
  threshold?: number;
  includeDetails?: boolean;
  format?: 'summary' | 'detailed';
  thresholds?: CoverageThreshold;
}

export interface RawCoverageData {
  // Raw Vitest coverage JSON structure
  files: Record<string, {
    path: string;
    statementMap: Record<string, any>;
    fnMap: Record<string, any>;
    branchMap: Record<string, any>;
    s: Record<string, number>;
    f: Record<string, number>;
    b: Record<string, number[]>;
    inputSourceMap?: any;
  }>;
  summary: {
    lines: { total: number; covered: number; skipped: number; pct: number };
    functions: { total: number; covered: number; skipped: number; pct: number };
    statements: { total: number; covered: number; skipped: number; pct: number };
    branches: { total: number; covered: number; skipped: number; pct: number };
  };
}

// Keep for backward compatibility but now just alias
export type ProcessedCoverageResult = CoverageAnalysisResult;