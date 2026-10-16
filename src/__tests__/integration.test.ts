import { describe, it, vi, beforeEach, afterEach, expect } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createStandardToolRegistry } from '../plugins/index.js';
import { projectContext } from '../context/project-context.js';
import { getConfig } from '../config/config-loader.js';
import * as fs from 'fs/promises';
import { findVitest, runVitest, createRunDirectory } from '../utils/vitest-runner.js';
import { fileExists, isDirectory, findTestFiles } from '../utils/file-utils.js';
import { checkAllVersions, generateVersionReport } from '../utils/version-checker.js';

// Mock external dependencies
vi.mock('@modelcontextprotocol/sdk/server/index.js');
vi.mock('@modelcontextprotocol/sdk/server/stdio.js');
vi.mock('../utils/vitest-runner.js');
vi.mock('fs/promises');
vi.mock('../config/config-loader.js');
vi.mock('../utils/file-utils.js', () => ({
  fileExists: vi.fn(),
  isDirectory: vi.fn(),
  findTestFiles: vi.fn()
}));
vi.mock('../utils/version-checker.js', () => ({
  checkAllVersions: vi.fn(),
  generateVersionReport: vi.fn()
}));

const mockVitest = {
  name: 'vitest',
  version: '5.0.0',
  dir: '/test/project/node_modules/vitest',
  binPath: '/test/project/node_modules/vitest/vitest.mjs'
};

/** Make the coverage run produce a report for /test/project/src/file.ts */
function mockCoverageRun() {
  vi.mocked(fs.readdir).mockImplementation((async () => [
    { name: 'file.ts', isDirectory: () => false, isFile: () => true }
  ]) as any);
  vi.mocked(fs.readFile).mockImplementation((async (path: string) => {
    if (String(path).endsWith('coverage-final.json')) {
      return JSON.stringify({
        '/test/project/src/file.ts': {
          path: '/test/project/src/file.ts',
          statementMap: { '0': { start: { line: 1 } } },
          fnMap: { '0': { name: 'test', decl: { start: { line: 1 } } } },
          branchMap: { '0': { loc: { start: { line: 1 } } } },
          s: { '0': 1 },
          f: { '0': 1 },
          b: { '0': [1, 0] }
        }
      });
    }
    return JSON.stringify({ name: 'test-project' });
  }) as any);
}

// Integration tests for complete workflows
describe('Integration Tests', () => {
  let toolRegistry: any;
  let mockServer: any;
  let mockTransport: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset project context
    projectContext.reset();
    
    // Setup comprehensive fileExists mock that works for all tests
    vi.mocked(fileExists).mockImplementation(async (path: string) => {
      // Allow common project paths
      return path.includes('/test/') || 
             path.includes('package.json') ||
             path.includes('vitest.config') ||
             path.includes('.test.') ||
             path.includes('.spec.') ||
             path.includes('__tests__') ||
             path.includes('/src/') ||
             path.includes('/packages/') ||
             path.endsWith('/test/project') ||
             path.endsWith('/test/typescript-project') ||
             path.endsWith('/test/custom-config-project') ||
             path.endsWith('/test/monorepo') ||
             path.endsWith('/test/complex-structure');
    });
    
    // Setup comprehensive isDirectory mock
    vi.mocked(isDirectory).mockImplementation(async (path: string) => {
      return path.includes('/test/') && 
             !path.includes('.test.') && 
             !path.includes('.spec.') &&
             !path.includes('.ts') &&
             !path.includes('.js');
    });
    
    // Setup mock server
    mockServer = {
      onerror: null,
      onclose: null,
      setRequestHandler: vi.fn(),
      connect: vi.fn().mockResolvedValue(undefined)
    };
    vi.mocked(Server).mockImplementation(function () { return mockServer; } as never);
    
    // Setup mock transport
    mockTransport = {};
    vi.mocked(StdioServerTransport).mockImplementation(function () { return mockTransport; } as never);
    
    // Setup mock config
    vi.mocked(getConfig).mockResolvedValue({
      testDefaults: {
        format: 'summary' as const,
        timeout: 30000,
        watchMode: false
      },
      coverageDefaults: {
        format: 'summary',
        exclude: []
      },
      discovery: {
        testPatterns: ['**/*.{test,spec}.{js,ts,jsx,tsx}'],
        excludePatterns: ['node_modules', 'dist'],
        maxDepth: 10
      },
      server: {
        verbose: false,
        validatePaths: true,
        allowRootExecution: false,
        workingDirectory: process.cwd()
      }
    });
    
    // Setup version checker mocks
    vi.mocked(checkAllVersions).mockResolvedValue({
      errors: [],
      warnings: [],
      info: [],
      node: { version: '18.0.0', compatible: true },
      vitest: { version: '1.0.0', compatible: true },
      vitestMcp: { version: '0.3.0', compatible: true },
      coverageProvider: { version: '1.0.0', compatible: true }
    });
    vi.mocked(generateVersionReport).mockReturnValue('All versions compatible');
    
    // Vitest itself is replaced; the runner is covered by vitest-runner.test.ts and compat/
    vi.mocked(findVitest).mockResolvedValue(mockVitest);
    vi.mocked(createRunDirectory).mockResolvedValue({ dir: '/tmp/vitest-mcp-run', cleanup: vi.fn().mockResolvedValue(undefined) });
    vi.mocked(runVitest).mockResolvedValue({ stdout: '', stderr: '', exitCode: 0, timedOut: false });

    // Create tool registry
    toolRegistry = createStandardToolRegistry({ debug: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    projectContext.reset();
  });

  describe('Core Tool Workflows', () => {
    it('should execute set_project_root → list_tests workflow', async () => {
      // Arrange
      const mockProjectPath = '/test/project';
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        return path === mockProjectPath || path.includes('package.json');
      });
      vi.mocked(isDirectory).mockImplementation(async (path: string) => {
        return path === mockProjectPath;
      });
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ name: 'test-project' }));
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'test1.test.ts', isFile: () => true, isDirectory: () => false },
        { name: 'test2.spec.js', isFile: () => true, isDirectory: () => false }
      ] as any);
      vi.mocked(findTestFiles).mockResolvedValue([
        { path: `${mockProjectPath}/tests/test1.test.ts`, relativePath: 'tests/test1.test.ts', type: 'unit' },
        { path: `${mockProjectPath}/tests/test2.spec.js`, relativePath: 'tests/test2.spec.js', type: 'unit' }
      ] as any);
      
      // Act - Set project root
      const setRootResult = await toolRegistry.execute('set_project_root', { path: mockProjectPath });
      expect(setRootResult.content[0].text).toContain('success');
      
      // Act - List tests
      const listResult = await toolRegistry.execute('list_tests', { directory: './tests' });
      
      // Assert
      expect(listResult.content[0].text).toContain('testFiles');
      expect(projectContext.hasProjectRoot()).toBe(true);
    });

    it('should execute set_project_root → run_tests workflow', async () => {
      // Arrange
      const mockProjectPath = '/test/project';
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ name: 'test-project' }));

      // Act - Set project root
      await toolRegistry.execute('set_project_root', { path: mockProjectPath });

      // Act - Run tests
      const runResult = await toolRegistry.execute('run_tests', { target: './tests/test1.test.ts' });

      // Assert
      expect(runResult.content[0].text).toContain('success');
      expect(runResult.content[0].text).toContain('npx vitest run');
      expect(runVitest).toHaveBeenCalledWith(
        mockVitest,
        expect.objectContaining({ cwd: mockProjectPath, args: expect.arrayContaining(['run', 'tests/test1.test.ts']) })
      );
    });
    it('should execute set_project_root → analyze_coverage workflow', async () => {
      // Arrange
      const mockProjectPath = '/test/project';
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        return path === mockProjectPath || path.includes('package.json') || path.includes('/src');
      });
      vi.mocked(isDirectory).mockImplementation(async (path: string) => {
        return path === mockProjectPath || path.endsWith('/src');
      });
      mockCoverageRun();

      // Act - Set project root
      await toolRegistry.execute('set_project_root', { path: mockProjectPath });

      // Act - Analyze coverage
      const coverageResult = await toolRegistry.execute('analyze_coverage', { target: './src' });

      // Assert
      const parsed = JSON.parse(coverageResult.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.coverage.lines).toBe(100);
      expect(runVitest).toHaveBeenCalledWith(
        mockVitest,
        expect.objectContaining({ args: expect.arrayContaining(['related', 'src/file.ts', '--run']) })
      );
    });
    it('should maintain project context across tool executions', async () => {
      // Arrange
      const mockProjectPath = '/test/project';
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        return path === mockProjectPath || path.includes('package.json');
      });
      vi.mocked(isDirectory).mockImplementation(async (path: string) => {
        return path === mockProjectPath;
      });
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ name: 'test-project' }));
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'test1.test.ts', isFile: () => true, isDirectory: () => false }
      ] as any);
      vi.mocked(findTestFiles).mockResolvedValue([
        { path: `${mockProjectPath}/tests/test1.test.ts`, relativePath: 'tests/test1.test.ts', type: 'unit' }
      ] as any);
      
      // Act
      await toolRegistry.execute('set_project_root', { path: mockProjectPath });
      const projectInfo1 = projectContext.getProjectInfo();
      
      await toolRegistry.execute('list_tests', { directory: './tests' });
      const projectInfo2 = projectContext.getProjectInfo();
      
      // Assert
      expect(projectInfo1).toEqual(projectInfo2);
      expect(projectInfo1?.path).toBe(mockProjectPath);
    });

    it('should coordinate between run_tests and analyze_coverage', async () => {
      // Arrange
      const mockProjectPath = '/test/project';
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        return path === mockProjectPath || path.includes('package.json') || path.includes('/src') || path.includes('/tests/');
      });
      vi.mocked(isDirectory).mockImplementation(async (path: string) => {
        return path === mockProjectPath || path.endsWith('/src');
      });
      mockCoverageRun();

      // Act
      await toolRegistry.execute('set_project_root', { path: mockProjectPath });
      await toolRegistry.execute('run_tests', { target: './tests/test1.test.ts' });
      await toolRegistry.execute('analyze_coverage', { target: './src' });

      // Assert - Both tools should use the same project context
      expect(runVitest).toHaveBeenCalledTimes(2);
      for (const call of vi.mocked(runVitest).mock.calls) {
        expect(call[1].cwd).toBe(mockProjectPath);
      }
      expect(projectContext.hasProjectRoot()).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should propagate errors through workflow chain', async () => {
      // Arrange
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(isDirectory).mockResolvedValue(false);
      
      // Act & Assert - Setting invalid project root should fail
      const setRootResult = await toolRegistry.execute('set_project_root', { path: '/invalid/path' });
      expect(setRootResult.content[0].text).toContain('Failed');
      
      // Act & Assert - Subsequent tools should fail without project root
      try {
        await toolRegistry.execute('list_tests', { directory: './tests' });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should recover from tool failures gracefully', async () => {
      // Arrange
      const mockProjectPath = '/test/project';
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        return path === mockProjectPath || path.includes('package.json') || path.includes('/src') || path.includes('/tests/');
      });
      vi.mocked(isDirectory).mockImplementation(async (path: string) => {
        return path === mockProjectPath || path.endsWith('/src');
      });
      mockCoverageRun();
      vi.mocked(runVitest).mockResolvedValueOnce({ stdout: '', stderr: 'Test failed', exitCode: 1, timedOut: false });

      // Act
      await toolRegistry.execute('set_project_root', { path: mockProjectPath });

      const runResult = await toolRegistry.execute('run_tests', { target: './tests/test1.test.ts' });
      // First call fails (exit code 1)
      expect(JSON.parse(runResult.content[0].text).success).toBe(false);

      const coverageResult = await toolRegistry.execute('analyze_coverage', { target: './src' });
      expect(JSON.parse(coverageResult.content[0].text).success).toBe(true);

      // Assert
      expect(runVitest).toHaveBeenCalledTimes(2);
    });
    it('should provide meaningful error context in workflows', async () => {
      // Arrange
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(isDirectory).mockResolvedValue(false);
      
      // Act
      const result = await toolRegistry.execute('set_project_root', { path: '/nonexistent' });
      
      // Assert
      const responseText = result.content[0].text;
      expect(responseText).toContain('Failed');
      expect(responseText).toContain('does not exist');
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle TypeScript project with vitest tests', async () => {
      // Arrange
      const mockProjectPath = '/test/typescript-project';
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        return path === mockProjectPath || path.includes('package.json') || path.includes('vitest.config.ts');
      });
      vi.mocked(isDirectory).mockImplementation(async (path: string) => {
        return path === mockProjectPath;
      });
      vi.mocked(fs.readFile).mockImplementation(async (filePath: any) => {
        if (filePath.includes('package.json')) {
          return JSON.stringify({ 
            name: 'typescript-project',
            devDependencies: { vitest: '^1.0.0', typescript: '^5.0.0' }
          });
        }
        if (filePath.includes('vitest.config.ts')) {
          return 'export default { test: { globals: true } }';
        }
        return '';
      });
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'component.test.ts', isFile: () => true, isDirectory: () => false },
        { name: 'utils.spec.ts', isFile: () => true, isDirectory: () => false }
      ] as any);
      vi.mocked(findTestFiles).mockResolvedValue([
        { path: `${mockProjectPath}/src/component.test.ts`, relativePath: 'src/component.test.ts', type: 'unit' },
        { path: `${mockProjectPath}/src/utils.spec.ts`, relativePath: 'src/utils.spec.ts', type: 'unit' }
      ] as any);
      
      // Act
      const setRootResult = await toolRegistry.execute('set_project_root', { path: mockProjectPath });
      const listResult = await toolRegistry.execute('list_tests', { directory: './src' });
      
      // Assert
      expect(setRootResult.content[0].text).toContain('success');
      expect(listResult.content[0].text).toContain('testFiles');
    });

    it('should handle project with custom vitest configuration', async () => {
      // Arrange
      const mockProjectPath = '/test/custom-config-project';
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        return path === mockProjectPath || path.includes('package.json') || path.includes('vitest.config.js');
      });
      vi.mocked(isDirectory).mockImplementation(async (path: string) => {
        return path === mockProjectPath;
      });
      vi.mocked(fs.readFile).mockImplementation(async (filePath: any) => {
        if (filePath.includes('package.json')) {
          return JSON.stringify({ name: 'custom-config-project' });
        }
        if (filePath.includes('vitest.config.js')) {
          return 'export default { test: { environment: "jsdom" } }';
        }
        return '';
      });
      
      // Act
      const result = await toolRegistry.execute('set_project_root', { path: mockProjectPath });
      
      // Assert
      expect(result.content[0].text).toContain('success');
      expect(projectContext.getProjectRoot()).toBe(mockProjectPath);
    });

    it('should handle monorepo with multiple packages', async () => {
      // Arrange
      const mockProjectPath = '/test/monorepo';
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        return path === mockProjectPath || path.includes('package.json');
      });
      vi.mocked(isDirectory).mockImplementation(async (path: string) => {
        return path === mockProjectPath || path.includes('packages');
      });
      vi.mocked(fs.readFile).mockImplementation(async (filePath: any) => {
        if (filePath.includes('package.json')) {
          return JSON.stringify({ 
            name: 'monorepo',
            workspaces: ['packages/*']
          });
        }
        return '';
      });
      vi.mocked(fs.readdir).mockImplementation(async (dirPath: any) => {
        if (dirPath.includes('packages')) {
          return [
            { name: 'package-a', isFile: () => false, isDirectory: () => true },
            { name: 'package-b', isFile: () => false, isDirectory: () => true }
          ] as any;
        }
        return [
          { name: 'app.test.ts', isFile: () => true, isDirectory: () => false },
          { name: 'utils.spec.ts', isFile: () => true, isDirectory: () => false }
        ] as any;
      });
      vi.mocked(findTestFiles).mockResolvedValue([
        { path: `${mockProjectPath}/packages/package-a/app.test.ts`, relativePath: 'packages/package-a/app.test.ts', type: 'unit' },
        { path: `${mockProjectPath}/packages/package-a/utils.spec.ts`, relativePath: 'packages/package-a/utils.spec.ts', type: 'unit' }
      ] as any);
      
      // Act
      await toolRegistry.execute('set_project_root', { path: mockProjectPath });
      const listResult = await toolRegistry.execute('list_tests', { directory: './packages/package-a' });
      
      // Assert
      expect(listResult.content[0].text).toContain('testFiles');
    });

    it('should work with complex test directory structures', async () => {
      // Arrange
      const mockProjectPath = '/test/complex-structure';
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        return path === mockProjectPath || path.includes('package.json');
      });
      vi.mocked(isDirectory).mockImplementation(async (path: string) => {
        return path === mockProjectPath || path.includes('__tests__') || path.includes('unit');
      });
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ name: 'complex-structure' }));
      
      vi.mocked(fs.readdir).mockImplementation(async (dirPath: any) => {
        if (dirPath.includes('__tests__')) {
          return [
            { name: 'unit', isFile: () => false, isDirectory: () => true },
            { name: 'integration', isFile: () => false, isDirectory: () => true },
            { name: 'e2e', isFile: () => false, isDirectory: () => true }
          ] as any;
        }
        if (dirPath.includes('unit')) {
          return [
            { name: 'component.test.ts', isFile: () => true, isDirectory: () => false },
            { name: 'utils.test.ts', isFile: () => true, isDirectory: () => false }
          ] as any;
        }
        return [
          { name: '__tests__', isFile: () => false, isDirectory: () => true },
          { name: 'src', isFile: () => false, isDirectory: () => true }
        ] as any;
      });
      vi.mocked(findTestFiles).mockResolvedValue([
        { path: `${mockProjectPath}/__tests__/unit/component.test.ts`, relativePath: '__tests__/unit/component.test.ts', type: 'unit' },
        { path: `${mockProjectPath}/__tests__/unit/utils.test.ts`, relativePath: '__tests__/unit/utils.test.ts', type: 'unit' }
      ] as any);
      
      // Act
      await toolRegistry.execute('set_project_root', { path: mockProjectPath });
      const listResult = await toolRegistry.execute('list_tests', { directory: './__tests__/unit' });
      
      // Assert
      expect(listResult.content[0].text).toContain('testFiles');
    });
  });

  describe('MCP Protocol', () => {
    it('should handle MCP requests correctly end-to-end', async () => {
      // Arrange
      const mockRequest = {
        params: {
          name: 'set_project_root',
          arguments: { path: '/test/project' }
        }
      };
      
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ name: 'test-project' }));
      
      // Act
      const result = await toolRegistry.execute(mockRequest.params.name, mockRequest.params.arguments);
      
      // Assert
      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
    });

    it('should format responses according to MCP specification', async () => {
      // Arrange
      const tools = toolRegistry.getTools();
      
      // Act & Assert
      for (const tool of tools) {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
        expect(tool.inputSchema).toHaveProperty('type', 'object');
        expect(tool.inputSchema).toHaveProperty('properties');
      }
    });

    it('should handle MCP error scenarios properly', async () => {
      // Arrange - Test invalid tool name (should return error response, not throw)
      const invalidToolResult = await toolRegistry.execute('invalid_tool_name', {});
      
      // Assert - Should return error response for unknown tool
      expect(invalidToolResult.content[0].text).toContain('Unknown tool');
      expect(invalidToolResult.content[0].text).toContain('invalid_tool_name');
      
      // Arrange - Invalid arguments
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(isDirectory).mockResolvedValue(false);
      
      // Act
      const result = await toolRegistry.execute('set_project_root', { path: '/invalid' });
      
      // Assert
      expect(result.content[0].text).toContain('Failed');
    });
  });

  describe('Configuration Integration', () => {
    it('should load and apply configuration across all tools', async () => {
      // Arrange
      const mockProjectPath = '/test/project';
      const customConfig = {
        testDefaults: { format: 'detailed' as const, timeout: 60000, watchMode: false },
        coverageDefaults: { 
          format: 'detailed',
          exclude: []
        },
        discovery: { testPatterns: ['**/*.test.*'], excludePatterns: ['node_modules'], maxDepth: 5 },
        server: { verbose: true, validatePaths: true, allowRootExecution: false, workingDirectory: process.cwd() }
      };
      vi.mocked(getConfig).mockResolvedValue(customConfig);
      
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        return path === mockProjectPath || path.includes('package.json');
      });
      vi.mocked(isDirectory).mockImplementation(async (path: string) => {
        return path === mockProjectPath;
      });
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ name: 'test-project' }));
      
      // Act - Create registry and execute a tool to trigger config loading
      const newRegistry = createStandardToolRegistry({ debug: true });
      const tools = newRegistry.getTools();
      await newRegistry.execute('set_project_root', { path: mockProjectPath });
      
      // Assert
      expect(tools).toHaveLength(4); // set_project_root, list_tests, run_tests, analyze_coverage
      expect(vi.mocked(getConfig)).toHaveBeenCalled();
    });

    it('should handle configuration changes during workflows', async () => {
      // Arrange
      const mockProjectPath = '/test/project';
      const initialConfig = {
        testDefaults: { format: 'summary' as const, timeout: 30000, watchMode: false },
        coverageDefaults: { format: 'summary', exclude: [] },
        discovery: { testPatterns: ['**/*.{test,spec}.*'], excludePatterns: ['node_modules'], maxDepth: 10 },
        server: { verbose: false, validatePaths: true, allowRootExecution: false, workingDirectory: process.cwd() }
      };
      
      const updatedConfig = {
        ...initialConfig,
        testDefaults: { ...initialConfig.testDefaults, format: 'detailed' as const }
      };
      
      vi.mocked(getConfig)
        .mockResolvedValueOnce(initialConfig)
        .mockResolvedValueOnce(updatedConfig);
      
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        return path === mockProjectPath || path.includes('package.json');
      });
      vi.mocked(isDirectory).mockImplementation(async (path: string) => {
        return path === mockProjectPath;
      });
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ name: 'test-project' }));
      
      // Act - Create registries and execute tools to trigger config loading
      const registry1 = createStandardToolRegistry();
      const registry2 = createStandardToolRegistry();
      
      await registry1.execute('set_project_root', { path: mockProjectPath });
      await registry2.execute('set_project_root', { path: mockProjectPath });
      
      // Assert
      expect(registry1).toBeDefined();
      expect(registry2).toBeDefined();
      expect(vi.mocked(getConfig)).toHaveBeenCalledTimes(2);
    });
  });
});