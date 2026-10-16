import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { resolveTarget, validateProjectName } from '../target-utils.js';

describe('target-utils', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'target-utils-test-'));
    mkdirSync(join(root, 'src', 'nested'), { recursive: true });
    writeFileSync(join(root, 'src', 'nested', 'a.test.ts'), '');
    writeFileSync(join(root, '-flag.test.ts'), '');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  describe('resolveTarget', () => {
    it('resolves files and directories relative to the project root', async () => {
      await expect(resolveTarget(root, './src/nested/a.test.ts', 'run tests on')).resolves.toEqual({
        absolutePath: join(root, 'src', 'nested', 'a.test.ts'),
        relativePath: 'src/nested/a.test.ts',
        isDirectory: false,
      });
      await expect(resolveTarget(root, join(root, 'src'), 'run tests on')).resolves.toMatchObject({
        relativePath: 'src',
        isDirectory: true,
      });
    });

    it.each([
      ['', 'Target parameter is required'],
      ['   ', 'Target parameter is required'],
      ['.', 'entire project root'],
      ['./src/..', 'entire project root'],
      ['..', 'inside the project root'],
      ['../elsewhere', 'inside the project root'],
      ['/etc/passwd', 'inside the project root'],
      ['./missing', 'does not exist'],
      ['./-flag.test.ts', 'starting with "-"'],
    ])('rejects %j', async (target, message) => {
      await expect(resolveTarget(root, target, 'run tests on')).rejects.toThrow(message);
    });
  });

  describe('validateProjectName', () => {
    it('passes through normal names and ignores blanks', () => {
      expect(validateProjectName('client')).toBe('client');
      expect(validateProjectName(' @scope/pkg ')).toBe('@scope/pkg');
      expect(validateProjectName(undefined)).toBeUndefined();
      expect(validateProjectName('  ')).toBeUndefined();
    });

    it.each(['--config=evil', '-x', 'a\nb', 'a\u0000b'])('rejects %j', (name) => {
      expect(() => validateProjectName(name)).toThrow('Invalid project name');
    });
  });
});
