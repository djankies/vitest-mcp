import { describe, it, expect } from 'vitest';

describe('Failing Tests', () => {
  it('should pass - basic assertion', () => {
    expect(1 + 1).toBe(2);
  });

  it('should fail - intentional failure', () => {
    expect(2 + 2).toBe(5); // This will fail intentionally
  });

  it('should fail - another intentional failure', () => {
    expect('hello').toBe('world'); // This will also fail
  });

  it('should pass - string comparison', () => {
    expect('test').toBe('test');
  });
});
