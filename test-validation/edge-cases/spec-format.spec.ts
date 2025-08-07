import { describe, it, expect } from 'vitest';

// Test file using .spec.ts format instead of .test.ts
describe('Spec Format Tests', () => {
  it('should work with .spec.ts extension', () => {
    expect(true).toBe(true);
  });

  it('should be discoverable by list_tests', () => {
    expect('spec format').toContain('spec');
  });
});
