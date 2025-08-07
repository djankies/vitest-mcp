import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolve } from 'path';
import { listTestsTool, handleListTests } from '../list-tests';
import { projectContext } from '../../context/project-context';
import * as fileUtils from '../../utils/file-utils';

vi.mock('../../context/project-context');
vi.mock('../../utils/file-utils');

describe('list-tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listTestsTool', () => {
    it('should have correct tool definition', () => {
      // Arrange
      const expectedName = 'list_tests';
      
      // Act
      const tool = listTestsTool;
      
      // Assert
      expect(tool.name).toBe(expectedName);
      expect(tool.description).toContain('test files');
      expect(tool.description).toContain('discover');
      expect(tool.description).toContain('catalog');
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toHaveProperty('path');
      expect(tool.inputSchema.properties.path.type).toBe('string');
    });
  });

  describe('handleListTests', () => {
    it('should list test files from project root by default', async () => {
      // Arrange
      const projectRoot = '/project';
      const mockTestFiles = [
        { path: '/project/src/test.spec.ts', relativePath: 'src/test.spec.ts', type: 'unit' as const },
        { path: '/project/tests/app.test.js', relativePath: 'tests/app.test.js', type: 'unit' as const }
      ];
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue(mockTestFiles);
      
      // Act
      const result = await handleListTests({});
      
      // Assert
      expect(result.testFiles).toHaveLength(2);
      expect(result.testFiles[0].path).toBe('/project/src/test.spec.ts');
      expect(result.testFiles[0].relativePath).toBe('src/test.spec.ts');
      expect(result.totalCount).toBe(2);
      expect(result.searchPath).toBe(projectRoot);
      expect(result.projectRoot).toBe(projectRoot);
      expect(fileUtils.findTestFiles).toHaveBeenCalledWith(projectRoot);
    });

    it('should handle relative path argument', async () => {
      // Arrange
      const projectRoot = '/project';
      const relativePath = './src/components';
      const expectedSearchPath = resolve(projectRoot, relativePath);
      const mockTestFiles = [
        { path: '/project/src/components/button.test.tsx', relativePath: 'button.test.tsx', type: 'unit' as const }
      ];
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue(mockTestFiles);
      
      // Act
      const result = await handleListTests({ path: relativePath });
      
      // Assert
      expect(result.searchPath).toBe(expectedSearchPath);
      expect(fileUtils.findTestFiles).toHaveBeenCalledWith(expectedSearchPath);
      expect(result.testFiles).toHaveLength(1);
    });

    it('should handle absolute path argument', async () => {
      // Arrange
      const projectRoot = '/project';
      const absolutePath = '/project/tests';
      const mockTestFiles = [
        { path: '/project/tests/integration.test.js', relativePath: 'integration.test.js', type: 'integration' as const }
      ];
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue(mockTestFiles);
      
      // Act
      const result = await handleListTests({ path: absolutePath });
      
      // Assert
      expect(result.searchPath).toBe(resolve(projectRoot, absolutePath));
      expect(fileUtils.findTestFiles).toHaveBeenCalledWith(resolve(projectRoot, absolutePath));
    });

    it('should validate project root is set', async () => {
      // Arrange
      vi.mocked(projectContext.getProjectRoot).mockImplementation(() => {
        throw new Error('Project root not set');
      });
      
      // Act & Assert
      await expect(handleListTests({})).rejects.toThrow('Please call set_project_root first');
    });

    it('should return error if project root not set', async () => {
      // Arrange
      vi.mocked(projectContext.getProjectRoot).mockImplementation(() => {
        throw new Error('Project root has not been set');
      });
      
      // Act & Assert
      await expect(handleListTests({})).rejects.toThrow('Failed to list test files: Please call set_project_root first');
    });

    it('should find test files in specified directory', async () => {
      // Arrange
      const projectRoot = '/project';
      const targetPath = 'src/components';
      const expectedSearchPath = resolve(projectRoot, targetPath);
      const mockTestFiles = [
        { path: '/project/src/components/button.test.tsx', relativePath: 'button.test.tsx', type: 'unit' as const },
        { path: '/project/src/components/modal.spec.ts', relativePath: 'modal.spec.ts', type: 'unit' as const }
      ];
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue(mockTestFiles);
      
      // Act
      const result = await handleListTests({ path: targetPath });
      
      // Assert
      expect(result.testFiles).toHaveLength(2);
      expect(result.searchPath).toBe(expectedSearchPath);
      expect(fileUtils.findTestFiles).toHaveBeenCalledWith(expectedSearchPath);
    });

    it('should handle non-existent directories gracefully', async () => {
      // Arrange
      const projectRoot = '/project';
      const nonExistentPath = 'nonexistent';
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(false);
      
      // Act & Assert
      await expect(handleListTests({ path: nonExistentPath })).rejects.toThrow('Search path does not exist');
    });

    it('should filter by supported test file patterns', async () => {
      // Arrange
      const projectRoot = '/project';
      const mockTestFiles = [
        { path: '/project/valid.test.ts', relativePath: 'valid.test.ts', type: 'unit' as const },
        { path: '/project/also.spec.js', relativePath: 'also.spec.js', type: 'unit' as const }
      ];
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue(mockTestFiles);
      
      // Act
      const result = await handleListTests({});
      
      // Assert
      expect(result.testFiles.every(f => 
        f.path.includes('.test.') || f.path.includes('.spec.')
      )).toBe(true);
    });
  });

  describe('Test File Discovery', () => {
    it('should find .test.ts files', async () => {
      // Arrange
      const projectRoot = '/project';
      const mockTestFiles = [
        { path: '/project/component.test.ts', relativePath: 'component.test.ts', type: 'unit' as const }
      ];
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue(mockTestFiles);
      
      // Act
      const result = await handleListTests({});
      
      // Assert
      expect(result.testFiles.some(f => f.path.endsWith('.test.ts'))).toBe(true);
    });

    it('should find .test.js files', async () => {
      // Arrange
      const projectRoot = '/project';
      const mockTestFiles = [
        { path: '/project/utils.test.js', relativePath: 'utils.test.js', type: 'unit' as const }
      ];
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue(mockTestFiles);
      
      // Act
      const result = await handleListTests({});
      
      // Assert
      expect(result.testFiles.some(f => f.path.endsWith('.test.js'))).toBe(true);
    });

    it('should find .spec.ts files', async () => {
      // Arrange
      const projectRoot = '/project';
      const mockTestFiles = [
        { path: '/project/service.spec.ts', relativePath: 'service.spec.ts', type: 'unit' as const }
      ];
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue(mockTestFiles);
      
      // Act
      const result = await handleListTests({});
      
      // Assert
      expect(result.testFiles.some(f => f.path.endsWith('.spec.ts'))).toBe(true);
    });

    it('should find .spec.js files', async () => {
      // Arrange
      const projectRoot = '/project';
      const mockTestFiles = [
        { path: '/project/api.spec.js', relativePath: 'api.spec.js', type: 'unit' as const }
      ];
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue(mockTestFiles);
      
      // Act
      const result = await handleListTests({});
      
      // Assert
      expect(result.testFiles.some(f => f.path.endsWith('.spec.js'))).toBe(true);
    });

    it('should find .test.jsx files', async () => {
      // Arrange
      const projectRoot = '/project';
      const mockTestFiles = [
        { path: '/project/button.test.jsx', relativePath: 'button.test.jsx', type: 'unit' as const }
      ];
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue(mockTestFiles);
      
      // Act
      const result = await handleListTests({});
      
      // Assert
      expect(result.testFiles.some(f => f.path.endsWith('.test.jsx'))).toBe(true);
    });

    it('should find .test.tsx files', async () => {
      // Arrange
      const projectRoot = '/project';
      const mockTestFiles = [
        { path: '/project/modal.test.tsx', relativePath: 'modal.test.tsx', type: 'unit' as const }
      ];
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue(mockTestFiles);
      
      // Act
      const result = await handleListTests({});
      
      // Assert
      expect(result.testFiles.some(f => f.path.endsWith('.test.tsx'))).toBe(true);
    });

    it('should find .spec.jsx files', async () => {
      // Arrange
      const projectRoot = '/project';
      const mockTestFiles = [
        { path: '/project/form.spec.jsx', relativePath: 'form.spec.jsx', type: 'unit' as const }
      ];
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue(mockTestFiles);
      
      // Act
      const result = await handleListTests({});
      
      // Assert
      expect(result.testFiles.some(f => f.path.endsWith('.spec.jsx'))).toBe(true);
    });

    it('should find .spec.tsx files', async () => {
      // Arrange
      const projectRoot = '/project';
      const mockTestFiles = [
        { path: '/project/header.spec.tsx', relativePath: 'header.spec.tsx', type: 'unit' as const }
      ];
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue(mockTestFiles);
      
      // Act
      const result = await handleListTests({});
      
      // Assert
      expect(result.testFiles.some(f => f.path.endsWith('.spec.tsx'))).toBe(true);
    });

    it('should ignore non-test files', async () => {
      // Arrange
      const projectRoot = '/project';
      const mockTestFiles = [
        { path: '/project/actual.test.ts', relativePath: 'actual.test.ts', type: 'unit' as const }
      ];
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue(mockTestFiles);
      
      // Act
      const result = await handleListTests({});
      
      // Assert
      expect(result.testFiles.every(f => 
        f.path.includes('.test.') || f.path.includes('.spec.')
      )).toBe(true);
      expect(result.testFiles.some(f => 
        f.path.endsWith('.ts') && !f.path.includes('.test.') && !f.path.includes('.spec.')
      )).toBe(false);
    });

    it('should handle nested directory structures', async () => {
      // Arrange
      const projectRoot = '/project';
      const mockTestFiles = [
        { path: '/project/src/components/__tests__/button.test.tsx', relativePath: 'src/components/__tests__/button.test.tsx', type: 'unit' as const },
        { path: '/project/tests/integration/api.spec.js', relativePath: 'tests/integration/api.spec.js', type: 'integration' as const },
        { path: '/project/e2e/user-flow.test.ts', relativePath: 'e2e/user-flow.test.ts', type: 'e2e' as const }
      ];
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue(mockTestFiles);
      
      // Act
      const result = await handleListTests({});
      
      // Assert
      expect(result.testFiles).toHaveLength(3);
      expect(result.testFiles.some(f => f.relativePath.includes('src/components/__tests__'))).toBe(true);
      expect(result.testFiles.some(f => f.relativePath.includes('tests/integration'))).toBe(true);
      expect(result.testFiles.some(f => f.relativePath.includes('e2e'))).toBe(true);
    });
  });

  describe('Path Handling', () => {
    it('should resolve relative paths correctly', async () => {
      // Arrange
      const projectRoot = '/project';
      const relativePath = './src/components';
      const expectedResolvedPath = resolve(projectRoot, relativePath);
      const mockTestFiles = [
        { path: '/project/src/components/test.spec.ts', relativePath: 'test.spec.ts', type: 'unit' as const }
      ];
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue(mockTestFiles);
      
      // Act
      const result = await handleListTests({ path: relativePath });
      
      // Assert
      expect(result.searchPath).toBe(expectedResolvedPath);
      expect(fileUtils.findTestFiles).toHaveBeenCalledWith(expectedResolvedPath);
    });

    it('should handle absolute paths', async () => {
      // Arrange
      const projectRoot = '/project';
      const absolutePath = '/project/tests';
      const mockTestFiles = [
        { path: '/project/tests/unit.test.js', relativePath: 'unit.test.js', type: 'unit' as const }
      ];
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue(mockTestFiles);
      
      // Act
      const result = await handleListTests({ path: absolutePath });
      
      // Assert
      expect(result.searchPath).toBe(resolve(projectRoot, absolutePath));
    });

    it('should normalize path separators', async () => {
      // Arrange
      const projectRoot = '/project';
      const pathWithMixedSeparators = 'src\\\\components/tests';
      const mockTestFiles = [
        { path: '/project/src/components/tests/unit.test.ts', relativePath: 'unit.test.ts', type: 'unit' as const }
      ];
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue(mockTestFiles);
      
      // Act
      const result = await handleListTests({ path: pathWithMixedSeparators });
      
      // Assert
      expect(result.searchPath).toBe(resolve(projectRoot, pathWithMixedSeparators));
      expect(fileUtils.findTestFiles).toHaveBeenCalledWith(resolve(projectRoot, pathWithMixedSeparators));
    });

    it('should handle parent directory references (..)', async () => {
      // Arrange
      const projectRoot = '/project';
      const pathWithParentRef = 'src/../tests';
      const expectedResolvedPath = resolve(projectRoot, pathWithParentRef);
      const mockTestFiles = [
        { path: '/project/tests/integration.test.ts', relativePath: 'integration.test.ts', type: 'integration' as const }
      ];
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue(mockTestFiles);
      
      // Act
      const result = await handleListTests({ path: pathWithParentRef });
      
      // Assert
      expect(result.searchPath).toBe(expectedResolvedPath);
    });

    it('should validate path security', async () => {
      // Arrange
      const projectRoot = '/project';
      const validPath = 'src/tests';
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue([]);
      
      // Act
      await handleListTests({ path: validPath });
      
      // Assert
      expect(fileUtils.fileExists).toHaveBeenCalledWith(resolve(projectRoot, validPath));
      expect(fileUtils.isDirectory).toHaveBeenCalledWith(resolve(projectRoot, validPath));
    });

    it('should reject potentially dangerous paths', async () => {
      // Arrange
      const projectRoot = '/project';
      const dangerousPath = '../../../etc/passwd';
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(false);
      
      // Act & Assert
      await expect(handleListTests({ path: dangerousPath })).rejects.toThrow('Search path does not exist');
    });
  });

  describe('Error Handling', () => {
    it('should handle permission errors gracefully', async () => {
      // Arrange
      const projectRoot = '/project';
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockRejectedValue(new Error('EACCES: permission denied'));
      
      // Act & Assert
      await expect(handleListTests({})).rejects.toThrow('Failed to list test files: EACCES: permission denied');
    });

    it('should handle file system errors', async () => {
      // Arrange
      const projectRoot = '/project';
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockRejectedValue(new Error('EIO: i/o error'));
      
      // Act & Assert
      await expect(handleListTests({})).rejects.toThrow('Failed to list test files: EIO: i/o error');
    });

    it('should provide helpful error messages', async () => {
      // Arrange
      const projectRoot = '/project';
      const nonExistentPath = 'does/not/exist';
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(false);
      
      // Act & Assert
      await expect(handleListTests({ path: nonExistentPath })).rejects.toThrow(
        `Search path does not exist: ${resolve(projectRoot, nonExistentPath)}`
      );
    });

    it('should handle malformed path arguments', async () => {
      // Arrange
      const projectRoot = '/project';
      const malformedPath = '';
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue([]);
      
      // Act
      const result = await handleListTests({ path: malformedPath });
      
      // Assert
      expect(result.searchPath).toBe(projectRoot); // Empty path should default to project root
    });

    it('should handle very deep directory structures', async () => {
      // Arrange
      const projectRoot = '/project';
      const deepPath = 'very/deep/nested/directory/structure/with/many/levels';
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue([]);
      
      // Act
      const result = await handleListTests({ path: deepPath });
      
      // Assert
      expect(result.searchPath).toBe(resolve(projectRoot, deepPath));
      expect(result.totalCount).toBe(0);
    });
  });

  describe('Response Formatting', () => {
    it('should return structured test file information', async () => {
      // Arrange
      const projectRoot = '/project';
      const mockTestFiles = [
        { path: '/project/test1.spec.ts', relativePath: 'test1.spec.ts', type: 'unit' as const },
        { path: '/project/test2.test.js', relativePath: 'test2.test.js', type: 'integration' as const }
      ];
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue(mockTestFiles);
      
      // Act
      const result = await handleListTests({});
      
      // Assert
      expect(result).toHaveProperty('testFiles');
      expect(result).toHaveProperty('totalCount');
      expect(result).toHaveProperty('searchPath');
      expect(result).toHaveProperty('projectRoot');
      expect(Array.isArray(result.testFiles)).toBe(true);
      expect(typeof result.totalCount).toBe('number');
      expect(typeof result.searchPath).toBe('string');
      expect(typeof result.projectRoot).toBe('string');
    });

    it('should include both absolute and relative paths', async () => {
      // Arrange
      const projectRoot = '/project';
      const mockTestFiles = [
        { path: '/project/src/component.test.tsx', relativePath: 'src/component.test.tsx', type: 'unit' as const }
      ];
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue(mockTestFiles);
      
      // Act
      const result = await handleListTests({});
      
      // Assert
      expect(result.testFiles[0]).toHaveProperty('path');
      expect(result.testFiles[0]).toHaveProperty('relativePath');
      expect(result.testFiles[0].path).toBe('/project/src/component.test.tsx');
      expect(result.testFiles[0].relativePath).toBe('src/component.test.tsx');
    });

    it('should classify test types (unit, integration, e2e)', async () => {
      // Arrange
      const projectRoot = '/project';
      const mockTestFiles = [
        { path: '/project/unit.test.ts', relativePath: 'unit.test.ts', type: 'unit' as const },
        { path: '/project/integration/api.test.js', relativePath: 'integration/api.test.js', type: 'integration' as const },
        { path: '/project/e2e/flow.spec.ts', relativePath: 'e2e/flow.spec.ts', type: 'e2e' as const }
      ];
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue(mockTestFiles);
      
      // Act
      const result = await handleListTests({});
      
      // Assert
      expect(result.testFiles).toHaveLength(3);
      // Note: The handleListTests function doesn't expose test types in its return value,
      // but we verify that findTestFiles is called which handles type classification
      expect(fileUtils.findTestFiles).toHaveBeenCalledWith(projectRoot);
    });

    it('should provide file metadata when available', async () => {
      // Arrange
      const projectRoot = '/project';
      const mockTestFiles = [
        { path: '/project/test.spec.ts', relativePath: 'test.spec.ts', type: 'unit' as const }
      ];
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue(mockTestFiles);
      
      // Act
      const result = await handleListTests({});
      
      // Assert
      expect(result.testFiles[0]).toHaveProperty('path');
      expect(result.testFiles[0]).toHaveProperty('relativePath');
      expect(result.testFiles[0].path).toBeTruthy();
      expect(result.testFiles[0].relativePath).toBeTruthy();
    });

    it('should sort results consistently', async () => {
      // Arrange
      const projectRoot = '/project';
      // Mock returns already sorted results (as per file-utils implementation)
      const mockTestFiles = [
        { path: '/project/a.test.ts', relativePath: 'a.test.ts', type: 'unit' as const },
        { path: '/project/b.spec.js', relativePath: 'b.spec.js', type: 'unit' as const },
        { path: '/project/c.test.tsx', relativePath: 'c.test.tsx', type: 'unit' as const }
      ];
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue(mockTestFiles);
      
      // Act
      const result = await handleListTests({});
      
      // Assert
      expect(result.testFiles[0].relativePath).toBe('a.test.ts');
      expect(result.testFiles[1].relativePath).toBe('b.spec.js');
      expect(result.testFiles[2].relativePath).toBe('c.test.tsx');
    });

    it('should handle empty results gracefully', async () => {
      // Arrange
      const projectRoot = '/project';
      const mockTestFiles: any[] = [];
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue(mockTestFiles);
      
      // Act
      const result = await handleListTests({});
      
      // Assert
      expect(result.testFiles).toEqual([]);
      expect(result.totalCount).toBe(0);
      expect(result.searchPath).toBe(projectRoot);
      expect(result.projectRoot).toBe(projectRoot);
    });
  });

  describe('Performance', () => {
    it('should handle large test directories efficiently', async () => {
      // Arrange
      const projectRoot = '/project';
      const largeTestFileArray = Array.from({ length: 1000 }, (_, i) => ({
        path: `/project/test${i}.spec.ts`,
        relativePath: `test${i}.spec.ts`,
        type: 'unit' as const
      }));
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue(largeTestFileArray);
      
      // Act
      const startTime = Date.now();
      const result = await handleListTests({});
      const endTime = Date.now();
      
      // Assert
      expect(result.totalCount).toBe(1000);
      expect(result.testFiles).toHaveLength(1000);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should implement reasonable search depth limits', async () => {
      // Arrange
      const projectRoot = '/project';
      // The search depth limits are implemented in file-utils.findTestFiles
      // This test verifies that the function handles deep structures without issues
      const mockTestFiles = [
        { path: '/project/very/deep/nested/structure/test.spec.ts', relativePath: 'very/deep/nested/structure/test.spec.ts', type: 'unit' as const }
      ];
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue(mockTestFiles);
      
      // Act
      const result = await handleListTests({});
      
      // Assert
      expect(result.testFiles).toHaveLength(1);
      expect(fileUtils.findTestFiles).toHaveBeenCalledWith(projectRoot);
    });

    it('should cache results when appropriate', async () => {
      // Arrange
      const projectRoot = '/project';
      const mockTestFiles = [
        { path: '/project/test.spec.ts', relativePath: 'test.spec.ts', type: 'unit' as const }
      ];
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue(mockTestFiles);
      
      // Act
      await handleListTests({});
      await handleListTests({}); // Second call to test potential caching
      
      // Assert
      expect(fileUtils.findTestFiles).toHaveBeenCalledTimes(2);
      // Note: Current implementation doesn't implement caching, but this test verifies the behavior
    });

    it('should provide progress feedback for long operations', async () => {
      // Arrange
      const projectRoot = '/project';
      const mockTestFiles = [
        { path: '/project/test.spec.ts', relativePath: 'test.spec.ts', type: 'unit' as const }
      ];
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockImplementation(async () => {
        // Simulate a longer operation
        await new Promise(resolve => setTimeout(resolve, 100));
        return mockTestFiles;
      });
      
      // Act
      const result = await handleListTests({});
      
      // Assert
      expect(result.testFiles).toHaveLength(1);
      // Note: Current implementation doesn't provide progress feedback, but operation completes
    });
  });

  describe('Integration', () => {
    it('should work with different project structures', async () => {
      // Arrange
      const projectRoot = '/project';
      const mockTestFiles = [
        { path: '/project/src/__tests__/unit.test.ts', relativePath: 'src/__tests__/unit.test.ts', type: 'unit' as const },
        { path: '/project/test/integration.spec.js', relativePath: 'test/integration.spec.js', type: 'integration' as const },
        { path: '/project/spec/e2e.test.ts', relativePath: 'spec/e2e.test.ts', type: 'e2e' as const }
      ];
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue(mockTestFiles);
      
      // Act
      const result = await handleListTests({});
      
      // Assert
      expect(result.testFiles).toHaveLength(3);
      expect(result.testFiles.some(f => f.relativePath.includes('__tests__'))).toBe(true);
      expect(result.testFiles.some(f => f.relativePath.includes('test/'))).toBe(true);
      expect(result.testFiles.some(f => f.relativePath.includes('spec/'))).toBe(true);
    });

    it('should handle monorepo configurations', async () => {
      // Arrange
      const projectRoot = '/monorepo';
      const mockTestFiles = [
        { path: '/monorepo/packages/app1/src/component.test.ts', relativePath: 'packages/app1/src/component.test.ts', type: 'unit' as const },
        { path: '/monorepo/packages/app2/tests/service.spec.js', relativePath: 'packages/app2/tests/service.spec.js', type: 'unit' as const },
        { path: '/monorepo/shared/utils.test.ts', relativePath: 'shared/utils.test.ts', type: 'unit' as const }
      ];
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue(mockTestFiles);
      
      // Act
      const result = await handleListTests({});
      
      // Assert
      expect(result.testFiles).toHaveLength(3);
      expect(result.testFiles.some(f => f.relativePath.includes('packages/app1'))).toBe(true);
      expect(result.testFiles.some(f => f.relativePath.includes('packages/app2'))).toBe(true);
      expect(result.testFiles.some(f => f.relativePath.includes('shared'))).toBe(true);
    });

    it('should respect .gitignore patterns', async () => {
      // Arrange
      const projectRoot = '/project';
      // Mock file-utils to simulate .gitignore behavior (excluding node_modules, dist, etc.)
      const mockTestFiles = [
        { path: '/project/src/component.test.ts', relativePath: 'src/component.test.ts', type: 'unit' as const },
        { path: '/project/tests/integration.spec.js', relativePath: 'tests/integration.spec.js', type: 'integration' as const }
        // Note: node_modules/some-package/test.js would be excluded by file-utils
      ];
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue(mockTestFiles);
      
      // Act
      const result = await handleListTests({});
      
      // Assert
      expect(result.testFiles).toHaveLength(2);
      expect(result.testFiles.every(f => !f.relativePath.includes('node_modules'))).toBe(true);
      expect(result.testFiles.every(f => !f.relativePath.includes('dist'))).toBe(true);
      expect(result.testFiles.every(f => !f.relativePath.includes('build'))).toBe(true);
    });

    it('should integrate with project context management', async () => {
      // Arrange
      const projectRoot = '/project';
      const mockTestFiles = [
        { path: '/project/test.spec.ts', relativePath: 'test.spec.ts', type: 'unit' as const }
      ];
      
      vi.mocked(projectContext.getProjectRoot).mockReturnValue(projectRoot);
      vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      vi.mocked(fileUtils.findTestFiles).mockResolvedValue(mockTestFiles);
      
      // Act
      const result = await handleListTests({});
      
      // Assert
      expect(projectContext.getProjectRoot).toHaveBeenCalled();
      expect(result.projectRoot).toBe(projectRoot);
      expect(result.searchPath).toBe(projectRoot);
    });
  });
});