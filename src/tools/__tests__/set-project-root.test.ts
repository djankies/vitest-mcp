import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolve } from 'path';

// Import the modules under test
import {
  setProjectRootTool,
  handleSetProjectRoot,
  requireProjectRoot,
  type SetProjectRootArgs
} from '../set-project-root.js';
import { projectContext } from '../../context/project-context.js';
import * as configLoader from '../../config/config-loader.js';
import type { ResolvedVitestMCPConfig } from '../../types/config-types.js';

// Mock dependencies with proper hoisting
const mockFileExists = vi.hoisted(() => vi.fn());
const mockIsDirectory = vi.hoisted(() => vi.fn());
const mockReadFile = vi.hoisted(() => vi.fn());

vi.mock('fs', () => ({
  promises: {
    readFile: mockReadFile,
    access: vi.fn(),
    stat: vi.fn(),
  }
}));

// Mock the dynamic import for fs/promises
vi.doMock('fs/promises', () => ({
  readFile: mockReadFile,
  access: vi.fn(),
  stat: vi.fn(),
}));

vi.mock('../../config/config-loader.js', () => ({
  getConfig: vi.fn()
}));

vi.mock('../../utils/file-utils.js', () => ({
  fileExists: mockFileExists,
  isDirectory: mockIsDirectory
}));

describe('set-project-root', () => {
  const mockConfig: ResolvedVitestMCPConfig = {
    testDefaults: {
      format: 'summary',
      timeout: 30000,
      watchMode: false
    },
    coverageDefaults: {
      threshold: 80,
      format: 'summary',
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80
      },
      thresholdsExplicitlySet: false,
      exclude: []
    },
    discovery: {
      testPatterns: ['**/*.{test,spec}.{js,ts,jsx,tsx}'],
      excludePatterns: ['node_modules', 'dist', 'coverage', '.git'],
      maxDepth: 10
    },
    server: {
      verbose: false,
      validatePaths: true,
      allowRootExecution: false,
      workingDirectory: process.cwd()
    },
    safety: {
      maxFiles: 100,
      requireConfirmation: true,
      allowedRunners: ['vitest'],
      allowedPaths: undefined as any
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    projectContext.reset();
    
    // Setup default mocks
    vi.mocked(configLoader.getConfig).mockResolvedValue(mockConfig);
    
    // Mock file existence - by default, return true for directories and package.json
    mockFileExists.mockImplementation(async (path: string) => {
      // Always return true for package.json to satisfy project validation
      if (path.endsWith('package.json')) return true;
      // Return true for directories by default
      return true;
    });
    
    mockIsDirectory.mockResolvedValue(true);
    mockReadFile.mockResolvedValue(JSON.stringify({ name: 'test-project' }));
    
    // Reset environment variables
    delete process.env.VITEST_MCP_DEV_MODE;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Tool Definition', () => {
    it('should have correct name and description', () => {
      // Arrange & Act & Assert
      expect(setProjectRootTool.name).toBe('set_project_root');
      expect(setProjectRootTool.description).toContain('Set the project root directory');
      expect(setProjectRootTool.description).toContain('must be called before using other tools');
    });

    it('should define proper input schema', () => {
      // Arrange & Act & Assert
      expect(setProjectRootTool.inputSchema).toEqual({
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute path to the project root directory (must start with / on Unix or drive letter on Windows)'
          }
        },
        required: ['path']
      });
    });

    it('should require path parameter', () => {
      // Arrange & Act & Assert
      expect(setProjectRootTool.inputSchema.required).toContain('path');
    });

    it('should validate path parameter type', () => {
      // Arrange & Act & Assert
      expect(setProjectRootTool.inputSchema.properties.path.type).toBe('string');
    });
  });

  describe('Path Validation', () => {
    it('should accept absolute paths', async () => {
      // Arrange
      const absolutePath = '/absolute/project/path';
      const args: SetProjectRootArgs = { path: absolutePath };

      // Act
      const result = await handleSetProjectRoot(args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.projectRoot).toBe(absolutePath);
      expect(result.message).toContain('Project root set to');
    });

    it('should accept relative paths and resolve them', async () => {
      // Arrange
      const relativePath = './relative/path';
      const resolvedPath = resolve(relativePath);
      const args: SetProjectRootArgs = { path: relativePath };

      // Act
      const result = await handleSetProjectRoot(args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.projectRoot).toBe(resolvedPath);
    });

    it('should validate path exists', async () => {
      // Arrange
      const nonExistentPath = '/non/existent/path';
      const args: SetProjectRootArgs = { path: nonExistentPath };
      mockFileExists.mockResolvedValue(false);

      // Act
      const result = await handleSetProjectRoot(args);

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toContain('Directory does not exist');
    });

    it('should validate path is a directory', async () => {
      // Arrange
      const filePath = '/path/to/file.txt';
      const args: SetProjectRootArgs = { path: filePath };
      // Keep the file existing but mock it as not a directory
      mockFileExists.mockImplementation(async (path: string) => {
        if (path === filePath) return true;
        if (path.endsWith('package.json')) return true;
        return true;
      });
      mockIsDirectory.mockResolvedValue(false);

      // Act
      const result = await handleSetProjectRoot(args);

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toContain('Path is not a directory');
    });

    it('should reject dangerous paths', async () => {
      // Arrange
      const configWithRestrictions = {
        ...mockConfig,
        safety: {
          ...mockConfig.safety,
          allowedPaths: ['/safe/path']
        }
      };
      vi.mocked(configLoader.getConfig).mockResolvedValue(configWithRestrictions);
      const dangerousPath = '/dangerous/path';
      const args: SetProjectRootArgs = { path: dangerousPath };

      // Act
      const result = await handleSetProjectRoot(args);

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toContain('Access denied');
      expect(result.message).toContain('outside allowed directories');
    });

    it('should handle path traversal attempts', async () => {
      // Arrange
      const configWithRestrictions = {
        ...mockConfig,
        safety: {
          ...mockConfig.safety,
          allowedPaths: ['/safe/path']
        }
      };
      vi.mocked(configLoader.getConfig).mockResolvedValue(configWithRestrictions);
      const traversalPath = '/safe/path/../../../etc';
      const args: SetProjectRootArgs = { path: traversalPath };

      // Act
      const result = await handleSetProjectRoot(args);

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toContain('Access denied');
    });
  });

  describe('Project Context Management', () => {
    it('should set project root in context', async () => {
      // Arrange
      const projectPath = '/test/project';
      const args: SetProjectRootArgs = { path: projectPath };

      // Act
      const result = await handleSetProjectRoot(args);

      // Assert
      expect(result.success).toBe(true);
      expect(projectContext.hasProjectRoot()).toBe(true);
      expect(projectContext.getProjectRoot()).toBe(projectPath);
    });

    it('should replace previous project root', async () => {
      // Arrange
      const firstPath = '/first/project';
      const secondPath = '/second/project';
      
      await handleSetProjectRoot({ path: firstPath });
      expect(projectContext.getProjectRoot()).toBe(firstPath);

      // Act
      const result = await handleSetProjectRoot({ path: secondPath });

      // Assert
      expect(result.success).toBe(true);
      expect(projectContext.getProjectRoot()).toBe(secondPath);
    });

    it('should clear previous context state', async () => {
      // Arrange
      const firstPath = '/first/project';
      const secondPath = '/second/project';
      
      await handleSetProjectRoot({ path: firstPath });
      expect(projectContext.hasProjectRoot()).toBe(true);

      // Act
      await handleSetProjectRoot({ path: secondPath });

      // Assert
      expect(projectContext.getProjectRoot()).toBe(secondPath);
      expect(projectContext.getProjectInfo()?.path).toBe(secondPath);
    });

    it('should validate new project root', async () => {
      // Arrange
      const invalidPath = '/invalid/path';
      const args: SetProjectRootArgs = { path: invalidPath };
      // Make the directory not exist
      mockFileExists.mockImplementation(async (path: string) => {
        if (path === invalidPath) return false;
        // Don't return true for package.json if the directory doesn't exist
        return false;
      });
      mockIsDirectory.mockResolvedValue(false);

      // Act
      const result = await handleSetProjectRoot(args);

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toContain('Directory does not exist');
    });

    it('should persist context across tool calls', async () => {
      // Arrange
      const projectPath = '/test/project';
      await handleSetProjectRoot({ path: projectPath });

      // Act
      const retrievedPath = requireProjectRoot();

      // Assert
      expect(retrievedPath).toBe(projectPath);
    });
  });

  describe('Self-Protection', () => {
    it('should prevent setting root to vitest-mcp directory', async () => {
      // Arrange
      const vitestMcpPath = '/path/to/vitest-mcp';
      const args: SetProjectRootArgs = { path: vitestMcpPath };
      
      // Make sure the path exists and is a directory
      mockFileExists.mockImplementation(async (path: string) => {
        if (path === vitestMcpPath) return true;
        if (path.endsWith('package.json')) return true;
        return true;
      });
      mockIsDirectory.mockResolvedValue(true);
      
      mockReadFile.mockResolvedValue(JSON.stringify({
        name: '@djankies/vitest-mcp'
      }));

      // Act
      const result = await handleSetProjectRoot(args);

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toContain('Cannot set project root to the Vitest MCP package itself');
    });

    it('should allow self-targeting in development mode', async () => {
      // Arrange
      process.env.VITEST_MCP_DEV_MODE = 'true';
      const vitestMcpPath = '/path/to/vitest-mcp';
      const args: SetProjectRootArgs = { path: vitestMcpPath };
      
      // Make sure the path exists and is a directory
      mockFileExists.mockImplementation(async (path: string) => {
        if (path === vitestMcpPath) return true;
        if (path.endsWith('package.json')) return true;
        return true;
      });
      mockIsDirectory.mockResolvedValue(true);
      
      mockReadFile.mockResolvedValue(JSON.stringify({
        name: '@djankies/vitest-mcp'
      }));

      // Act
      const result = await handleSetProjectRoot(args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.message).toContain('Development mode enabled');
    });

    it('should check development mode environment variable', async () => {
      // Arrange
      process.env.VITEST_MCP_DEV_MODE = 'true';
      const projectPath = '/test/project';
      const args: SetProjectRootArgs = { path: projectPath };

      // Act
      const result = await handleSetProjectRoot(args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.message).toContain('Development mode enabled - self-targeting allowed');
    });

    it('should provide clear error for self-targeting', async () => {
      // Arrange
      const vitestMcpPath = '/path/to/vitest-mcp';
      const args: SetProjectRootArgs = { path: vitestMcpPath };
      
      // Make sure the path exists and is a directory
      mockFileExists.mockImplementation(async (path: string) => {
        if (path === vitestMcpPath) return true;
        if (path.endsWith('package.json')) return true;
        return true;
      });
      mockIsDirectory.mockResolvedValue(true);
      
      mockReadFile.mockResolvedValue(JSON.stringify({
        name: '@djankies/vitest-mcp'
      }));

      // Act
      const result = await handleSetProjectRoot(args);

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toContain('This tool is meant to test other projects, not itself');
      expect(result.message).toContain('Set VITEST_MCP_DEV_MODE=true to override');
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent directories', async () => {
      // Arrange
      const nonExistentPath = '/does/not/exist';
      const args: SetProjectRootArgs = { path: nonExistentPath };
      mockFileExists.mockResolvedValue(false);

      // Act
      const result = await handleSetProjectRoot(args);

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to set project root');
      expect(result.message).toContain('Directory does not exist');
      expect(result.projectRoot).toBe('');
      expect(result.projectName).toBe('');
    });

    it('should handle permission errors', async () => {
      // Arrange
      const restrictedPath = '/restricted/path';
      const args: SetProjectRootArgs = { path: restrictedPath };
      mockFileExists.mockRejectedValue(new Error('Permission denied'));

      // Act
      const result = await handleSetProjectRoot(args);

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to set project root');
    });

    it('should handle invalid path formats', async () => {
      // Arrange
      const invalidPaths = ['', '   ', null as any, undefined as any];

      for (const invalidPath of invalidPaths) {
        const args: SetProjectRootArgs = { path: invalidPath };

        // Act
        const result = await handleSetProjectRoot(args);

        // Assert
        expect(result.success).toBe(false);
        expect(result.message).toContain('Path parameter is required');
      }
    });

    it('should provide helpful error messages', async () => {
      // Arrange
      const testCases = [
        {
          scenario: 'empty path',
          args: { path: '' },
          expectedMessage: 'Path parameter is required'
        },
        {
          scenario: 'non-existent directory',
          args: { path: '/does/not/exist' },
          setup: () => mockFileExists.mockResolvedValue(false),
          expectedMessage: 'Directory does not exist'
        },
        {
          scenario: 'file instead of directory',
          args: { path: '/path/to/file.txt' },
          setup: () => {
            mockFileExists.mockImplementation(async (path: string) => {
              if (path === '/path/to/file.txt') return true;
              if (path.endsWith('package.json')) return true;
              return true;
            });
            mockIsDirectory.mockResolvedValue(false);
          },
          expectedMessage: 'Path is not a directory'
        }
      ];

      for (const testCase of testCases) {
        // Arrange
        if (testCase.setup) {
          testCase.setup();
        }

        // Act
        const result = await handleSetProjectRoot(testCase.args);

        // Assert
        expect(result.success).toBe(false);
        expect(result.message).toContain(testCase.expectedMessage);
        
        // Reset mocks
        vi.clearAllMocks();
        mockFileExists.mockResolvedValue(true);
        mockIsDirectory.mockResolvedValue(true);
      }
    });

    it('should handle file path (not directory) arguments', async () => {
      // Arrange
      const filePath = '/path/to/file.txt';
      const args: SetProjectRootArgs = { path: filePath };
      
      // Make sure the file exists but is not a directory
      mockFileExists.mockImplementation(async (path: string) => {
        if (path === filePath) return true;
        if (path.endsWith('package.json')) return true;
        return true;
      });
      mockIsDirectory.mockResolvedValue(false);

      // Act
      const result = await handleSetProjectRoot(args);

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toContain('Path is not a directory');
      expect(result.projectRoot).toBe('');
      expect(result.projectName).toBe('');
    });
  });

  describe('Success Response', () => {
    it('should return success confirmation', async () => {
      // Arrange
      const projectPath = '/test/project';
      const args: SetProjectRootArgs = { path: projectPath };

      // Act
      const result = await handleSetProjectRoot(args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.message).toContain('Project root set to');
    });

    it('should include resolved absolute path', async () => {
      // Arrange
      const relativePath = './relative/project';
      const resolvedPath = resolve(relativePath);
      const args: SetProjectRootArgs = { path: relativePath };

      // Act
      const result = await handleSetProjectRoot(args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.projectRoot).toBe(resolvedPath);
      expect(result.message).toContain(resolvedPath);
    });

    it('should include project validation results', async () => {
      // Arrange
      const projectPath = '/test/project';
      const args: SetProjectRootArgs = { path: projectPath };

      // Act
      const result = await handleSetProjectRoot(args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.projectName).toBe('project'); // Extracted from path
      expect(result.projectRoot).toBe(projectPath);
    });

    it('should provide context about next steps', async () => {
      // Arrange
      const projectPath = '/test/project';
      const args: SetProjectRootArgs = { path: projectPath };

      // Act
      const result = await handleSetProjectRoot(args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.message).toContain('Project root set to');
      expect(result.message).toContain(projectPath);
    });
  });

  describe('Integration', () => {
    it('should work with subsequent tool calls', async () => {
      // Arrange
      const projectPath = '/test/project';
      await handleSetProjectRoot({ path: projectPath });

      // Act
      const retrievedPath = requireProjectRoot();

      // Assert
      expect(retrievedPath).toBe(projectPath);
    });

    it('should integrate with file discovery tools', async () => {
      // Arrange
      const projectPath = '/test/project';
      await handleSetProjectRoot({ path: projectPath });

      // Act
      const context = projectContext.getProjectInfo();

      // Assert
      expect(context).not.toBeNull();
      expect(context!.path).toBe(projectPath);
      expect(context!.name).toBe('project');
    });

    it('should integrate with test execution tools', async () => {
      // Arrange
      const projectPath = '/test/project';
      await handleSetProjectRoot({ path: projectPath });

      // Act & Assert
      expect(() => requireProjectRoot()).not.toThrow();
      expect(requireProjectRoot()).toBe(projectPath);
    });

    it('should maintain context isolation between sessions', async () => {
      // Arrange
      const firstPath = '/first/project';
      const secondPath = '/second/project';
      
      // Act - First session
      await handleSetProjectRoot({ path: firstPath });
      expect(projectContext.getProjectRoot()).toBe(firstPath);
      
      // Act - Reset context (simulating new session)
      projectContext.reset();
      expect(() => projectContext.getProjectRoot()).toThrow('Project root has not been set');
      
      // Act - Second session
      await handleSetProjectRoot({ path: secondPath });
      
      // Assert
      expect(projectContext.getProjectRoot()).toBe(secondPath);
    });
  });

  describe('Path Resolution', () => {
    it('should resolve relative paths correctly', async () => {
      // Arrange
      const relativePath = './test/project';
      const expectedAbsolute = resolve(relativePath);
      const args: SetProjectRootArgs = { path: relativePath };

      // Act
      const result = await handleSetProjectRoot(args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.projectRoot).toBe(expectedAbsolute);
    });

    it('should handle home directory expansion', async () => {
      // Arrange
      const homePath = '~/projects/test';
      const args: SetProjectRootArgs = { path: homePath };
      
      // Note: Path.resolve() treats ~ as a literal character, not home expansion
      // The path gets resolved to an absolute path like "/current/dir/~/projects/test"
      // Since it becomes absolute and our mocks say it exists, it should succeed

      // Act
      const result = await handleSetProjectRoot(args);

      // Assert
      // Since resolve() makes it an absolute path and our mocks allow it, it should succeed
      expect(result.success).toBe(true);
      expect(result.projectRoot).toContain('~/projects/test');
    });

    it('should normalize path separators', async () => {
      // Arrange
      const mixedPath = '/test/project//subdir/../project';
      const normalizedPath = resolve(mixedPath);
      const args: SetProjectRootArgs = { path: mixedPath };

      // Act
      const result = await handleSetProjectRoot(args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.projectRoot).toBe(normalizedPath);
    });

    it('should handle symlinks appropriately', async () => {
      // Arrange
      const symlinkPath = '/path/to/symlink';
      const args: SetProjectRootArgs = { path: symlinkPath };
      
      // Mock file system calls to simulate symlink behavior
      mockFileExists.mockResolvedValue(true);
      mockIsDirectory.mockResolvedValue(true);

      // Act
      const result = await handleSetProjectRoot(args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.projectRoot).toBe(symlinkPath);
    });

    it('should validate resolved paths', async () => {
      // Arrange
      const configWithRestrictions = {
        ...mockConfig,
        safety: {
          ...mockConfig.safety,
          allowedPaths: ['/allowed/base']
        }
      };
      vi.mocked(configLoader.getConfig).mockResolvedValue(configWithRestrictions);
      
      const testCases = [
        {
          path: '/allowed/base/project',
          shouldSucceed: true,
          description: 'path within allowed directory'
        },
        {
          path: '/allowed/base/../outside',
          shouldSucceed: false,
          description: 'path that resolves outside allowed directory'
        },
        {
          path: '/allowed/base',
          shouldSucceed: true,
          description: 'exact allowed path'
        }
      ];

      for (const testCase of testCases) {
        // Act
        const result = await handleSetProjectRoot({ path: testCase.path });

        // Assert
        if (testCase.shouldSucceed) {
          expect(result.success).toBe(true);
        } else {
          expect(result.success).toBe(false);
          expect(result.message).toContain('Access denied');
        }
      }
    });
  });
});