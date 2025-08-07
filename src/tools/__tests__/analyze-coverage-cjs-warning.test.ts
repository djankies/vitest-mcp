import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleAnalyzeCoverage } from '../analyze-coverage.js';
import { projectContext } from '../../context/project-context.js';
import * as fileUtils from '../../utils/file-utils.js';
import * as configLoader from '../../config/config-loader.js';
import * as versionChecker from '../../utils/version-checker.js';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

// Mock external dependencies
vi.mock('child_process');
vi.mock('../../utils/file-utils.js');
vi.mock('../../config/config-loader.js');
vi.mock('../../utils/version-checker.js');
vi.mock('../../context/project-context.js');
vi.mock('fs/promises');

describe('analyze-coverage (CJS warning handling)', () => {
  let mockChildProcess: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mocks
    vi.mocked(projectContext.getProjectRoot).mockReturnValue('/test/project');
    vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
    vi.mocked(fileUtils.isDirectory).mockResolvedValue(false);
    vi.mocked(configLoader.getConfig).mockResolvedValue({
      coverageDefaults: {
        format: 'summary' as const,
        threshold: 80
      },
      testDefaults: {
        timeout: 30000,
        format: 'summary' as const
      }
    } as any);
    vi.mocked(versionChecker.checkAllVersions).mockResolvedValue({
      errors: [],
      warnings: [],
      coverageProvider: { version: '1.0.0' }
    } as any);
    
    // Create mock child process
    mockChildProcess = new EventEmitter() as any;
    mockChildProcess.stdout = new EventEmitter();
    mockChildProcess.stderr = new EventEmitter();
    mockChildProcess.kill = vi.fn();
    mockChildProcess.killed = false;
    
    vi.mocked(spawn).mockReturnValue(mockChildProcess);
  });

  it('should filter out Vite CJS deprecation warning from stderr', async () => {
    // Arrange
    const args = {
      target: './src/utils.ts',
      format: 'summary' as const
    };

    // Act - Start the coverage analysis
    const coveragePromise = handleAnalyzeCoverage(args);
    
    // Simulate command output with CJS warning in stderr but valid coverage data
    setTimeout(() => {
      // Emit the CJS deprecation warning in stderr
      mockChildProcess.stderr.emit('data', Buffer.from(
        '\x1b[33mThe CJS build of Vite\'s Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.\x1b[39m\n'
      ));
      
      // Emit valid coverage data in stdout
      mockChildProcess.stdout.emit('data', Buffer.from(JSON.stringify({
        coverageMap: {
          '/test/project/src/utils.ts': {
            path: '/test/project/src/utils.ts',
            statementMap: {},
            fnMap: {},
            branchMap: {},
            s: { '0': 1 },
            f: { '0': 1 },
            b: {}
          }
        }
      })));
      
      mockChildProcess.emit('close', 0);
    }, 10);

    const result = await coveragePromise;

    // Assert - The result should be successful despite the warning
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.coverage).toBeDefined();
  });

  it('should handle real errors along with CJS warning', async () => {
    // Arrange
    const args = {
      target: './src/utils.ts',
      format: 'summary' as const
    };

    // Act - Start the coverage analysis
    const coveragePromise = handleAnalyzeCoverage(args);
    
    // Simulate command output with CJS warning AND a real error
    setTimeout(() => {
      // Emit the CJS warning followed by a real error
      mockChildProcess.stderr.emit('data', Buffer.from(
        '\x1b[33mThe CJS build of Vite\'s Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.\x1b[39m\n' +
        'Error: Coverage provider not found\n'
      ));
      
      // No stdout data
      mockChildProcess.stdout.emit('data', Buffer.from(''));
      
      mockChildProcess.emit('close', 1);
    }, 10);

    const result = await coveragePromise;

    // Assert - The real error should be preserved
    expect(result.success).toBe(false);
    expect(result.error).toContain('Coverage provider not found');
    expect(result.error).not.toContain('CJS build');
  });

  it('should set VITE_CJS_IGNORE_WARNING environment variable', async () => {
    // Arrange
    const args = {
      target: './src/utils.ts'
    };

    // Act - Start the coverage analysis
    const coveragePromise = handleAnalyzeCoverage(args);
    
    // Simulate successful execution
    setTimeout(() => {
      mockChildProcess.stdout.emit('data', Buffer.from('{}'));
      mockChildProcess.emit('close', 0);
    }, 10);

    await coveragePromise;

    // Assert - Check that spawn was called with the environment variable
    expect(spawn).toHaveBeenCalled();
    const spawnCall = vi.mocked(spawn).mock.calls[0];
    const [, , options] = spawnCall;
    
    expect(options?.env?.VITE_CJS_IGNORE_WARNING).toBe('true');
  });
});