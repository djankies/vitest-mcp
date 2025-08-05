/**
 * Version checking utilities for Vitest and related packages
 */

import { spawn } from 'child_process';
import { resolve } from 'path';
import { readFile } from 'fs/promises';

export interface VersionInfo {
  version: string;
  major: number;
  minor: number;
  patch: number;
}

export interface VersionRequirements {
  vitest: {
    minimum: string;
    recommended: string;
    features: {
      jsonReporter: string;
      coverage: string;
      coverageThresholds: string;
      coverageMapInJson: string;
    };
  };
  coverageProvider: {
    minimum: string;
  };
}

/**
 * Version requirements for features we use
 */
export const VERSION_REQUIREMENTS: VersionRequirements = {
  vitest: {
    minimum: '0.34.0',
    recommended: '3.0.0',
    features: {
      jsonReporter: '0.10.0',
      coverage: '0.10.0', 
      coverageThresholds: '0.20.0',
      coverageMapInJson: '3.0.0'
    }
  },
  coverageProvider: {
    minimum: '0.34.0'
  }
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
 * Get Vitest version from package.json or CLI
 */
export async function getVitestVersion(projectRoot: string): Promise<VersionInfo | null> {
  try {
    // First try to read from package.json
    const packageJsonPath = resolve(projectRoot, 'node_modules', 'vitest', 'package.json');
    const packageJson = await readFile(packageJsonPath, 'utf-8');
    const parsed = JSON.parse(packageJson);
    
    if (parsed.version) {
      return parseVersion(parsed.version);
    }
  } catch {
    // Package.json approach failed, try CLI
  }

  try {
    // Fallback to CLI version check
    const version = await getVersionFromCli(projectRoot);
    return version ? parseVersion(version) : null;
  } catch {
    return null;
  }
}

/**
 * Get version from CLI command
 */
async function getVersionFromCli(cwd: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn('npx', ['vitest', '--version'], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true
    });

    let stdout = '';
    // stderr is captured but not used in version detection

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', () => {
      // stderr captured but not used for version detection
    });

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      resolve(null);
    }, 5000);

    child.on('close', (code) => {
      clearTimeout(timeout);
      
      if (code === 0 && stdout.trim()) {
        // Extract version from output like "vitest/1.2.3" or "1.2.3"
        const match = stdout.trim().match(/(?:vitest\/)?(\d+\.\d+\.\d+)/);
        resolve(match ? match[1] : null);
      } else {
        resolve(null);
      }
    });

    child.on('error', () => {
      clearTimeout(timeout);
      resolve(null);
    });
  });
}

/**
 * Get coverage provider version
 */
export async function getCoverageProviderVersion(projectRoot: string, provider: string = '@vitest/coverage-v8'): Promise<VersionInfo | null> {
  try {
    const packageJsonPath = resolve(projectRoot, 'node_modules', provider, 'package.json');
    const packageJson = await readFile(packageJsonPath, 'utf-8');
    const parsed = JSON.parse(packageJson);
    
    if (parsed.version) {
      return parseVersion(parsed.version);
    }
  } catch {
    // Package not found or error reading
  }
  
  return null;
}

/**
 * Comprehensive version check for all dependencies
 */
export async function checkAllVersions(projectRoot: string): Promise<{
  vitest: {
    version: VersionInfo | null;
    meetsMinimum: boolean;
    isRecommended: boolean;
    supportedFeatures: string[];
    missingFeatures: string[];
  };
  coverageProvider: {
    version: VersionInfo | null;
    meetsMinimum: boolean;
    provider: string;
  };
  warnings: string[];
  errors: string[];
}> {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Check Vitest version
  const vitestVersion = await getVitestVersion(projectRoot);
  const vitestMeetsMinimum = vitestVersion ? 
    meetsMinimumVersion(vitestVersion.version, VERSION_REQUIREMENTS.vitest.minimum) : false;
  const vitestIsRecommended = vitestVersion ? 
    meetsMinimumVersion(vitestVersion.version, VERSION_REQUIREMENTS.vitest.recommended) : false;

  // Determine supported features
  const supportedFeatures: string[] = [];
  const missingFeatures: string[] = [];

  if (vitestVersion) {
    const features = VERSION_REQUIREMENTS.vitest.features;
    for (const [feature, requiredVersion] of Object.entries(features)) {
      if (meetsMinimumVersion(vitestVersion.version, requiredVersion)) {
        supportedFeatures.push(feature);
      } else {
        missingFeatures.push(`${feature} (requires ${requiredVersion}+)`);
      }
    }
  }

  // Check coverage provider
  const coverageVersion = await getCoverageProviderVersion(projectRoot);
  const coverageMeetsMinimum = coverageVersion ? 
    meetsMinimumVersion(coverageVersion.version, VERSION_REQUIREMENTS.coverageProvider.minimum) : false;

  // Generate warnings and errors
  if (!vitestVersion) {
    errors.push('Vitest not found. Please install vitest as a dependency.');
  } else if (!vitestMeetsMinimum) {
    errors.push(`Vitest version ${vitestVersion.version} is below minimum required ${VERSION_REQUIREMENTS.vitest.minimum}. Please upgrade.`);
  } else if (!vitestIsRecommended) {
    warnings.push(`Vitest version ${vitestVersion.version} works but ${VERSION_REQUIREMENTS.vitest.recommended}+ is recommended for full feature support.`);
  }

  if (!coverageVersion) {
    warnings.push('Coverage provider (@vitest/coverage-v8) not found. Coverage analysis will not work.');
  } else if (!coverageMeetsMinimum) {
    warnings.push(`Coverage provider version ${coverageVersion.version} is below recommended ${VERSION_REQUIREMENTS.coverageProvider.minimum}.`);
  }

  if (missingFeatures.length > 0) {
    warnings.push(`Some features may not work optimally: ${missingFeatures.join(', ')}`);
  }

  return {
    vitest: {
      version: vitestVersion,
      meetsMinimum: vitestMeetsMinimum,
      isRecommended: vitestIsRecommended,
      supportedFeatures,
      missingFeatures
    },
    coverageProvider: {
      version: coverageVersion,
      meetsMinimum: coverageMeetsMinimum,
      provider: '@vitest/coverage-v8'
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
  
  // Vitest status
  if (versionCheck.vitest.version) {
    lines.push(`✓ Vitest: v${versionCheck.vitest.version.version}`);
    if (versionCheck.vitest.meetsMinimum) {
      lines.push(`  Status: ${versionCheck.vitest.isRecommended ? 'Recommended' : 'Compatible'}`);
    }
    if (versionCheck.vitest.supportedFeatures.length > 0) {
      lines.push(`  Supported features: ${versionCheck.vitest.supportedFeatures.join(', ')}`);
    }
  } else {
    lines.push('✗ Vitest: Not found');
  }
  
  // Coverage provider status
  if (versionCheck.coverageProvider.version) {
    lines.push(`✓ Coverage Provider: v${versionCheck.coverageProvider.version.version}`);
  } else {
    lines.push('⚠ Coverage Provider: Not found (coverage analysis disabled)');
  }
  
  // Warnings
  if (versionCheck.warnings.length > 0) {
    lines.push('\nWarnings:');
    versionCheck.warnings.forEach(warning => lines.push(`  ⚠ ${warning}`));
  }
  
  // Errors
  if (versionCheck.errors.length > 0) {
    lines.push('\nErrors:');
    versionCheck.errors.forEach(error => lines.push(`  ✗ ${error}`));
  }
  
  if (versionCheck.errors.length === 0 && versionCheck.warnings.length === 0) {
    lines.push('\n✓ All version requirements satisfied!');
  }
  
  return lines.join('\n');
}