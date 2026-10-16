import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { checkAllVersions, generateVersionReport, meetsMinimumVersion, parseVersion } from '../version-checker.js';

function install(root: string, name: string, version: string) {
  const dir = join(root, 'node_modules', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version }));
}

describe('version-checker', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'version-checker-test-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('parses versions with prefixes and prerelease tags', () => {
    expect(parseVersion('v5.0.0-beta.3')).toEqual({ version: '5.0.0', major: 5, minor: 0, patch: 0 });
    expect(meetsMinimumVersion('3.2.4', '0.34.0')).toBe(true);
    expect(meetsMinimumVersion('0.33.9', '0.34.0')).toBe(false);
  });

  it.each(['3.2.4', '4.1.0', '5.0.5'])('accepts supported Vitest %s with a matching provider', async (version) => {
    install(root, 'vitest', version);
    install(root, '@vitest/coverage-v8', version);

    const result = await checkAllVersions(root);

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.vitest.isSupported).toBe(true);
    expect(result.coverageProvider).toMatchObject({ provider: '@vitest/coverage-v8', matchesVitest: true });
  });

  it('errors when vitest is not installed', async () => {
    const result = await checkAllVersions(root);
    expect(result.errors[0]).toContain('Vitest not found');
  });

  it('errors below the minimum version', async () => {
    install(root, 'vitest', '0.30.0');
    const result = await checkAllVersions(root);
    expect(result.errors[0]).toContain('below minimum');
  });

  it('warns for majors outside the tested range', async () => {
    install(root, 'vitest', '2.1.0');
    install(root, '@vitest/coverage-v8', '2.1.0');
    const result = await checkAllVersions(root);
    expect(result.errors).toEqual([]);
    expect(result.warnings[0]).toContain('has not been tested');
  });

  it('warns when the coverage provider major does not match vitest', async () => {
    install(root, 'vitest', '4.1.0');
    install(root, '@vitest/coverage-v8', '3.2.4');
    const result = await checkAllVersions(root);
    expect(result.coverageProvider.matchesVitest).toBe(false);
    expect(result.warnings[0]).toContain('@vitest/coverage-v8@4');
  });

  it('detects the istanbul provider', async () => {
    install(root, 'vitest', '5.0.0');
    install(root, '@vitest/coverage-istanbul', '5.0.0');
    const result = await checkAllVersions(root);
    expect(result.coverageProvider).toMatchObject({ provider: '@vitest/coverage-istanbul', matchesVitest: true });
  });

  it('finds packages hoisted to a parent directory', async () => {
    install(root, 'vitest', '5.0.0');
    const app = join(root, 'packages', 'app');
    mkdirSync(app, { recursive: true });
    const result = await checkAllVersions(app);
    expect(result.vitest.version?.version).toBe('5.0.0');
  });

  it('produces a readable report', async () => {
    install(root, 'vitest', '4.1.0');
    const report = generateVersionReport(await checkAllVersions(root));
    expect(report).toContain('Vitest: v4.1.0');
    expect(report).toContain('Coverage Provider: Not found');
  });
});
