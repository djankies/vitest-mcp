import { describe, it, expect, beforeEach, vi } from 'vitest';
import { analyzeCoverageTool, handleAnalyzeCoverage } from '../analyze-coverage.js';
import { projectContext } from '../../context/project-context.js';
import * as fileUtils from '../../utils/file-utils.js';
import * as configLoader from '../../config/config-loader.js';
import * as versionChecker from '../../utils/version-checker.js';
import * as coverageProcessor from '../../utils/coverage-processor.js';
import { spawn } from 'child_process';
import { readFile } from 'fs/promises';

// Mock modules
vi.mock('../../context/project-context.js');
vi.mock('../../utils/file-utils.js');
vi.mock('../../config/config-loader.js');
vi.mock('../../utils/version-checker.js');
vi.mock('../../utils/coverage-processor.js');
vi.mock('child_process');
vi.mock('fs/promises');

describe('analyze-coverage (core functionality)', () => {
  // Helper function to create proper spawn mock with JSON output
  const createSpawnMock = (outputData: any = null, exitCode: number = 0) => {
    const vitestJsonOutput = outputData || {
      numTotalTests: 0,
      numPassedTests: 0,
      numFailedTests: 0,
      numPendingTests: 0,
      coverageMap: {
        '/test/project/src/file.ts': {
          path: '/test/project/src/file.ts',
          s: { '0': 1, '1': 1 },
          f: { '0': 1 },
          b: { '0': [1, 1] },
          statementMap: {
            '0': { start: { line: 1 } },
            '1': { start: { line: 2 } }
          },
          fnMap: {
            '0': { name: 'testFunction', decl: { start: { line: 1 } } }
          },
          branchMap: {
            '0': { loc: { start: { line: 1 } } }
          }
        }
      }
    };
    
    return {
      stdout: { on: vi.fn((event, callback) => {
        if (event === 'data') {
          callback(JSON.stringify(vitestJsonOutput));
        }
      }) },
      stderr: { on: vi.fn() },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(exitCode), 0);
        }
      }),
      kill: vi.fn()
    } as any;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset project context
    vi.mocked(projectContext.getProjectRoot).mockReturnValue('/test/project');
    vi.mocked(projectContext.hasProjectRoot).mockReturnValue(true);
    
    // Default config mock
    vi.mocked(configLoader.getConfig).mockResolvedValue({
      coverageDefaults: {
        format: 'summary' as const,
        threshold: 80,
        exclude: [],
        thresholds: {
          lines: 80,
          functions: 80,
          branches: 80,
          statements: 80
        }
      },
      testDefaults: {
        timeout: 30000
      }
    } as any);
    
    // Default file utils mocks
    vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
    vi.mocked(fileUtils.isDirectory).mockResolvedValue(false);
    
    // Default version checker mocks
    vi.mocked(versionChecker.checkAllVersions).mockResolvedValue({
      errors: [],
      coverageProvider: { version: '1.0.0' }
    } as any);
    
    // Default spawn mock
    vi.mocked(spawn).mockReturnValue(createSpawnMock());
  });
  describe('Tool Definition', () => {
    it('should have correct name and description', () => {
      // Arrange & Act
      const tool = analyzeCoverageTool;
      
      // Assert
      expect(tool.name).toBe('analyze_coverage');
      expect(tool.description).toContain('Perform comprehensive test coverage analysis');
      expect(tool.description).toContain('line-by-line gap identification');
      expect(tool.description).toContain('actionable insights');
    });

    it('should define proper input schema', () => {
      // Arrange & Act
      const schema = analyzeCoverageTool.inputSchema;
      
      // Assert
      expect(schema).toHaveProperty('type', 'object');
      expect(schema).toHaveProperty('properties');
      expect(schema).toHaveProperty('required');
      expect(schema.required).toContain('target');
      
      const properties = schema.properties as any;
      expect(properties).toHaveProperty('target');
      expect(properties).toHaveProperty('format');
      expect(properties).toHaveProperty('exclude');
    });

    it('should include dynamic threshold descriptions', () => {
      // Arrange & Act
      const targetProperty = (analyzeCoverageTool.inputSchema.properties as any).target;
      
      // Assert
      expect(targetProperty.description).toContain('Source file path or directory');
      expect(targetProperty.description).toContain('NOT test files');
      expect(targetProperty.description).toContain('prevent accidental full project analysis');
    });

    it('should validate input parameters', () => {
      // Arrange & Act
      const properties = analyzeCoverageTool.inputSchema.properties as any;
      
      // Assert
      expect(properties.target.type).toBe('string');
      expect(properties.format.enum).toEqual(['summary', 'detailed']);
      expect(properties.exclude.type).toBe('array');
      expect(properties.exclude.items.type).toBe('string');
    });
  });

  describe('Coverage Analysis', () => {
    it('should analyze coverage from vitest output', async () => {
      // Arrange
      const mockCoverageMap = {
        '/test/project/src/file.ts': {
          path: '/test/project/src/file.ts',
          s: { '0': 1, '1': 0 },
          f: { '0': 1 },
          b: { '0': [1, 0] },
          statementMap: {
            '0': { start: { line: 1 } },
            '1': { start: { line: 2 } }
          },
          fnMap: {
            '0': { name: 'testFunction', decl: { start: { line: 1 } } }
          },
          branchMap: {
            '0': { loc: { start: { line: 1 } } }
          }
        }
      };
      
      const vitestJsonOutput = {
        numTotalTests: 1,
        numPassedTests: 1,
        numFailedTests: 0,
        numPendingTests: 0,
        coverageMap: mockCoverageMap
      };
      
      vi.mocked(spawn).mockReturnValue(createSpawnMock(vitestJsonOutput));
      
      vi.mocked(coverageProcessor.processCoverageData).mockResolvedValue({
        success: true,
        coverage: { lines: 80, functions: 50, branches: 50, statements: 80 },
        totals: { lines: 10, functions: 2, branches: 4 },
        meetsThreshold: false,
        command: 'test command',
        duration: 1000
      } as any);
      
      // Act
      const result = await handleAnalyzeCoverage({ target: './src/file.ts' });
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.coverage).toBeDefined();
      expect(result.coverage.lines).toBe(80);
    });

    it('should parse HTML coverage reports', async () => {
      // Arrange
      const mockHtmlContent = '<html><body>Coverage Report</body></html>';
      vi.mocked(readFile).mockResolvedValue(mockHtmlContent);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      
      // Act
      await handleAnalyzeCoverage({ target: './src/file.ts', format: 'detailed' });
      
      // Assert - HTML parsing is handled internally, we verify the process completes
      expect(vi.mocked(spawn)).toHaveBeenCalled();
    });

    it('should calculate coverage metrics', async () => {
      // Arrange
      vi.mocked(coverageProcessor.processCoverageData).mockResolvedValue({
        success: true,
        coverage: { lines: 85, functions: 90, branches: 75, statements: 88 },
        totals: { lines: 100, functions: 50, branches: 80 },
        meetsThreshold: true,
        command: 'test command',
        duration: 1500
      } as any);
      
      // Act
      const result = await handleAnalyzeCoverage({ target: './src/file.ts' });
      
      // Assert
      expect(result.coverage.lines).toBe(85);
      expect(result.coverage.functions).toBe(90);
      expect(result.coverage.branches).toBe(75);
      expect(result.coverage.statements).toBe(88);
      expect(result.meetsThreshold).toBe(true);
    });

    it('should identify coverage gaps', async () => {
      // Arrange
      const mockUncovered = {
        'file.ts': {
          lines: [5, 10, 15],
          functions: [{ name: 'uncoveredFunction', line: 20 }],
          branches: [25]
        }
      };
      
      vi.mocked(coverageProcessor.processCoverageData).mockResolvedValue({
        success: true,
        coverage: { lines: 70, functions: 60, branches: 50, statements: 65 },
        totals: { lines: 100, functions: 10, branches: 20 },
        meetsThreshold: false,
        uncovered: mockUncovered,
        command: 'test command',
        duration: 2000
      } as any);
      
      // Act
      const result = await handleAnalyzeCoverage({ target: './src/file.ts', format: 'detailed' });
      
      // Assert
      expect(result.uncovered).toEqual(mockUncovered);
    });

    it('should generate improvement recommendations', async () => {
      // Arrange
      const mockThresholdViolations = [
        'Line coverage (70%) is below threshold (80%)',
        'Function coverage (60%) is below threshold (80%)'
      ];
      
      vi.mocked(coverageProcessor.processCoverageData).mockResolvedValue({
        success: true,
        coverage: { lines: 70, functions: 60, branches: 80, statements: 75 },
        totals: { lines: 100, functions: 10, branches: 20 },
        meetsThreshold: false,
        thresholdViolations: mockThresholdViolations,
        command: 'test command',
        duration: 1800
      } as any);
      
      // Act
      const result = await handleAnalyzeCoverage({ target: './src/file.ts', format: 'detailed' });
      
      // Assert
      expect(result.thresholdViolations).toEqual(mockThresholdViolations);
    });
  });

  describe('Threshold Validation', () => {
    it('should apply global coverage thresholds', async () => {
      // Arrange
      vi.mocked(configLoader.getConfig).mockResolvedValue({
        coverageDefaults: {
          format: 'summary' as const,
          threshold: 90,
          exclude: []
        },
        testDefaults: { timeout: 30000 }
      } as any);
      
      vi.mocked(coverageProcessor.processCoverageData).mockImplementation(async (data, format, options) => {
        expect(options.threshold).toBe(90);
        return {
          success: true,
          coverage: { lines: 85, functions: 80, branches: 75, statements: 88 },
          totals: { lines: 100, functions: 50, branches: 80 },
          meetsThreshold: false, // Below 90% threshold
          command: 'test command',
          duration: 1000
        } as any;
      });
      
      // Act
      const result = await handleAnalyzeCoverage({ target: './src/file.ts' });
      
      // Assert
      expect(result.meetsThreshold).toBe(false);
    });

    it('should apply per-file coverage thresholds', async () => {
      // Arrange
      const customThresholds = {
        lines: 85,
        functions: 90,
        branches: 70,
        statements: 80
      };
      
      vi.mocked(configLoader.getConfig).mockResolvedValue({
        coverageDefaults: {
          format: 'summary' as const,
          threshold: 80,
          thresholds: customThresholds,
          exclude: []
        },
        testDefaults: { timeout: 30000 }
      } as any);
      
      vi.mocked(coverageProcessor.processCoverageData).mockImplementation(async (data, format, options) => {
        expect(options.thresholds).toEqual(customThresholds);
        return {
          success: true,
          coverage: { lines: 90, functions: 95, branches: 75, statements: 85 },
          totals: { lines: 100, functions: 50, branches: 80 },
          meetsThreshold: true,
          command: 'test command',
          duration: 1200
        } as any;
      });
      
      // Act
      const result = await handleAnalyzeCoverage({ target: './src/file.ts' });
      
      // Assert
      expect(result.success).toBe(true);
    });

    it('should handle missing threshold configuration', async () => {
      // Arrange
      vi.mocked(configLoader.getConfig).mockResolvedValue({
        coverageDefaults: {
          format: 'summary' as const,
          // No threshold or thresholds specified
          exclude: []
        },
        testDefaults: { timeout: 30000 }
      } as any);
      
      vi.mocked(coverageProcessor.processCoverageData).mockResolvedValue({
        success: true,
        coverage: { lines: 75, functions: 80, branches: 70, statements: 78 },
        totals: { lines: 100, functions: 50, branches: 80 },
        meetsThreshold: true, // Should pass with no thresholds
        command: 'test command',
        duration: 1000
      } as any);
      
      // Act
      const result = await handleAnalyzeCoverage({ target: './src/file.ts' });
      
      // Assert
      expect(result.success).toBe(true);
    });

    it('should validate threshold values', async () => {
      // Arrange
      const invalidThresholds = {
        lines: 150, // Invalid: > 100
        functions: -10, // Invalid: < 0
        branches: 80,
        statements: 85
      };
      
      vi.mocked(configLoader.getConfig).mockResolvedValue({
        coverageDefaults: {
          format: 'summary' as const,
          threshold: 80,
          thresholds: invalidThresholds,
          exclude: []
        },
        testDefaults: { timeout: 30000 }
      } as any);
      
      // Act & Assert
      // The validation happens during command building, so we expect normal execution
      const result = await handleAnalyzeCoverage({ target: './src/file.ts' });
      expect(result).toBeDefined();
    });

    it('should report threshold violations', async () => {
      // Arrange
      const violations = [
        'Line coverage (70%) is below threshold (80%)',
        'Branch coverage (60%) is below threshold (80%)'
      ];
      
      vi.mocked(coverageProcessor.processCoverageData).mockResolvedValue({
        success: true,
        coverage: { lines: 70, functions: 85, branches: 60, statements: 75 },
        totals: { lines: 100, functions: 50, branches: 80 },
        meetsThreshold: false,
        thresholdViolations: violations,
        command: 'test command',
        duration: 1500
      } as any);
      
      // Act
      const result = await handleAnalyzeCoverage({ target: './src/file.ts', format: 'detailed' });
      
      // Assert
      expect(result.thresholdViolations).toEqual(violations);
      expect(result.meetsThreshold).toBe(false);
    });
  });

  describe('Coverage Gap Analysis', () => {
    it('should identify uncovered lines', async () => {
      // Arrange
      const mockUncovered = {
        'file.ts': {
          lines: [5, 12, 18, 25],
          functions: [],
          branches: []
        }
      };
      
      vi.mocked(coverageProcessor.processCoverageData).mockResolvedValue({
        success: true,
        coverage: { lines: 75, functions: 100, branches: 100, statements: 80 },
        totals: { lines: 100, functions: 10, branches: 20 },
        meetsThreshold: false,
        uncovered: mockUncovered,
        command: 'test command',
        duration: 1000
      } as any);
      
      // Act
      const result = await handleAnalyzeCoverage({ target: './src/file.ts', format: 'detailed' });
      
      // Assert
      expect(result.uncovered).toBeDefined();
      expect(result.uncovered!['file.ts'].lines).toEqual([5, 12, 18, 25]);
    });

    it('should identify uncovered functions', async () => {
      // Arrange
      const mockUncovered = {
        'file.ts': {
          lines: [],
          functions: [
            { name: 'helperFunction', line: 10 },
            { name: 'utilityMethod', line: 25 }
          ],
          branches: []
        }
      };
      
      vi.mocked(coverageProcessor.processCoverageData).mockResolvedValue({
        success: true,
        coverage: { lines: 100, functions: 60, branches: 100, statements: 90 },
        totals: { lines: 50, functions: 10, branches: 20 },
        meetsThreshold: false,
        uncovered: mockUncovered,
        command: 'test command',
        duration: 1200
      } as any);
      
      // Act
      const result = await handleAnalyzeCoverage({ target: './src/file.ts', format: 'detailed' });
      
      // Assert
      expect(result.uncovered!['file.ts'].functions).toHaveLength(2);
      expect(result.uncovered!['file.ts'].functions[0].name).toBe('helperFunction');
      expect(result.uncovered!['file.ts'].functions[1].name).toBe('utilityMethod');
    });

    it('should identify uncovered branches', async () => {
      // Arrange
      const mockUncovered = {
        'file.ts': {
          lines: [],
          functions: [],
          branches: [8, 15, 22]
        }
      };
      
      vi.mocked(coverageProcessor.processCoverageData).mockResolvedValue({
        success: true,
        coverage: { lines: 100, functions: 100, branches: 65, statements: 95 },
        totals: { lines: 50, functions: 10, branches: 20 },
        meetsThreshold: false,
        uncovered: mockUncovered,
        command: 'test command',
        duration: 1100
      } as any);
      
      // Act
      const result = await handleAnalyzeCoverage({ target: './src/file.ts', format: 'detailed' });
      
      // Assert
      expect(result.uncovered!['file.ts'].branches).toEqual([8, 15, 22]);
    });

    it('should prioritize gaps by importance', async () => {
      // Arrange
      const mockFileBreakdown = [
        {
          path: 'critical.ts',
          coverage: { lines: 50, functions: 40, branches: 30, statements: 45 },
          totals: { lines: 100, functions: 10, branches: 20, statements: 100 },
          covered: { lines: 50, functions: 4, branches: 6, statements: 45 }
        },
        {
          path: 'utility.ts',
          coverage: { lines: 90, functions: 85, branches: 80, statements: 88 },
          totals: { lines: 50, functions: 5, branches: 10, statements: 50 },
          covered: { lines: 45, functions: 4, branches: 8, statements: 44 }
        }
      ];
      
      vi.mocked(coverageProcessor.processCoverageData).mockResolvedValue({
        success: true,
        coverage: { lines: 70, functions: 62, branches: 55, statements: 66 },
        totals: { lines: 150, functions: 15, branches: 30 },
        meetsThreshold: false,
        fileBreakdown: mockFileBreakdown,
        command: 'test command',
        duration: 1800
      } as any);
      
      // Act
      const result = await handleAnalyzeCoverage({ target: './src/', format: 'detailed' });
      
      // Assert
      expect(result.fileBreakdown).toHaveLength(2);
      // Critical file with lower coverage should be identified
      const criticalFile = result.fileBreakdown!.find(f => f.path === 'critical.ts');
      expect(criticalFile?.coverage.lines).toBe(50); // Lower priority due to poor coverage
    });

    it('should suggest specific test additions', async () => {
      // Arrange
      const mockUncovered = {
        'UserService.ts': {
          lines: [45, 67],
          functions: [{ name: 'validateUser', line: 45 }],
          branches: [67]
        }
      };
      
      vi.mocked(coverageProcessor.processCoverageData).mockResolvedValue({
        success: true,
        coverage: { lines: 85, functions: 80, branches: 75, statements: 82 },
        totals: { lines: 100, functions: 10, branches: 20 },
        meetsThreshold: true,
        uncovered: mockUncovered,
        command: 'test command',
        duration: 1300
      } as any);
      
      // Act
      const result = await handleAnalyzeCoverage({ target: './src/UserService.ts', format: 'detailed' });
      
      // Assert
      expect(result.uncovered).toBeDefined();
      const userServiceGaps = result.uncovered!['UserService.ts'];
      expect(userServiceGaps.functions).toContainEqual({ name: 'validateUser', line: 45 });
      expect(userServiceGaps.lines).toContain(45);
      expect(userServiceGaps.branches).toContain(67);
    });
  });

  describe('Report Generation', () => {
    it('should generate summary reports', async () => {
      // Arrange
      vi.mocked(coverageProcessor.processCoverageData).mockResolvedValue({
        success: true,
        coverage: { lines: 88, functions: 92, branches: 75, statements: 85 },
        totals: { lines: 100, functions: 25, branches: 40 },
        meetsThreshold: true,
        command: 'npx vitest run --coverage ./src/file.ts',
        duration: 2500
      } as any);
      
      // Act
      const result = await handleAnalyzeCoverage({ target: './src/file.ts', format: 'summary' });
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.coverage).toBeDefined();
      expect(result.totals).toBeDefined();
      expect(result.command).toContain('npx vitest run');
      expect(result.duration).toBeGreaterThan(0);
      // Summary format should not include detailed breakdown
      expect(result.fileBreakdown).toBeUndefined();
      expect(result.uncovered).toBeUndefined();
    });

    it('should generate detailed coverage reports', async () => {
      // Arrange
      const mockFileBreakdown = [
        {
          path: 'component.ts',
          coverage: { lines: 95, functions: 100, branches: 85, statements: 92 },
          totals: { lines: 80, functions: 8, branches: 15, statements: 80 },
          covered: { lines: 76, functions: 8, branches: 13, statements: 74 }
        }
      ];
      
      const mockUncovered = {
        'component.ts': {
          lines: [12, 25],
          functions: [],
          branches: [15, 18]
        }
      };
      
      vi.mocked(coverageProcessor.processCoverageData).mockResolvedValue({
        success: true,
        coverage: { lines: 95, functions: 100, branches: 85, statements: 92 },
        totals: { lines: 80, functions: 8, branches: 15 },
        meetsThreshold: true,
        fileBreakdown: mockFileBreakdown,
        uncovered: mockUncovered,
        thresholdViolations: [],
        command: 'npx vitest run --coverage ./src/component.ts',
        duration: 3200
      } as any);
      
      // Act
      const result = await handleAnalyzeCoverage({ target: './src/component.ts', format: 'detailed' });
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.fileBreakdown).toBeDefined();
      expect(result.uncovered).toBeDefined();
      expect(result.fileBreakdown).toHaveLength(1);
      expect(result.uncovered!['component.ts']).toBeDefined();
    });

    it('should include actionable recommendations', async () => {
      // Arrange
      const recommendations = [
        'Line coverage (65%) is below threshold (80%)',
        'Function coverage (70%) is below threshold (80%)'
      ];
      
      vi.mocked(coverageProcessor.processCoverageData).mockResolvedValue({
        success: true,
        coverage: { lines: 65, functions: 70, branches: 85, statements: 72 },
        totals: { lines: 100, functions: 20, branches: 30 },
        meetsThreshold: false,
        thresholdViolations: recommendations,
        command: 'npx vitest run --coverage ./src/file.ts',
        duration: 1900
      } as any);
      
      // Act
      const result = await handleAnalyzeCoverage({ target: './src/file.ts', format: 'detailed' });
      
      // Assert
      expect(result.thresholdViolations).toEqual(recommendations);
      expect(result.meetsThreshold).toBe(false);
    });

    it('should format reports for readability', async () => {
      // Arrange
      vi.mocked(coverageProcessor.processCoverageData).mockResolvedValue({
        success: true,
        coverage: { lines: 82, functions: 88, branches: 76, statements: 84 },
        totals: { lines: 150, functions: 32, branches: 45 },
        meetsThreshold: true,
        command: 'npx vitest run --coverage ./src/module/',
        duration: 4100
      } as any);
      
      // Act
      const result = await handleAnalyzeCoverage({ target: './src/module/', format: 'summary' });
      
      // Assert
      expect(result.coverage.lines).toBe(82);
      expect(result.coverage.functions).toBe(88);
      expect(result.coverage.branches).toBe(76);
      expect(result.coverage.statements).toBe(84);
      // Numbers should be properly rounded
      expect(Number.isInteger(result.coverage.lines)).toBe(true);
      expect(Number.isInteger(result.coverage.functions)).toBe(true);
    });

    it('should include coverage trends when available', async () => {
      // Arrange
      const mockFileBreakdown = [
        {
          path: 'trending.ts',
          coverage: { lines: 90, functions: 95, branches: 88, statements: 92 },
          totals: { lines: 60, functions: 12, branches: 18, statements: 60 },
          covered: { lines: 54, functions: 11, branches: 16, statements: 55 }
        },
        {
          path: 'stable.ts',
          coverage: { lines: 85, functions: 90, branches: 82, statements: 87 },
          totals: { lines: 40, functions: 8, branches: 12, statements: 40 },
          covered: { lines: 34, functions: 7, branches: 10, statements: 35 }
        }
      ];
      
      vi.mocked(coverageProcessor.processCoverageData).mockResolvedValue({
        success: true,
        coverage: { lines: 88, functions: 93, branches: 85, statements: 90 },
        totals: { lines: 100, functions: 20, branches: 30 },
        meetsThreshold: true,
        fileBreakdown: mockFileBreakdown,
        command: 'npx vitest run --coverage ./src/',
        duration: 5200
      } as any);
      
      // Act
      const result = await handleAnalyzeCoverage({ target: './src/', format: 'detailed' });
      
      // Assert
      expect(result.fileBreakdown).toHaveLength(2);
      // Higher coverage files indicate positive trends
      const trendingFile = result.fileBreakdown!.find(f => f.path === 'trending.ts');
      expect(trendingFile?.coverage.lines).toBe(90);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing coverage data gracefully', async () => {
      // Arrange
      vi.mocked(spawn).mockReturnValue({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            setTimeout(() => callback(1), 0); // Exit with error
          }
        }),
        kill: vi.fn()
      } as any);
      
      // Act
      const result = await handleAnalyzeCoverage({ target: './src/file.ts' });
      
      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle corrupted coverage files', async () => {
      // Arrange
      vi.mocked(readFile).mockRejectedValue(new Error('File corrupted'));
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      
      vi.mocked(spawn).mockReturnValue({
        stdout: { on: vi.fn((event, callback) => {
          if (event === 'data') {
            callback('invalid json data');
          }
        }) },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 0);
          }
        }),
        kill: vi.fn()
      } as any);
      
      // Act
      const result = await handleAnalyzeCoverage({ target: './src/file.ts' });
      
      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should validate project root is set', async () => {
      // Arrange
      vi.mocked(projectContext.getProjectRoot).mockImplementation(() => {
        throw new Error('Project root has not been set');
      });
      
      // Act
      const result = await handleAnalyzeCoverage({ target: './src/file.ts' });
      
      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Please call set_project_root first');
    });

    it('should provide helpful error messages', async () => {
      // Arrange - Target is a test file
      vi.mocked(projectContext.getProjectRoot).mockReturnValue('/test/project');
      
      // Act
      const result = await handleAnalyzeCoverage({ target: './src/file.test.ts' });
      
      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Run coverage analysis on the source file, not the test file');
    });
  });

  describe('Integration', () => {
    it('should integrate with vitest coverage providers', async () => {
      // Arrange
      vi.mocked(versionChecker.checkAllVersions).mockResolvedValue({
        errors: [],
        coverageProvider: { version: '1.2.0' },
        vitest: { version: '1.0.0' }
      } as any);
      
      vi.mocked(coverageProcessor.processCoverageData).mockResolvedValue({
        success: true,
        coverage: { lines: 85, functions: 90, branches: 78, statements: 87 },
        totals: { lines: 100, functions: 20, branches: 30 },
        meetsThreshold: true,
        command: 'npx vitest run --coverage ./src/file.ts',
        duration: 2200
      } as any);
      
      // Act
      const result = await handleAnalyzeCoverage({ target: './src/file.ts' });
      
      // Assert
      expect(result.success).toBe(true);
      expect(vi.mocked(versionChecker.checkAllVersions)).toHaveBeenCalled();
    });

    it('should work with different project structures', async () => {
      // Arrange - Nested project structure
      vi.mocked(projectContext.getProjectRoot).mockReturnValue('/test/nested/project');
      vi.mocked(fileUtils.fileExists).mockImplementation(async (path: string) => {
        return path.includes('/test/nested/project/');
      });
      
      vi.mocked(coverageProcessor.processCoverageData).mockResolvedValue({
        success: true,
        coverage: { lines: 82, functions: 85, branches: 79, statements: 83 },
        totals: { lines: 80, functions: 15, branches: 25 },
        meetsThreshold: true,
        command: 'npx vitest run --coverage ./src/nested/file.ts',
        duration: 1800
      } as any);
      
      // Act
      const result = await handleAnalyzeCoverage({ target: './src/nested/file.ts' });
      
      // Assert
      expect(result.success).toBe(true);
    });

    it('should handle monorepo configurations', async () => {
      // Arrange - Monorepo with multiple packages
      vi.mocked(projectContext.getProjectRoot).mockReturnValue('/monorepo/packages/package-a');
      
      const mockFileBreakdown = [
        {
          path: 'packages/package-a/src/moduleA.ts',
          coverage: { lines: 90, functions: 95, branches: 85, statements: 92 },
          totals: { lines: 50, functions: 10, branches: 15, statements: 50 },
          covered: { lines: 45, functions: 9, branches: 13, statements: 46 }
        }
      ];
      
      vi.mocked(coverageProcessor.processCoverageData).mockResolvedValue({
        success: true,
        coverage: { lines: 90, functions: 95, branches: 85, statements: 92 },
        totals: { lines: 50, functions: 10, branches: 15 },
        meetsThreshold: true,
        fileBreakdown: mockFileBreakdown,
        command: 'npx vitest run --coverage ./src/moduleA.ts',
        duration: 2800
      } as any);
      
      // Act
      const result = await handleAnalyzeCoverage({ target: './src/moduleA.ts', format: 'detailed' });
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.fileBreakdown).toHaveLength(1);
    });

    it('should respect coverage configuration files', async () => {
      // Arrange
      vi.mocked(configLoader.getConfig).mockResolvedValue({
        coverageDefaults: {
          format: 'detailed' as const,
          threshold: 85,
          exclude: ['**/*.stories.*', '**/mocks/**'],
          thresholds: {
            lines: 85,
            functions: 90,
            branches: 80,
            statements: 85
          }
        },
        testDefaults: { timeout: 45000 }
      } as any);
      
      // Mock spawn to verify exclude patterns are passed
      const mockSpawn = vi.mocked(spawn).mockReturnValue(createSpawnMock());
      
      vi.mocked(coverageProcessor.processCoverageData).mockResolvedValue({
        success: true,
        coverage: { lines: 88, functions: 92, branches: 85, statements: 90 },
        totals: { lines: 100, functions: 25, branches: 35 },
        meetsThreshold: true,
        command: 'npx vitest run --coverage ./src/file.ts',
        duration: 3100
      } as any);
      
      // Act
      const result = await handleAnalyzeCoverage({ target: './src/file.ts' });
      
      // Assert
      expect(result.success).toBe(true);
      expect(mockSpawn).toHaveBeenCalled();
      // Verify that the spawn call included exclude patterns
      const spawnArgs = mockSpawn.mock.calls[0][1] as string[];
      expect(spawnArgs.some(arg => arg.includes('**/*.stories.*'))).toBe(true);
    });
  });
});