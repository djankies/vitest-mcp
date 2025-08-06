import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findVitestConfig, hasVitestConfig } from '../config-finder.js';
import { fileExists } from '../file-utils.js';

vi.mock('../file-utils.js');

describe('config-finder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findVitestConfig', () => {
    it('should prioritize vitest.mcp.config.ts over other configs', async () => {
      vi.mocked(fileExists).mockImplementation(async (path) => {
        return path.endsWith('vitest.mcp.config.ts') || 
               path.endsWith('vitest.config.ts');
      });

      const result = await findVitestConfig('/project');
      expect(result).toBe('/project/vitest.mcp.config.ts');
    });

    it('should fall back to vitest.config.ts when mcp config not found', async () => {
      vi.mocked(fileExists).mockImplementation(async (path) => {
        return path.endsWith('vitest.config.ts');
      });

      const result = await findVitestConfig('/project');
      expect(result).toBe('/project/vitest.config.ts');
    });

    it('should check vite.config files as fallback', async () => {
      vi.mocked(fileExists).mockImplementation(async (path) => {
        return path.endsWith('vite.config.mjs');
      });

      const result = await findVitestConfig('/project');
      expect(result).toBe('/project/vite.config.mjs');
    });

    it('should return null when no config found', async () => {
      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await findVitestConfig('/project');
      expect(result).toBeNull();
    });

    it('should check configs in correct priority order', async () => {
      const checkedPaths: string[] = [];
      vi.mocked(fileExists).mockImplementation(async (path) => {
        checkedPaths.push(path);
        return false;
      });

      await findVitestConfig('/project');

      expect(checkedPaths).toEqual([
        '/project/vitest.mcp.config.ts',
        '/project/vitest.config.ts',
        '/project/vitest.config.js',
        '/project/vitest.config.mjs',
        '/project/vite.config.ts',
        '/project/vite.config.js',
        '/project/vite.config.mjs',
      ]);
    });
  });

  describe('hasVitestConfig', () => {
    it('should return true when config exists', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const result = await hasVitestConfig('/project');
      expect(result).toBe(true);
    });

    it('should return false when no config exists', async () => {
      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await hasVitestConfig('/project');
      expect(result).toBe(false);
    });
  });
});