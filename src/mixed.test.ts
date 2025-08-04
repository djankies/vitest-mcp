import { describe, it, expect } from 'vitest';

describe('Mixed test results', () => {
  describe('Passing tests', () => {
    it('should pass basic math', () => {
      expect(2 + 2).toBe(4);
    });

    it('should pass string check', () => {
      expect('test').toContain('est');
    });
  });

  describe('Failing tests', () => {
    it('should fail math check', () => {
      expect(2 + 2).toBe(5); // This will fail
    });

    it('should fail with undefined check', () => {
      const obj: any = {};
      expect(obj.nonExistent.property).toBeDefined(); // This will throw
    });
  });

  describe('Edge cases', () => {
    it('should pass null check', () => {
      expect(null).toBeNull();
    });

    it('should fail boolean check', () => {
      expect(true).toBe(false); // This will fail
    });
  });
});
