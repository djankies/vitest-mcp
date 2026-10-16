import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Dirent } from 'fs';
import { readdir, readFile } from 'fs/promises';
import { analyzeCoverageTool, handleAnalyzeCoverage, transformCoverageData } from '../analyze-coverage.js';
import { projectContext } from '../../context/project-context.js';
import * as fileUtils from '../../utils/file-utils.js';
import * as configLoader from '../../config/config-loader.js';
import * as versionChecker from '../../utils/version-checker.js';
import * as configFinder from '../../utils/config-finder.js';
import * as configReader from '../../utils/vitest-config-reader.js';
import * as runner from '../../utils/vitest-runner.js';

vi.mock('fs/promises');
vi.mock('../../context/project-context.js');
vi.mock('../../utils/file-utils.js');
vi.mock('../../config/config-loader.js');
vi.mock('../../utils/version-checker.js');
vi.mock('../../utils/config-finder.js');
vi.mock('../../utils/vitest-runner.js');
vi.mock('../../utils/vitest-config-reader.js', async (importOriginal) => ({
  ...(await importOriginal<typeof configReader>()),
  getVitestCoverageThresholds: vi.fn(),
}));

const ROOT = '/project';
const RUN_DIR = '/tmp/vitest-mcp-run';
const COVERAGE_FILE = `${RUN_DIR}/coverage/coverage-final.json`;
const VITEST = { name: 'vitest', version: '5.0.0', dir: `${ROOT}/node_modules/vitest`, binPath: `${ROOT}/node_modules/vitest/vitest.mjs` };

/** Istanbul-format entry: one statement per listed line, `hits[i]` executions each */
function fileEntry(path: string, hits: number[], functions: Record<string, number> = {}) {
  const statementMap: Record<string, unknown> = {};
  const s: Record<string, number> = {};
  hits.forEach((count, i) => {
    statementMap[i] = { start: { line: i + 1, column: 0 }, end: { line: i + 1, column: 10 } };
    s[i] = count;
  });
  const fnMap: Record<string, unknown> = {};
  const f: Record<string, number> = {};
  Object.entries(functions).forEach(([name, count], i) => {
    fnMap[i] = { name, decl: { start: { line: i + 1 } }, loc: { start: { line: i + 1 } } };
    f[i] = count;
  });
  return { path, statementMap, fnMap, branchMap: {}, s, f, b: {} };
}

const coverageFinal = {
  [`${ROOT}/src/calc.ts`]: fileEntry(`${ROOT}/src/calc.ts`, [1, 1, 0, 1], { sum: 1, unused: 0 }),
  [`${ROOT}/src/util/format.ts`]: fileEntry(`${ROOT}/src/util/format.ts`, [0, 0], { format: 0 }),
  [`${ROOT}/src/calc.test.ts`]: fileEntry(`${ROOT}/src/calc.test.ts`, [1]),
  [`${ROOT}/srcextra/other.ts`]: fileEntry(`${ROOT}/srcextra/other.ts`, [1]),
};

function dirent(name: string, isDir: boolean): Dirent {
  return { name, isDirectory: () => isDir, isFile: () => !isDir } as Dirent;
}

function mockTree(tree: Record<string, Dirent[]>) {
  vi.mocked(readdir).mockImplementation((async (dir: string) => tree[dir] ?? []) as never);
}

function mockFiles(files: Record<string, unknown>) {
  vi.mocked(readFile).mockImplementation(async (path) => {
    const content = files[String(path)];
    if (content === undefined) throw new Error(`ENOENT: ${String(path)}`);
    return (typeof content === 'string' ? content : JSON.stringify(content)) as never;
  });
}

function lastArgs(): string[] {
  const call = vi.mocked(runner.runVitest).mock.calls.at(-1);
  expect(call).toBeDefined();
  return call![1].args;
}

describe('analyze_coverage', () => {
  const cleanup = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(projectContext.getProjectRoot).mockReturnValue(ROOT);
    vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
    vi.mocked(fileUtils.isDirectory).mockImplementation(async (p: string) => !/\.[a-z]+$/.test(p));
    vi.mocked(configLoader.getConfig).mockResolvedValue({
      testDefaults: { timeout: 30000 },
      coverageDefaults: { format: 'summary' },
    } as never);
    vi.mocked(versionChecker.checkAllVersions).mockResolvedValue({
      errors: [],
      warnings: [],
      coverageProvider: { version: { version: '5.0.0' } },
    } as never);
    vi.mocked(configFinder.findMcpVitestConfig).mockResolvedValue(null);
    vi.mocked(configReader.getVitestCoverageThresholds).mockResolvedValue(null);

    vi.mocked(runner.findVitest).mockResolvedValue(VITEST);
    vi.mocked(runner.createRunDirectory).mockResolvedValue({ dir: RUN_DIR, cleanup });
    vi.mocked(runner.runVitest).mockResolvedValue({ stdout: '', stderr: '', exitCode: 0, timedOut: false });

    mockTree({
      [`${ROOT}/src`]: [
        dirent('calc.ts', false),
        dirent('calc.test.ts', false),
        dirent('types.d.ts', false),
        dirent('README.md', false),
        dirent('util', true),
        dirent('__tests__', true),
        dirent('.hidden', true),
      ],
      [`${ROOT}/src/util`]: [dirent('format.ts', false)],
    });
    mockFiles({
      [`${RUN_DIR}/report.json`]: { numTotalTests: 3 },
      [COVERAGE_FILE]: coverageFinal,
    });
  });

  describe('tool definition', () => {
    it('declares target, format, project and exclude', () => {
      const schema = analyzeCoverageTool.inputSchema as { properties: Record<string, unknown>; required: string[] };
      expect(analyzeCoverageTool.name).toBe('analyze_coverage');
      expect(Object.keys(schema.properties)).toEqual(['target', 'format', 'project', 'exclude']);
      expect(schema.required).toEqual(['target']);
    });
  });

  describe('command construction', () => {
    it('runs related tests for every source file in a directory', async () => {
      await handleAnalyzeCoverage({ target: './src' });

      const args = lastArgs();
      expect(args.slice(0, 4)).toEqual(['related', 'src/calc.ts', 'src/util/format.ts', '--run']);
      expect(args).toContain('--coverage.enabled=true');
      expect(args).toContain('--coverage.include=src/**');
      expect(args).toContain('--coverage.reporter=json');
      expect(args).toContain(`--coverage.reportsDirectory=${RUN_DIR}/coverage`);
      expect(args).toContain(`--outputFile.json=${RUN_DIR}/report.json`);
      expect(args).toContain('--passWithNoTests');
      expect(args.some((a) => a.startsWith('--coverage.exclude'))).toBe(false);
      expect(cleanup).toHaveBeenCalled();
    });

    it('limits coverage to a single file target', async () => {
      await handleAnalyzeCoverage({ target: './src/calc.ts' });
      const args = lastArgs();
      expect(args.slice(0, 3)).toEqual(['related', 'src/calc.ts', '--run']);
      expect(args).toContain('--coverage.include=src/calc.ts');
    });

    it('forwards project, exclude patterns and the MCP config', async () => {
      vi.mocked(configFinder.findMcpVitestConfig).mockResolvedValue(`${ROOT}/vitest.mcp.config.ts`);
      await handleAnalyzeCoverage({ target: './src', project: 'unit', exclude: ['**/generated/**'] });
      const args = lastArgs();
      expect(args).toContain('--project=unit');
      expect(args).toContain('--coverage.exclude=**/generated/**');
      expect(args).toContain(`--config=${ROOT}/vitest.mcp.config.ts`);
    });

    it('falls back to running all tests when the file list is too long for a command line', async () => {
      const many = Array.from({ length: 2000 }, (_, i) => dirent(`module-with-a-long-name-${i}.ts`, false));
      mockTree({ [`${ROOT}/src`]: many });
      await handleAnalyzeCoverage({ target: './src' });
      const args = lastArgs();
      expect(args[0]).toBe('run');
      expect(args).toContain('--coverage.include=src/**');
    });
  });

  describe('validation', () => {
    it.each(['./src/calc.test.ts', './src/__tests__', './test/unit'])('refuses test target %s', async (target) => {
      const result = await handleAnalyzeCoverage({ target });
      expect(result.success).toBe(false);
      expect(result.error).toContain('test file');
      expect(runner.runVitest).not.toHaveBeenCalled();
    });

    it('requires a target', async () => {
      const result = await handleAnalyzeCoverage({ target: '' });
      expect(result.error).toContain('Target parameter is required');
    });

    it('refuses the project root', async () => {
      const result = await handleAnalyzeCoverage({ target: '.' });
      expect(result.error).toContain('entire project root');
    });

    it('requires set_project_root', async () => {
      vi.mocked(projectContext.getProjectRoot).mockImplementation(() => {
        throw new Error('not set');
      });
      const result = await handleAnalyzeCoverage({ target: './src' });
      expect(result.error).toContain('set_project_root');
    });

    it('errors when a directory has no source files', async () => {
      mockTree({ [`${ROOT}/src`]: [dirent('notes.md', false)] });
      const result = await handleAnalyzeCoverage({ target: './src' });
      expect(result.error).toContain('No source files found');
    });
  });

  describe('results', () => {
    it('reports only files inside the target, excluding tests', async () => {
      const result = await handleAnalyzeCoverage({ target: './src', format: 'detailed' });

      expect(result.success).toBe(true);
      expect(result.fileBreakdown?.map((f) => f.path)).toEqual(['src/calc.ts', 'src/util/format.ts']);
      expect(result.testsRun).toBe(3);
      expect(result.uncovered?.['src/calc.ts']).toEqual({
        lines: [3],
        functions: [{ name: 'unused', line: 2 }],
        branches: [],
      });
    });

    it('still reports coverage when vitest exits non-zero because thresholds failed', async () => {
      vi.mocked(runner.runVitest).mockResolvedValue({
        stdout: '',
        stderr: 'ERROR: Coverage for lines (50%) does not meet global threshold (85%)',
        exitCode: 1,
        timedOut: false,
      });
      vi.mocked(configReader.getVitestCoverageThresholds).mockResolvedValue({ lines: 85 });

      const result = await handleAnalyzeCoverage({ target: './src' });

      expect(result.success).toBe(true);
      expect(result.meetsThreshold).toBe(false);
      expect(result.thresholdViolations?.[0]).toContain('Line coverage');
    });

    it('warns when no test imports the target', async () => {
      mockFiles({
        [`${RUN_DIR}/report.json`]: { numTotalTests: 0 },
        [COVERAGE_FILE]: { [`${ROOT}/src/util/format.ts`]: coverageFinal[`${ROOT}/src/util/format.ts`] },
      });
      const result = await handleAnalyzeCoverage({ target: './src/util/format.ts' });
      expect(result.testsRun).toBe(0);
      expect(result.summary).toMatch(/^⚠️ No tests import/);
    });

    it('fails with vitest\'s error output, minus known warnings, when no coverage was written', async () => {
      mockFiles({});
      vi.mocked(runner.runVitest).mockResolvedValue({
        stdout: '',
        stderr: [
          "The CJS build of Vite's Node API is deprecated.",
          'See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.',
          'Error: Failed to load url ./missing',
        ].join('\n'),
        exitCode: 1,
        timedOut: false,
      });

      const result = await handleAnalyzeCoverage({ target: './src' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Coverage analysis failed: Error: Failed to load url ./missing');
    });
  });
});

describe('transformCoverageData', () => {
  it('matches the target by path segment, not substring', () => {
    const data = transformCoverageData(coverageFinal as never, 'src', ROOT);
    expect(Object.keys(data.files)).toEqual([`${ROOT}/src/calc.ts`, `${ROOT}/src/util/format.ts`]);
  });

  it('counts lines separately from statements', () => {
    const entry = fileEntry(`${ROOT}/src/a.ts`, [1, 0]);
    // A second, uncovered statement on line 1 does not make line 1 uncovered
    entry.statementMap['2'] = { start: { line: 1, column: 20 }, end: { line: 1, column: 30 } };
    entry.s['2'] = 0;

    const { summary } = transformCoverageData({ [`${ROOT}/src/a.ts`]: entry } as never, 'src', ROOT);

    expect(summary.statements).toMatchObject({ total: 3, covered: 1 });
    expect(summary.lines).toMatchObject({ total: 2, covered: 1, pct: 50 });
  });
});
