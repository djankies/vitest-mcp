import { describe, it, expect } from 'vitest';

describe('Failing tests', () => {
  it('should fail with assertion error', () => {
    expect(1 + 1).toBe(3); // This will fail
  });

  it('should fail with string comparison', () => {
    expect('hello world').toBe('goodbye world'); // This will fail
  });

  it('should fail with thrown error', () => {
    throw new Error('This test intentionally fails');
  });

  it('should fail with async rejection', async () => {
    await Promise.reject(new Error('Async operation failed'));
  });

  it('should fail with timeout', async () => {
    // This will timeout if vitest has a timeout configured
    await new Promise(resolve => setTimeout(resolve, 10000));
  }, 1000); // 1 second timeout

  it('should fail with object comparison', () => {
    const actual = { name: 'John', age: 30 };
    const expected = { name: 'Jane', age: 25 };
    expect(actual).toEqual(expected);
  });

  it('should fail with array comparison', () => {
    expect([1, 2, 3]).toEqual([1, 2, 4]);
  });
});
