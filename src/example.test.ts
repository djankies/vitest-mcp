import { describe, it, expect } from 'vitest';

describe('Example test', () => {
  it('should pass basic assertion', () => {
    expect(1 + 1).toBe(2);
  });

  it('should handle strings', () => {
    expect('hello world').toContain('world');
  });
});