import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { processCoverageData } from '../coverage-processor.js';
import type { RawCoverageData } from '../../types/coverage-types.js';

// Mock the project context
vi.mock('../../context/project-context.js', () => ({
  projectContext: {
    getProjectRoot: vi.fn(() => '/test/project')
  }
}));

// Mock the vitest config reader
vi.mock('../vitest-config-reader.js', () => ({
  getVitestCoverageThresholds: vi.fn(() => Promise.resolve(null)),
  checkThresholdsMet: vi.fn(() => true),
  getThresholdViolations: vi.fn(() => [])
}));

describe('coverage-processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('processCoverageData', () => {
    const mockRawData: RawCoverageData = {
      summary: {
        lines: { total: 100, covered: 80, skipped: 0, pct: 80 },
        functions: { total: 20, covered: 15, skipped: 0, pct: 75 },
        branches: { total: 40, covered: 32, skipped: 0, pct: 80 },
        statements: { total: 100, covered: 80, skipped: 0, pct: 80 }
      },
      files: {
        'test.ts': {
          path: 'test.ts',
          s: { '0': 1, '1': 0, '2': 1 },
          f: { '0': 1, '1': 0 },
          b: { '0': [1, 0] },
          statementMap: { '1': { start: { line: 5 } } },
          fnMap: { '1': { name: 'uncoveredFunc', decl: { start: { line: 10 } } } },
          branchMap: { '0': { loc: { start: { line: 15 } } } }
        }
      }
    };

    const options = { target: './src' };

    it('should process coverage data and calculate percentages correctly', async () => {
      const result = await processCoverageData(mockRawData, 'summary', options);

      expect(result.success).toBe(true);
      expect(result.coverage.lines).toBe(80);
      expect(result.coverage.functions).toBe(75);
      expect(result.coverage.branches).toBe(80);
      expect(result.coverage.statements).toBe(80);
    });

    it('should not include threshold info when thresholds are not configured', async () => {
      const result = await processCoverageData(mockRawData, 'summary', options);
      expect(result.meetsThreshold).toBeUndefined();
    });

    it('should extract totals correctly', async () => {
      const result = await processCoverageData(mockRawData, 'summary', options);
      
      expect(result.totals.lines).toBe(100);
      expect(result.totals.functions).toBe(20);
      expect(result.totals.branches).toBe(40);
    });

    it('should identify single file target', async () => {
      const result = await processCoverageData(mockRawData, 'summary', options);
      expect(result.file).toBe('test.ts');
    });

    it('should include uncovered items in detailed format', async () => {
      const result = await processCoverageData(mockRawData, 'detailed', options);
      
      expect(result.uncovered).toBeDefined();
      expect(result.uncovered?.['test.ts']).toBeDefined();
      expect(result.uncovered?.['test.ts'].lines).toContain(5);
      expect(result.uncovered?.['test.ts'].functions).toContainEqual({ name: 'uncoveredFunc', line: 10 });
      expect(result.uncovered?.['test.ts'].branches).toContain(15);
    });

    it('should not include threshold violations when thresholds are not configured', async () => {
      const result = await processCoverageData(mockRawData, 'detailed', options);
      
      expect(result.thresholdViolations).toBeUndefined();
    });

    it('should include file breakdown in detailed format', async () => {
      const result = await processCoverageData(mockRawData, 'detailed', options);
      
      expect(result.fileBreakdown).toBeDefined();
      expect(result.fileBreakdown).toHaveLength(1);
      expect(result.fileBreakdown?.[0].path).toBe('test.ts');
    });

    it('should handle empty coverage data gracefully', async () => {
      const emptyData: RawCoverageData = {
        summary: {
          lines: { total: 0, covered: 0, skipped: 0, pct: 0 },
          functions: { total: 0, covered: 0, skipped: 0, pct: 0 },
          branches: { total: 0, covered: 0, skipped: 0, pct: 0 },
          statements: { total: 0, covered: 0, skipped: 0, pct: 0 }
        },
        files: {}
      };

      const result = await processCoverageData(emptyData, 'summary', options);
      expect(result.success).toBe(true);
      expect(result.coverage.lines).toBe(0);
    });

    it('should throw error for malformed data', async () => {
      const invalidData = {} as RawCoverageData;
      
      await expect(processCoverageData(invalidData, 'summary', options))
        .rejects.toThrow('Failed to process coverage data');
    });
  });
});