import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { findVitestConfig, hasVitestConfig } from '../config-finder.js';
import { writeFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('config-finder integration', () => {
  const testDir = join(tmpdir(), `vitest-mcp-test-${Date.now()}`);

  beforeAll(() => {
    // Create test directory
    mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    // Clean up test directory
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should prioritize vitest.mcp.config.ts over other configs in real filesystem', async () => {
    // Create both config files
    writeFileSync(
      join(testDir, 'vitest.mcp.config.ts'),
      'export default { test: { name: "mcp" } }'
    );
    writeFileSync(
      join(testDir, 'vitest.config.ts'),
      'export default { test: { name: "regular" } }'
    );

    const result = await findVitestConfig(testDir);
    expect(result).toBe(join(testDir, 'vitest.mcp.config.ts'));
  });

  it('should find regular vitest.config.ts when mcp config not present', async () => {
    const testDir2 = join(tmpdir(), `vitest-mcp-test2-${Date.now()}`);
    mkdirSync(testDir2, { recursive: true });

    try {
      writeFileSync(
        join(testDir2, 'vitest.config.ts'),
        'export default { test: {} }'
      );

      const result = await findVitestConfig(testDir2);
      expect(result).toBe(join(testDir2, 'vitest.config.ts'));
    } finally {
      rmSync(testDir2, { recursive: true, force: true });
    }
  });

  it('should detect vite.config.ts as fallback', async () => {
    const testDir3 = join(tmpdir(), `vitest-mcp-test3-${Date.now()}`);
    mkdirSync(testDir3, { recursive: true });

    try {
      writeFileSync(
        join(testDir3, 'vite.config.ts'),
        'export default { test: {} }'
      );

      const result = await findVitestConfig(testDir3);
      expect(result).toBe(join(testDir3, 'vite.config.ts'));
    } finally {
      rmSync(testDir3, { recursive: true, force: true });
    }
  });

  it('should return null for directory with no config', async () => {
    const testDir4 = join(tmpdir(), `vitest-mcp-test4-${Date.now()}`);
    mkdirSync(testDir4, { recursive: true });

    try {
      const result = await findVitestConfig(testDir4);
      expect(result).toBeNull();
    } finally {
      rmSync(testDir4, { recursive: true, force: true });
    }
  });

  it('hasVitestConfig should correctly detect presence of config', async () => {
    const testDir5 = join(tmpdir(), `vitest-mcp-test5-${Date.now()}`);
    mkdirSync(testDir5, { recursive: true });

    try {
      // Initially no config
      expect(await hasVitestConfig(testDir5)).toBe(false);

      // Add a config
      writeFileSync(
        join(testDir5, 'vitest.config.mjs'),
        'export default { test: {} }'
      );

      // Now should detect it
      expect(await hasVitestConfig(testDir5)).toBe(true);
    } finally {
      rmSync(testDir5, { recursive: true, force: true });
    }
  });
});