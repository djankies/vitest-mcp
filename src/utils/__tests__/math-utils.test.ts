import { describe, it, expect } from 'vitest';
import { 
  add, 
  subtract, 
  multiply, 
  divide, 
  factorial, 
  isPrime, 
  fibonacci,
  gcd,
  calculateGrade
} from './math-utils';

describe('Math Utils', () => {
  describe('Basic arithmetic', () => {
    it('should add two numbers correctly', () => {
      expect(add(2, 3)).toBe(5);
      expect(add(-1, 1)).toBe(0);
      expect(add(0, 0)).toBe(0);
    });

    it('should subtract two numbers correctly', () => {
      expect(subtract(5, 3)).toBe(2);
      expect(subtract(1, 1)).toBe(0);
    });

    it('should multiply two numbers correctly', () => {
      expect(multiply(3, 4)).toBe(12);
      expect(multiply(0, 5)).toBe(0);
    });

    it('should divide two numbers correctly', () => {
      expect(divide(10, 2)).toBe(5);
      expect(divide(7, 2)).toBe(3.5);
    });

    it('should throw error when dividing by zero', () => {
      expect(() => divide(5, 0)).toThrow('Division by zero is not allowed');
    });
  });

  describe('Factorial function', () => {
    it('should calculate factorial correctly', () => {
      expect(factorial(0)).toBe(1);
      expect(factorial(1)).toBe(1);
      expect(factorial(5)).toBe(120);
    });

    it('should throw error for negative numbers', () => {
      expect(() => factorial(-1)).toThrow('Factorial is not defined for negative numbers');
    });
  });

  describe('Prime number checking', () => {
    it('should identify prime numbers correctly', () => {
      expect(isPrime(2)).toBe(true);
      expect(isPrime(3)).toBe(true);
      expect(isPrime(17)).toBe(true);
    });

    it('should identify non-prime numbers correctly', () => {
      expect(isPrime(1)).toBe(false);
      expect(isPrime(4)).toBe(false);
      expect(isPrime(9)).toBe(false);
    });
  });

  describe('Fibonacci sequence', () => {
    it('should calculate fibonacci numbers correctly', () => {
      expect(fibonacci(0)).toBe(0);
      expect(fibonacci(1)).toBe(1);
      expect(fibonacci(5)).toBe(5);
      expect(fibonacci(10)).toBe(55);
    });

    // Intentionally not testing error case to create coverage gap
  });

  describe('GCD function', () => {
    it('should calculate greatest common divisor correctly', () => {
      expect(gcd(12, 8)).toBe(4);
      expect(gcd(17, 13)).toBe(1);
    });
  });

  describe('Grade calculation', () => {
    it('should assign correct grades', () => {
      expect(calculateGrade(95)).toBe('A');
      expect(calculateGrade(85)).toBe('B');
      expect(calculateGrade(75)).toBe('C');
    });

    // Intentionally not testing all grade ranges and error cases
  });

  // Note: lcm function is intentionally not tested to create coverage gaps
});
