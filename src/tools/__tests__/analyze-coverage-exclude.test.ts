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
        '**/.storybook/**',
        '**/storybook-static/**',
        '**/e2e/**',
        '**/*.e2e.*',
        '**/test-utils/**',
        '**/mocks/**',
        '**/__mocks__/**',
        '**/setup-tests.*',
        '**/test-setup.*'
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
    
    // Verify that default exclude patterns are included for BOTH test execution and coverage
    // Test execution excludes (these come early in the command)
    expect(command).toContain('--exclude');
    expect(command).toContain('**/*.stories.*');
    expect(command).toContain('**/*.story.*');
    expect(command).toContain('**/.storybook/**');
    // Coverage excludes
    expect(command).toContain('--coverage.exclude');
    
    // Verify the exclude patterns appear in pairs (flag, pattern)
    const excludeIndices = command.map((item, idx) => item === '--exclude' ? idx : -1).filter(idx => idx !== -1);
    expect(excludeIndices.length).toBeGreaterThan(0);
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
    
    // Verify that custom exclude patterns are used for BOTH test execution and coverage
    expect(command).toContain('--exclude');
    expect(command).toContain('**/*.custom.*');
    expect(command).toContain('**/special/**');
    expect(command).toContain('--coverage.exclude');
    
    // Should not contain default patterns when custom ones are provided
    expect(command).not.toContain('**/*.stories.*');
  });
});