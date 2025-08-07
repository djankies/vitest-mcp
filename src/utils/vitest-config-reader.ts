import { readFile } from 'fs/promises';
import { findVitestConfig } from './config-finder.js';

export interface VitestCoverageThresholds {
  lines?: number;
  functions?: number;
  branches?: number;
  statements?: number;
}

/**
 * Extract coverage thresholds from Vitest configuration
 * @param projectRoot The root directory of the project
 * @returns The coverage thresholds or null if not configured
 */
export async function getVitestCoverageThresholds(projectRoot: string): Promise<VitestCoverageThresholds | null> {
  try {
    // Find the Vitest config file
    const configPath = await findVitestConfig(projectRoot);
    if (!configPath) {
      return null;
    }

    // Read the config file
    const configContent = await readFile(configPath, 'utf-8');

    // Extract thresholds using regex patterns
    // Look for patterns like:
    // thresholds: { lines: 80, functions: 80, ... }
    // or coverage: { thresholds: { lines: 80, ... } }
    
    // First try to find thresholds object
    const thresholdsMatch = configContent.match(/thresholds\s*:\s*{([^}]+)}/);
    if (!thresholdsMatch) {
      return null;
    }

    const thresholdsContent = thresholdsMatch[1];
    const thresholds: VitestCoverageThresholds = {};

    // Extract individual threshold values with safe parsing
    const lineMatch = thresholdsContent.match(/lines\s*:\s*(\d+)/);
    if (lineMatch) {
      const value = parseInt(lineMatch[1], 10);
      if (!isNaN(value) && value >= 0 && value <= 100) {
        thresholds.lines = value;
      }
    }

    const functionsMatch = thresholdsContent.match(/functions\s*:\s*(\d+)/);
    if (functionsMatch) {
      const value = parseInt(functionsMatch[1], 10);
      if (!isNaN(value) && value >= 0 && value <= 100) {
        thresholds.functions = value;
      }
    }

    const branchesMatch = thresholdsContent.match(/branches\s*:\s*(\d+)/);
    if (branchesMatch) {
      const value = parseInt(branchesMatch[1], 10);
      if (!isNaN(value) && value >= 0 && value <= 100) {
        thresholds.branches = value;
      }
    }

    const statementsMatch = thresholdsContent.match(/statements\s*:\s*(\d+)/);
    if (statementsMatch) {
      const value = parseInt(statementsMatch[1], 10);
      if (!isNaN(value) && value >= 0 && value <= 100) {
        thresholds.statements = value;
      }
    }

    // Return null if no thresholds were found
    if (Object.keys(thresholds).length === 0) {
      return null;
    }

    return thresholds;
  } catch (error) {
    // Gracefully handle any errors - if we can't read thresholds, we proceed without them
    if (process.env.VITEST_MCP_DEBUG) {
      console.error('Failed to read Vitest config thresholds:', error);
    }
    return null;
  }
}

/**
 * Check if coverage meets the configured thresholds
 * @param coverage The actual coverage percentages
 * @param thresholds The configured thresholds
 * @returns true if all thresholds are met, false otherwise
 */
export function checkThresholdsMet(
  coverage: { lines: number; functions: number; branches: number; statements: number },
  thresholds: VitestCoverageThresholds | null
): boolean {
  try {
    // If no thresholds are configured, consider them met
    if (!thresholds || typeof thresholds !== 'object') {
      return true;
    }

    // Check each threshold with safe comparison
    if (thresholds.lines !== undefined && 
        typeof thresholds.lines === 'number' && 
        coverage.lines < thresholds.lines) {
      return false;
    }

    if (thresholds.functions !== undefined && 
        typeof thresholds.functions === 'number' && 
        coverage.functions < thresholds.functions) {
      return false;
    }

    if (thresholds.branches !== undefined && 
        typeof thresholds.branches === 'number' && 
        coverage.branches < thresholds.branches) {
      return false;
    }

    if (thresholds.statements !== undefined && 
        typeof thresholds.statements === 'number' && 
        coverage.statements < thresholds.statements) {
      return false;
    }

    return true;
  } catch (error) {
    // If any error occurs during threshold checking, default to met
    if (process.env.VITEST_MCP_DEBUG) {
      console.error('Error checking thresholds:', error);
    }
    return true;
  }
}

/**
 * Get threshold violations as an array of messages
 * @param coverage The actual coverage percentages
 * @param thresholds The configured thresholds
 * @returns Array of violation messages
 */
export function getThresholdViolations(
  coverage: { lines: number; functions: number; branches: number; statements: number },
  thresholds: VitestCoverageThresholds | null
): string[] {
  if (!thresholds) {
    return [];
  }

  const violations: string[] = [];

  if (thresholds.lines !== undefined && coverage.lines < thresholds.lines) {
    violations.push(`Line coverage (${coverage.lines}%) is below threshold (${thresholds.lines}%)`);
  }

  if (thresholds.functions !== undefined && coverage.functions < thresholds.functions) {
    violations.push(`Function coverage (${coverage.functions}%) is below threshold (${thresholds.functions}%)`);
  }

  if (thresholds.branches !== undefined && coverage.branches < thresholds.branches) {
    violations.push(`Branch coverage (${coverage.branches}%) is below threshold (${thresholds.branches}%)`);
  }

  if (thresholds.statements !== undefined && coverage.statements < thresholds.statements) {
    violations.push(`Statement coverage (${coverage.statements}%) is below threshold (${thresholds.statements}%)`);
  }

  return violations;
}