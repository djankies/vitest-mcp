import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import {
  fileExists,
  isDirectory,
  findTestFiles,
  findProjectRoot,
  type TestFile
} from '../file-utils';

vi.mock('fs', () => ({
  promises: {
    access: vi.fn(),
    stat: vi.fn(),
    readdir: vi.fn()
  }
}));

describe('file-utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fileExists', () => {
    it('should return true when file exists', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      
      const result = await fileExists('/path/to/file');
      
      expect(result).toBe(true);
      expect(fs.access).toHaveBeenCalledWith('/path/to/file');
    });

    it('should return false when file does not exist', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
      
      const result = await fileExists('/path/to/nonexistent');
      
      expect(result).toBe(false);
    });
  });

  describe('isDirectory', () => {
    it('should return true for directories', async () => {
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => true
      } as any);
      
      const result = await isDirectory('/path/to/dir');
      
      expect(result).toBe(true);
      expect(fs.stat).toHaveBeenCalledWith('/path/to/dir');
    });

    it('should return false for files', async () => {
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => false
      } as any);
      
      const result = await isDirectory('/path/to/file');
      
      expect(result).toBe(false);
    });

    it('should return false when stat fails', async () => {
      vi.mocked(fs.stat).mockRejectedValue(new Error('ENOENT'));
      
      const result = await isDirectory('/path/to/nonexistent');
      
      expect(result).toBe(false);
    });
  });

  describe('findTestFiles', () => {
    it('should find test files recursively', async () => {
      const mockDirEntries = [
        { name: 'file.test.ts', isDirectory: () => false, isFile: () => true },
        { name: 'file.spec.js', isDirectory: () => false, isFile: () => true },
        { name: 'src', isDirectory: () => true, isFile: () => false },
        { name: 'node_modules', isDirectory: () => true, isFile: () => false },
        { name: 'regular.ts', isDirectory: () => false, isFile: () => true }
      ];

      const mockSrcEntries = [
        { name: 'component.test.tsx', isDirectory: () => false, isFile: () => true },
        { name: '__tests__', isDirectory: () => true, isFile: () => false }
      ];

      const mockTestsEntries = [
        { name: 'unit.test.js', isDirectory: () => false, isFile: () => true }
      ];

      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(mockDirEntries as any)
        .mockResolvedValueOnce(mockSrcEntries as any)
        .mockResolvedValueOnce(mockTestsEntries as any);

      const result = await findTestFiles('/project');

      expect(result).toHaveLength(4);
      expect(result[0].relativePath).toBe('file.spec.js');
      expect(result[1].relativePath).toBe('file.test.ts');
      expect(result[2].relativePath).toBe(join('src', '__tests__', 'unit.test.js'));
      expect(result[3].relativePath).toBe(join('src', 'component.test.tsx'));
    });

    it('should determine test types correctly', async () => {
      const mockEntries = [
        { name: 'unit.test.ts', isDirectory: () => false, isFile: () => true },
        { name: 'e2e', isDirectory: () => true, isFile: () => false },
        { name: 'integration', isDirectory: () => true, isFile: () => false }
      ];

      const mockE2EEntries = [
        { name: 'app.test.ts', isDirectory: () => false, isFile: () => true }
      ];

      const mockIntegrationEntries = [
        { name: 'api.test.ts', isDirectory: () => false, isFile: () => true }
      ];

      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(mockEntries as any)
        .mockResolvedValueOnce(mockE2EEntries as any)
        .mockResolvedValueOnce(mockIntegrationEntries as any);

      const result = await findTestFiles('/project');

      expect(result.find(f => f.relativePath === 'unit.test.ts')?.type).toBe('unit');
      expect(result.find(f => f.relativePath.includes('e2e'))?.type).toBe('e2e');
      expect(result.find(f => f.relativePath.includes('integration'))?.type).toBe('integration');
    });

    it('should skip excluded directories', async () => {
      const mockEntries = [
        { name: 'node_modules', isDirectory: () => true, isFile: () => false },
        { name: 'dist', isDirectory: () => true, isFile: () => false },
        { name: 'build', isDirectory: () => true, isFile: () => false },
        { name: '.git', isDirectory: () => true, isFile: () => false },
        { name: 'test.spec.ts', isDirectory: () => false, isFile: () => true }
      ];

      vi.mocked(fs.readdir).mockResolvedValueOnce(mockEntries as any);

      const result = await findTestFiles('/project');

      expect(result).toHaveLength(1);
      expect(result[0].relativePath).toBe('test.spec.ts');
      expect(fs.readdir).toHaveBeenCalledTimes(1);
    });

    it('should handle read errors gracefully', async () => {
      vi.mocked(fs.readdir).mockRejectedValue(new Error('Permission denied'));

      const result = await findTestFiles('/restricted');

      expect(result).toEqual([]);
    });
  });

  describe('findProjectRoot', () => {
    it('should find project root with package.json', async () => {
      const originalCwd = process.cwd;
      process.cwd = vi.fn().mockReturnValue('/project/src/utils');

      vi.mocked(fs.access)
        .mockRejectedValueOnce(new Error('Not found')) // /project/src/utils/package.json
        .mockRejectedValueOnce(new Error('Not found')) // /project/src/package.json
        .mockResolvedValueOnce(undefined); // /project/package.json

      const result = await findProjectRoot();

      expect(result).toBe(resolve('/project'));
      process.cwd = originalCwd;
    });

    it('should return start path if no package.json found', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('Not found'));

      const result = await findProjectRoot('/some/deep/path');

      expect(result).toBe('/some/deep/path');
    });

    it('should handle root directory correctly', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('Not found'));

      const result = await findProjectRoot('/');

      expect(result).toBe('/');
    });
  });
});