import { describe, it, expect } from 'vitest';

describe('Failing Tests', () => {
  it('should fail math check', () => {
    expect(2 + 2).toBe(5); // This will fail
  });

  it('should fail string comparison', () => {
    expect('hello').toBe('world'); // This will fail
  });

  it('should pass one test', () => {
    expect(true).toBe(true); // This will pass
  });

  it('should fail array comparison', () => {
    expect([1, 2, 3]).toEqual([4, 5, 6]); // This will fail
  });

  it('should fail with error', () => {
    throw new Error('Intentional error for testing');
  });
});
