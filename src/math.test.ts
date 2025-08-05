import { describe, it, expect } from 'vitest';
import { add, subtract, multiply, divide } from './math';

describe('Math functions', () => {
  it('should add two numbers', () => {
    expect(add(2, 3)).toBe(5);
    expect(add(-1, 1)).toBe(0);
  });

  it('should subtract two numbers', () => {
    expect(subtract(5, 3)).toBe(2);
    expect(subtract(0, 5)).toBe(-5);
  });

  // Note: multiply and divide are not tested (for coverage testing)
});