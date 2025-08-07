import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validatePathSecurity,
  securePathResolve,
  validateFileExtension,
  validateTestFilePath,
  validateConfigFilePath,
  createSecureTempPath,
  sanitizeFileContent
} from '../path-security';

// Mock fs operations
vi.mock('fs', () => ({
  promises: {
    access: vi.fn(),
    stat: vi.fn()
  }
}));

describe('path-security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validatePathSecurity', () => {
    it('should accept safe paths', () => {
      expect(() => validatePathSecurity('./src/test.ts')).not.toThrow();
      expect(() => validatePathSecurity('src/components/Button.tsx')).not.toThrow();
    });

    it('should reject path traversal attempts', () => {
      expect(() => validatePathSecurity('../../../etc/passwd')).toThrow('dangerous path pattern');
      expect(() => validatePathSecurity('./src/../../../etc/passwd')).toThrow('dangerous path pattern');
    });

    it('should reject null byte injection', () => {
      expect(() => validatePathSecurity('file.txt\0.exe')).toThrow('dangerous path pattern');
    });

    it('should reject system directories', () => {
      expect(() => validatePathSecurity('/etc/passwd')).toThrow('system directory forbidden');
      expect(() => validatePathSecurity('C:\\Windows\\System32')).toThrow('system directory forbidden');
    });

    it('should reject paths that are too long', () => {
      const longPath = 'a'.repeat(5000);
      expect(() => validatePathSecurity(longPath)).toThrow('Path too long');
    });
  });

  describe('securePathResolve', () => {
    it('should resolve paths within project boundary', () => {
      const result = securePathResolve('/project', './src/file.ts');
      expect(result).toMatch(/\/project\/src\/file\.ts$/);
    });

    it('should prevent directory traversal escapes', () => {
      // These paths contain .. patterns so they're caught by validatePathSecurity first
      expect(() => securePathResolve('/project', '../outside.txt')).toThrow('dangerous path pattern');
      expect(() => securePathResolve('/project', '../../etc/passwd')).toThrow('dangerous path pattern');
    });

    it('should normalize and resolve safe paths', () => {
      const result = securePathResolve('/project', './src/utils.ts');
      expect(result).toMatch(/\/project\/src\/utils\.ts$/);
    });
  });

  describe('validateFileExtension', () => {
    it('should accept allowed extensions', () => {
      expect(() => validateFileExtension('test.ts', ['.ts', '.js'])).not.toThrow();
      expect(() => validateFileExtension('component.tsx', ['.tsx', '.ts'])).not.toThrow();
    });

    it('should reject disallowed extensions', () => {
      expect(() => validateFileExtension('script.py', ['.ts', '.js'])).toThrow("extension '.py' not allowed");
      expect(() => validateFileExtension('malware.exe', ['.ts', '.js'])).toThrow("extension '.exe' not allowed");
    });
  });

  describe('validateTestFilePath', () => {
    it('should accept valid test files', () => {
      expect(() => validateTestFilePath('src/components/Button.test.ts')).not.toThrow();
      expect(() => validateTestFilePath('__tests__/utils.spec.js')).not.toThrow();
    });

    it('should accept source files for coverage', () => {
      expect(() => validateTestFilePath('src/components/Button.tsx')).not.toThrow();
    });

    it('should reject invalid file extensions', () => {
      expect(() => validateTestFilePath('test.py')).toThrow('not allowed');
    });
  });

  describe('validateConfigFilePath', () => {
    it('should accept valid config files', () => {
      expect(() => validateConfigFilePath('vitest.config.ts')).not.toThrow();
      expect(() => validateConfigFilePath('.vitest-mcp.json')).not.toThrow();
    });

    it('should reject files with invalid extensions first', () => {
      // Extension validation happens before config name validation
      expect(() => validateConfigFilePath('random.txt')).toThrow('not allowed');
    });
  });

  describe('createSecureTempPath', () => {
    it('should create secure temp paths', () => {
      const tempPath = createSecureTempPath('/project', 'vitest');
      expect(tempPath).toMatch(/\/project\/vitest-[a-f0-9]{64}\.tmp$/);
    });

    it('should sanitize prefixes', () => {
      const tempPath = createSecureTempPath('/project', 'test../file');
      expect(tempPath).toMatch(/\/project\/testfile-[a-f0-9]{64}\.tmp$/);
    });
  });

  describe('sanitizeFileContent', () => {
    it('should remove script tags', () => {
      const malicious = 'Hello <script>alert("xss")</script> World';
      const result = sanitizeFileContent(malicious);
      expect(result).toBe('Hello  World');
    });

    it('should remove dangerous protocols', () => {
      const malicious = 'Click javascript:alert("xss") here';
      const result = sanitizeFileContent(malicious);
      expect(result).toBe('Click alert("xss") here');
    });

    it('should handle non-string input', () => {
      expect(sanitizeFileContent(null as any)).toBe('');
      expect(sanitizeFileContent(undefined as any)).toBe('');
    });
  });
});
