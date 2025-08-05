import { describe, it, expect } from 'vitest';

describe('Basic Tests', () => {
  it('should pass basic assertion', () => {
    expect(2 + 2).toBe(4);
  });

  it('should handle string comparison', () => {
    expect('hello').toBe('hello');
  });

  it('should handle boolean values', () => {
    expect(true).toBe(true);
    expect(false).toBe(false);
  });

  it('should handle arrays', () => {
    expect([1, 2, 3]).toEqual([1, 2, 3]);
  });
});