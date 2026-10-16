import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFile } from 'fs/promises';
import { runTestsTool, handleRunTests, createExecutionContext } from '../run-tests.js';
import { projectContext } from '../../context/project-context.js';
import * as fileUtils from '../../utils/file-utils.js';
import * as configLoader from '../../config/config-loader.js';
import * as versionChecker from '../../utils/version-checker.js';
import * as configFinder from '../../utils/config-finder.js';
import * as runner from '../../utils/vitest-runner.js';

vi.mock('fs/promises');
vi.mock('../../context/project-context.js');
vi.mock('../../utils/file-utils.js');
vi.mock('../../config/config-loader.js');
vi.mock('../../utils/version-checker.js');
vi.mock('../../utils/config-finder.js');
vi.mock('../../utils/vitest-runner.js');

const PROJECT_ROOT = '/test/project';
const RUN_DIR = '/tmp/vitest-mcp-run';
const VITEST = { name: 'vitest', version: '4.1.0', dir: '/test/project/node_modules/vitest', binPath: '/test/project/node_modules/vitest/vitest.mjs' };

const passingReport = JSON.stringify({
  success: true,
  numTotalTestSuites: 1,
  numPassedTestSuites: 1,
  numFailedTestSuites: 0,
  numTotalTests: 2,
  numPassedTests: 2,
  numFailedTests: 0,
  numPendingTests: 0,
  testResults: [{ name: '/test/project/src/a.test.ts', status: 'passed', assertionResults: [] }],
});

function mockFiles(files: Record<string, string>) {
  vi.mocked(readFile).mockImplementation(async (path) => {
    const content = files[String(path)];
    if (content === undefined) {
      throw Object.assign(new Error(`ENOENT: ${String(path)}`), { code: 'ENOENT' });
    }
    return content as never;
  });
}

function lastRunArgs(): string[] {
  const call = vi.mocked(runner.runVitest).mock.calls.at(-1);
  expect(call).toBeDefined();
  return call![1].args;
}

describe('run_tests', () => {
  const cleanup = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(projectContext.getProjectRoot).mockReturnValue(PROJECT_ROOT);
    vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
    vi.mocked(fileUtils.isDirectory).mockResolvedValue(false);
    vi.mocked(configLoader.getConfig).mockResolvedValue({
      testDefaults: { format: 'summary', timeout: 30000 },
    } as never);
    vi.mocked(versionChecker.checkAllVersions).mockResolvedValue({ errors: [], warnings: [] } as never);
    vi.mocked(configFinder.findMcpVitestConfig).mockResolvedValue(null);

    vi.mocked(runner.findVitest).mockResolvedValue(VITEST);
    vi.mocked(runner.createRunDirectory).mockResolvedValue({ dir: RUN_DIR, cleanup });
    vi.mocked(runner.consoleReporterPath).mockReturnValue('/pkg/dist/reporters/console-reporter.js');
    vi.mocked(runner.runVitest).mockResolvedValue({ stdout: '', stderr: '', exitCode: 0, timedOut: false });

    mockFiles({ [`${RUN_DIR}/report.json`]: passingReport });
  });

  describe('tool definition', () => {
    it('declares the expected schema', () => {
      const { properties, required } = runTestsTool.inputSchema as {
        properties: Record<string, { description: string; enum?: string[] }>;
        required: string[];
      };
      expect(runTestsTool.name).toBe('run_tests');
      expect(required).toEqual(['target']);
      expect(Object.keys(properties)).toEqual(['target', 'format', 'project', 'showLogs']);
      expect(properties.format.enum).toEqual(['summary', 'detailed']);
      expect(properties.project.description).toContain('projects');
    });
  });

  describe('command construction', () => {
    it('runs the project\'s own vitest with the JSON report written to a temp file', async () => {
      const result = await handleRunTests({ target: './src/a.test.ts' });

      expect(runner.runVitest).toHaveBeenCalledWith(
        VITEST,
        expect.objectContaining({ cwd: PROJECT_ROOT, timeoutMs: 30000 })
      );
      expect(lastRunArgs()).toEqual([
        'run',
        'src/a.test.ts',
        '--reporter=json',
        `--outputFile.json=${RUN_DIR}/report.json`,
      ]);
      expect(result.success).toBe(true);
      expect(result.testSummary).toMatchObject({ totalTests: 2, passed: 2, failed: 0 });
      expect(result.command).toBe('npx vitest run src/a.test.ts');
    });

    it('passes the project as a single --project=<name> argument', async () => {
      await handleRunTests({ target: './src', project: 'client' });
      expect(lastRunArgs()).toContain('--project=client');
    });

    it('keeps shell metacharacters literal in project names', async () => {
      await handleRunTests({ target: './src', project: 'web; rm -rf /' });
      expect(lastRunArgs()).toContain('--project=web; rm -rf /');
    });

    it('rejects project names that look like flags', async () => {
      const result = await handleRunTests({ target: './src', project: '--config=evil.ts' });
      expect(result.success).toBe(false);
      expect(runner.runVitest).not.toHaveBeenCalled();
    });

    it('uses vitest.mcp.config.* when present', async () => {
      vi.mocked(configFinder.findMcpVitestConfig).mockResolvedValue(`${PROJECT_ROOT}/vitest.mcp.config.ts`);
      await handleRunTests({ target: './src' });
      expect(lastRunArgs()).toContain(`--config=${PROJECT_ROOT}/vitest.mcp.config.ts`);
    });

    it('adds the console reporter and log file when showLogs is set', async () => {
      mockFiles({
        [`${RUN_DIR}/report.json`]: passingReport,
        [`${RUN_DIR}/console.jsonl`]: '{"type":"stdout","message":"hello"}\n{"type":"stderr","message":"oops"}\nnot json\n',
      });

      const result = await handleRunTests({ target: './src/a.test.ts', showLogs: true });

      expect(lastRunArgs()).toContain('--reporter=/pkg/dist/reporters/console-reporter.js');
      expect(vi.mocked(runner.runVitest).mock.calls[0][1].env).toEqual({
        VITEST_MCP_LOG_FILE: `${RUN_DIR}/console.jsonl`,
      });
      expect(result.logs).toEqual(['[stdout] hello', '[stderr] oops']);
    });

    it('does not add logs when nothing was captured', async () => {
      const result = await handleRunTests({ target: './src/a.test.ts', showLogs: true });
      expect(result.logs).toBeUndefined();
    });
  });

  describe('validation', () => {
    it.each([
      [{ target: '' }, 'Target parameter is required'],
      [{ target: '.' }, 'entire project root'],
      [{ target: '../other-project' }, 'inside the project root'],
    ])('rejects %j', async (args, message) => {
      const result = await handleRunTests(args);
      expect(result.success).toBe(false);
      expect(result.error).toContain(message);
      expect(runner.runVitest).not.toHaveBeenCalled();
    });

    it('rejects targets that do not exist', async () => {
      vi.mocked(fileUtils.fileExists).mockResolvedValue(false);
      const result = await handleRunTests({ target: './missing.test.ts' });
      expect(result.error).toContain('Target does not exist');
    });

    it('asks for set_project_root first', async () => {
      vi.mocked(projectContext.getProjectRoot).mockImplementation(() => {
        throw new Error('not set');
      });
      const result = await handleRunTests({ target: './src' });
      expect(result.error).toContain('set_project_root');
    });

    it('reports version problems without running vitest', async () => {
      vi.mocked(versionChecker.checkAllVersions).mockResolvedValue({ errors: ['Vitest not found'], warnings: [] } as never);
      vi.mocked(versionChecker.generateVersionReport).mockReturnValue('Vitest not found');
      const result = await handleRunTests({ target: './src' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Vitest not found');
      expect(runner.runVitest).not.toHaveBeenCalled();
    });
  });

  describe('results', () => {
    it('surfaces vitest errors when no report was written', async () => {
      mockFiles({});
      vi.mocked(runner.runVitest).mockResolvedValue({
        stdout: '',
        stderr: 'Error: No projects matched the filter "nope".',
        exitCode: 1,
        timedOut: false,
      });

      const result = await handleRunTests({ target: './src', project: 'nope' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No projects matched');
      expect(result.summary).toContain('No projects matched');
    });

    it('treats a timeout as a failure', async () => {
      mockFiles({});
      vi.mocked(runner.runVitest).mockResolvedValue({
        stdout: '',
        stderr: 'Vitest was stopped after exceeding the 30s timeout.',
        exitCode: 124,
        timedOut: true,
      });

      const result = await handleRunTests({ target: './src' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });

    it('cleans up the run directory even when vitest fails to start', async () => {
      vi.mocked(runner.runVitest).mockRejectedValue(new Error('spawn failed'));
      const result = await handleRunTests({ target: './src' });
      expect(result.success).toBe(false);
      expect(cleanup).toHaveBeenCalled();
    });

    it('uses the detailed format for directories', async () => {
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      const result = await handleRunTests({ target: './src' });
      expect(result.format).toBe('detailed');
    });

    it('respects an explicit format', async () => {
      vi.mocked(fileUtils.isDirectory).mockResolvedValue(true);
      const result = await handleRunTests({ target: './src', format: 'summary' });
      expect(result.format).toBe('summary');
    });
  });

  describe('createExecutionContext', () => {
    it('describes files and directories', async () => {
      vi.mocked(fileUtils.isDirectory).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      await expect(createExecutionContext('/a.test.ts')).resolves.toMatchObject({ isMultiFile: false, targetType: 'file' });
      await expect(createExecutionContext('/src')).resolves.toMatchObject({ isMultiFile: true, targetType: 'directory' });
    });
  });
});
