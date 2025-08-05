import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleListTests, listTestsTool } from '../list-tests';
import * as fileUtils from '../../utils/file-utils';

vi.mock('../../utils/file-utils', () => ({
  findTestFiles: vi.fn(),
  findProjectRoot: vi.fn(),
  fileExists: vi.fn(),
  isDirectory: vi.fn()
}));

describe('list-tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listTestsTool', () => {
    it('should have correct tool definition', () => {
      expect(listTestsTool.name).toBe('list_tests');
      expect(listTestsTool.description).toBe('Find and list test files in the project or specified directory');
      expect(listTestsTool.inputSchema).toEqual({
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Directory path to search for test files (defaults to project root)'
          }
        }
      });
    });
  });

  describe('handleListTests', () => {
    it('should list test files from project root by default', async () => {
      const mockTestFiles = [
        { path: '/project/src/test1.test.ts', relativePath: 'src/test1.test.ts', type: 'unit' as const },
        { path: '/project/src/test2.spec.js', relativePath: 'src/test2.spec.js', type: 'unit' as const }
      ];

      vi.mocked(fileUtils.findProjectRoot).mockResolvedValue('/project');
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue(mockTestFiles);

      const result = await handleListTests({});

      expect(result).toEqual({
        testFiles: mockTestFiles,
        totalCount: 2,
        searchPath: '/project',
        projectRoot: '/project'
      });
      expect(fileUtils.findTestFiles).toHaveBeenCalledWith('/project');
    });

    it('should list test files from specified path', async () => {
      const mockTestFiles = [
        { path: '/project/src/utils/test.test.ts', relativePath: 'test.test.ts', type: 'unit' as const }
      ];

      vi.mocked(fileUtils.findProjectRoot).mockResolvedValue('/project');
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue(mockTestFiles);

      const result = await handleListTests({ path: 'src/utils' });

      expect(result.searchPath).toBe('/project/src/utils');
      expect(fileUtils.findTestFiles).toHaveBeenCalledWith('/project/src/utils');
    });

    it('should throw error if search path does not exist', async () => {
      vi.mocked(fileUtils.findProjectRoot).mockResolvedValue('/project');
      vi.mocked(fileUtils.fileExists).mockResolvedValue(false);

      await expect(handleListTests({ path: 'nonexistent' })).rejects.toThrow(
        'Search path does not exist: /project/nonexistent'
      );
    });

    it('should throw error if search path is not a directory', async () => {
      vi.mocked(fileUtils.findProjectRoot).mockResolvedValue('/project');
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(false);

      await expect(handleListTests({ path: 'file.txt' })).rejects.toThrow(
        'Search path is not a directory: /project/file.txt'
      );
    });

    it('should handle findTestFiles errors', async () => {
      vi.mocked(fileUtils.findProjectRoot).mockResolvedValue('/project');
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockRejectedValue(new Error('Permission denied'));

      await expect(handleListTests({})).rejects.toThrow(
        'Failed to list test files: Permission denied'
      );
    });

    it('should handle empty test file results', async () => {
      vi.mocked(fileUtils.findProjectRoot).mockResolvedValue('/project');
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue([]);

      const result = await handleListTests({});

      expect(result).toEqual({
        testFiles: [],
        totalCount: 0,
        searchPath: '/project',
        projectRoot: '/project'
      });
    });

    it('should correctly map test file types', async () => {
      const mockTestFiles = [
        { path: '/project/tests/unit/test.ts', relativePath: 'tests/unit/test.ts', type: 'unit' as const },
        { path: '/project/tests/e2e/app.test.ts', relativePath: 'tests/e2e/app.test.ts', type: 'e2e' as const },
        { path: '/project/tests/integration/api.test.ts', relativePath: 'tests/integration/api.test.ts', type: 'integration' as const },
        { path: '/project/random.test.ts', relativePath: 'random.test.ts', type: 'unknown' as const }
      ];

      vi.mocked(fileUtils.findProjectRoot).mockResolvedValue('/project');
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue(mockTestFiles);

      const result = await handleListTests({});

      expect(result.testFiles).toEqual(mockTestFiles);
      expect(result.testFiles.map(f => f.type)).toEqual(['unit', 'e2e', 'integration', 'unknown']);
    });
  });
});