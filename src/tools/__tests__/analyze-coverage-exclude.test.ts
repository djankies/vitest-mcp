import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleAnalyzeCoverage } from '../analyze-coverage.js';
import { projectContext } from '../../context/project-context.js';

// Mock dependencies
vi.mock('../../context/project-context.js', () => ({
  projectContext: {
    getProjectRoot: vi.fn(),
  }
}));

vi.mock('../../utils/file-utils.js', () => ({
  fileExists: vi.fn().mockResolvedValue(true),
  isDirectory: vi.fn().mockResolvedValue(false),
}));

vi.mock('../../config/config-loader.js', () => ({
  getConfig: vi.fn().mockResolvedValue({
    testDefaults: {
      format: 'summary',
      timeout: 30000,
      watchMode: false,
    },
    coverageDefaults: {
      threshold: 80,
      format: 'summary',
      includeDetails: false,
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
      exclude: [
        '**/*.stories.*',
        '**/*.story.*',
        '**/e2e/**',
        '**/*.e2e.*',
        '**/test-utils/**',
        '**/mocks/**',
        '**/__mocks__/**'
      ],
    },
    discovery: {
      testPatterns: ['**/*.{test,spec}.{js,ts,jsx,tsx}'],
      excludePatterns: ['node_modules', 'dist', 'coverage', '.git'],
      maxDepth: 10,
    },
    server: {
      verbose: false,
      validatePaths: true,
      allowRootExecution: false,
      workingDirectory: process.cwd(),
    },
    safety: {
      maxFiles: 100,
      requireConfirmation: true,
      allowedRunners: ['vitest'],
      allowedPaths: undefined,
    },
  }),
}));

vi.mock('../../utils/version-checker.js', () => ({
  checkAllVersions: vi.fn().mockResolvedValue({
    errors: [],
    vitest: { version: '3.0.0' },
    coverageProvider: { version: '3.0.0' },
  }),
  generateVersionReport: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

describe('analyze-coverage exclude patterns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(projectContext.getProjectRoot).mockReturnValue('/test/project');
  });

  it('should use default exclude patterns from config', async () => {
    const spawn = vi.mocked(await import('child_process').then(m => m.spawn));
    const mockProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn((event, cb) => {
        if (event === 'close') {
          setTimeout(() => cb(0), 0);
        }
      }),
      kill: vi.fn(),
    };
    spawn.mockReturnValue(mockProcess as any);

    await handleAnalyzeCoverage({
      target: './src/api',
    });

    // Check that spawn was called with exclude patterns
    expect(spawn).toHaveBeenCalled();
    const command = spawn.mock.calls[0][1] as string[];
    
    // Verify that default exclude patterns are included
    expect(command).toContain('--coverage.exclude=**/*.stories.*');
    expect(command).toContain('--coverage.exclude=**/*.story.*');
    expect(command).toContain('--coverage.exclude=**/e2e/**');
  });

  it('should allow custom exclude patterns to override defaults', async () => {
    const spawn = vi.mocked(await import('child_process').then(m => m.spawn));
    const mockProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn((event, cb) => {
        if (event === 'close') {
          setTimeout(() => cb(0), 0);
        }
      }),
      kill: vi.fn(),
    };
    spawn.mockReturnValue(mockProcess as any);

    await handleAnalyzeCoverage({
      target: './src/api',
      exclude: ['**/*.custom.*', '**/special/**'],
    });

    // Check that spawn was called with custom exclude patterns
    expect(spawn).toHaveBeenCalled();
    const command = spawn.mock.calls[0][1] as string[];
    
    // Verify that custom exclude patterns are used instead of defaults
    expect(command).toContain('--coverage.exclude=**/*.custom.*');
    expect(command).toContain('--coverage.exclude=**/special/**');
    // Should not contain default patterns when custom ones are provided
    expect(command).not.toContain('--coverage.exclude=**/*.stories.*');
  });
});