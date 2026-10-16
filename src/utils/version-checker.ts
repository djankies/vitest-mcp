/**
 * Version checking utilities for Vitest and related packages
 */

import { findInstalledPackage } from './vitest-runner.js';

export interface VersionInfo {
  version: string;
  major: number;
  minor: number;
  patch: number;
}

export interface VersionRequirements {
  vitest: {
    minimum: string;
    /** Majors covered by the end-to-end compatibility suite (compat/). */
    supportedMajors: number[];
  };
  coverageProviders: string[];
}

/**
 * Version requirements for features we use
 */
export const VERSION_REQUIREMENTS: VersionRequirements = {
  vitest: {
    minimum: '0.34.0',
    supportedMajors: [3, 4, 5],
  },
  coverageProviders: ['@vitest/coverage-v8', '@vitest/coverage-istanbul'],
};

/**
 * Parse a semantic version string into components
 */
export function parseVersion(versionString: string): VersionInfo {
  // Remove 'v' prefix and any pre-release/build metadata
  const cleanVersion = versionString.replace(/^v/, '').split(/[-+]/)[0];
  const [major, minor, patch] = cleanVersion.split('.').map(n => parseInt(n, 10) || 0);

  return {
    version: cleanVersion,
    major,
    minor,
    patch
  };
}

/**
 * Compare two versions: returns -1 if a < b, 0 if equal, 1 if a > b
 */
export function compareVersions(a: VersionInfo, b: VersionInfo): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

/**
 * Check if a version meets the minimum requirement
 */
export function meetsMinimumVersion(current: string, minimum: string): boolean {
  const currentVersion = parseVersion(current);
  const minimumVersion = parseVersion(minimum);
  return compareVersions(currentVersion, minimumVersion) >= 0;
}

/**
 * Get the version of the Vitest installation the project resolves to
 */
export async function getVitestVersion(projectRoot: string): Promise<VersionInfo | null> {
  const installed = await findInstalledPackage(projectRoot, 'vitest');
  return installed ? parseVersion(installed.version) : null;
}

/**
 * Get coverage provider version
 */
export async function getCoverageProviderVersion(projectRoot: string, provider: string = '@vitest/coverage-v8'): Promise<VersionInfo | null> {
  const installed = await findInstalledPackage(projectRoot, provider);
  return installed ? parseVersion(installed.version) : null;
}

/**
 * Find whichever official coverage provider is installed (v8 preferred)
 */
async function findCoverageProvider(projectRoot: string): Promise<{ provider: string; version: VersionInfo | null }> {
  for (const provider of VERSION_REQUIREMENTS.coverageProviders) {
    const version = await getCoverageProviderVersion(projectRoot, provider);
    if (version) {
      return { provider, version };
    }
  }
  return { provider: VERSION_REQUIREMENTS.coverageProviders[0], version: null };
}

/**
 * Comprehensive version check for all dependencies
 */
export async function checkAllVersions(projectRoot: string): Promise<{
  vitest: {
    version: VersionInfo | null;
    meetsMinimum: boolean;
    isSupported: boolean;
  };
  coverageProvider: {
    version: VersionInfo | null;
    matchesVitest: boolean;
    provider: string;
  };
  warnings: string[];
  errors: string[];
}> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const { minimum, supportedMajors } = VERSION_REQUIREMENTS.vitest;

  const vitestVersion = await getVitestVersion(projectRoot);
  const meetsMinimum = vitestVersion ? meetsMinimumVersion(vitestVersion.version, minimum) : false;
  const isSupported = vitestVersion ? supportedMajors.includes(vitestVersion.major) : false;

  if (!vitestVersion) {
    errors.push('Vitest not found. Install it in the project (npm install -D vitest) so the MCP server can use the project\'s own version.');
  } else if (!meetsMinimum) {
    errors.push(`Vitest version ${vitestVersion.version} is below minimum required ${minimum}. Please upgrade.`);
  } else if (!isSupported) {
    warnings.push(`Vitest ${vitestVersion.version} has not been tested with this server (tested majors: ${supportedMajors.join(', ')}). Results may be incomplete.`);
  }

  const coverage = await findCoverageProvider(projectRoot);
  const matchesVitest = !!(coverage.version && vitestVersion && coverage.version.major === vitestVersion.major);

  if (!coverage.version) {
    warnings.push(`Coverage provider not found. Install ${VERSION_REQUIREMENTS.coverageProviders[0]} for coverage analysis.`);
  } else if (vitestVersion && !matchesVitest) {
    warnings.push(`${coverage.provider} ${coverage.version.version} does not match Vitest ${vitestVersion.version}. Install ${coverage.provider}@${vitestVersion.major} or coverage analysis may fail.`);
  }

  return {
    vitest: {
      version: vitestVersion,
      meetsMinimum,
      isSupported,
    },
    coverageProvider: {
      version: coverage.version,
      matchesVitest,
      provider: coverage.provider,
    },
    warnings,
    errors
  };
}

/**
 * Generate user-friendly version report
 */
export function generateVersionReport(versionCheck: Awaited<ReturnType<typeof checkAllVersions>>): string {
  const lines: string[] = [];

  lines.push('=== Vitest MCP Server - Version Compatibility Report ===\n');

  if (versionCheck.vitest.version) {
    lines.push(`✓ Vitest: v${versionCheck.vitest.version.version}`);
    if (versionCheck.vitest.meetsMinimum) {
      lines.push(`  Status: ${versionCheck.vitest.isSupported ? 'Supported' : 'Untested'}`);
    }
  } else {
    lines.push('✗ Vitest: Not found');
  }

  if (versionCheck.coverageProvider.version) {
    lines.push(`✓ Coverage Provider: ${versionCheck.coverageProvider.provider} v${versionCheck.coverageProvider.version.version}`);
  } else {
    lines.push('⚠ Coverage Provider: Not found (coverage analysis disabled)');
  }

  if (versionCheck.warnings.length > 0) {
    lines.push('\nWarnings:');
    versionCheck.warnings.forEach(warning => lines.push(`  ⚠ ${warning}`));
  }

  if (versionCheck.errors.length > 0) {
    lines.push('\nErrors:');
    versionCheck.errors.forEach(error => lines.push(`  ✗ ${error}`));
  }

  if (versionCheck.errors.length === 0 && versionCheck.warnings.length === 0) {
    lines.push('\n✓ All version requirements satisfied!');
  }

  return lines.join('\n');
}
