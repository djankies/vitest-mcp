import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  TIMEOUT_EXIT_CODE,
  consoleReporterPath,
  createRunDirectory,
  findInstalledPackage,
  findVitest,
  runVitest,
} from '../vitest-runner.js';
import ConsoleCaptureReporter from '../../reporters/console-reporter.js';

/**
 * Write a fake vitest package whose bin echoes its argv and env as JSON,
 * then behaves according to the FAKE_VITEST_MODE env var.
 */
function installFakeVitest(nodeModules: string, version = '4.1.0') {
  const dir = join(nodeModules, 'vitest');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'vitest', version, bin: { vitest: './vitest.mjs' } }));
  writeFileSync(
    join(dir, 'vitest.mjs'),
    `
const mode = process.env.FAKE_VITEST_MODE;
process.stdout.write(JSON.stringify({ argv: process.argv.slice(2), ci: process.env.CI, extra: process.env.EXTRA }));
process.stderr.write('err-output');
if (mode === 'hang') setInterval(() => {}, 1000);
else process.exit(mode === 'fail' ? 3 : 0);
`
  );
  return dir;
}

describe('vitest-runner', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'vitest-runner-test-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  describe('findInstalledPackage / findVitest', () => {
    it('finds vitest in the project itself', async () => {
      const dir = installFakeVitest(join(root, 'node_modules'));
      const vitest = await findVitest(root);
      expect(vitest).toEqual({ name: 'vitest', version: '4.1.0', dir, binPath: join(dir, 'vitest.mjs') });
    });

    it('walks up to a hoisted monorepo install', async () => {
      installFakeVitest(join(root, 'node_modules'), '5.0.1');
      const pkg = join(root, 'packages', 'app');
      mkdirSync(pkg, { recursive: true });
      await expect(findVitest(pkg)).resolves.toMatchObject({ version: '5.0.1' });
    });

    it('prefers the closest install', async () => {
      installFakeVitest(join(root, 'node_modules'), '3.2.0');
      const pkg = join(root, 'packages', 'app');
      installFakeVitest(join(pkg, 'node_modules'), '5.0.0');
      await expect(findInstalledPackage(pkg, 'vitest')).resolves.toMatchObject({ version: '5.0.0' });
    });

    it('returns null when vitest is not installed', async () => {
      await expect(findVitest(root)).resolves.toBeNull();
    });
  });

  describe('runVitest', () => {
    it('passes arguments verbatim without a shell', async () => {
      installFakeVitest(join(root, 'node_modules'));
      const vitest = await findVitest(root);
      const marker = join(root, 'pwned');
      const args = ['run', 'src/a b.test.ts', `--project=x; touch ${marker}`, '$(whoami)', '`id`'];

      const result = await runVitest(vitest!, { cwd: root, args, timeoutMs: 10_000, env: { EXTRA: 'yes' } });

      expect(result.exitCode).toBe(0);
      expect(result.timedOut).toBe(false);
      expect(JSON.parse(result.stdout)).toEqual({ argv: args, ci: 'true', extra: 'yes' });
      expect(result.stderr).toBe('err-output');
      expect(existsSync(marker)).toBe(false);
    });

    it('reports the exit code of a failing run', async () => {
      installFakeVitest(join(root, 'node_modules'));
      const vitest = await findVitest(root);
      const result = await runVitest(vitest!, {
        cwd: root,
        args: [],
        timeoutMs: 10_000,
        env: { FAKE_VITEST_MODE: 'fail' },
      });
      expect(result.exitCode).toBe(3);
    });

    it('stops a run that exceeds the timeout and never reports success', async () => {
      installFakeVitest(join(root, 'node_modules'));
      const vitest = await findVitest(root);
      const result = await runVitest(vitest!, {
        cwd: root,
        args: [],
        timeoutMs: 300,
        env: { FAKE_VITEST_MODE: 'hang' },
      });
      expect(result.timedOut).toBe(true);
      expect(result.exitCode).toBe(TIMEOUT_EXIT_CODE);
      expect(result.stderr).toContain('timeout');
    });

    it('reports a missing binary as a failure', async () => {
      const result = await runVitest(
        { name: 'vitest', version: '4.0.0', dir: root, binPath: join(root, 'missing.mjs') },
        { cwd: root, args: [], timeoutMs: 10_000 }
      );
      expect(result.exitCode).not.toBe(0);
    });
  });

  describe('createRunDirectory', () => {
    it('creates a private directory and removes it on cleanup', async () => {
      const run = await createRunDirectory();
      writeFileSync(join(run.dir, 'report.json'), '{}');
      await run.cleanup();
      expect(existsSync(run.dir)).toBe(false);
    });
  });

  describe('console reporter', () => {
    it('points at the reporter module', () => {
      expect(consoleReporterPath()).toMatch(/reporters[/\\]console-reporter\.js$/);
    });

    it('writes console output as JSON lines', () => {
      const logFile = join(root, 'console.jsonl');
      process.env.VITEST_MCP_LOG_FILE = logFile;
      try {
        const reporter = new ConsoleCaptureReporter();
        reporter.onUserConsoleLog({ type: 'stdout', content: 'hello\n' });
        reporter.onUserConsoleLog({ type: 'stderr', content: 'oops' });
      } finally {
        delete process.env.VITEST_MCP_LOG_FILE;
      }
      expect(readFileSync(logFile, 'utf-8').trim().split('\n').map((l) => JSON.parse(l))).toEqual([
        { type: 'stdout', message: 'hello' },
        { type: 'stderr', message: 'oops' },
      ]);
    });
  });
});
