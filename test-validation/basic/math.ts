// Basic math functions for testing
export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}

export function divide(a: number, b: number): number {
  if (b === 0) {
    throw new Error('Division by zero');
  }
  return a / b;
}

export function factorial(n: number): number {
  if (n < 0) {
    throw new Error('Factorial of negative number');
  }
  if (n === 0 || n === 1) {
    return 1;
  }
  return n * factorial(n - 1);
}

// Untested function for coverage analysis
export function untested(): string {
  return 'This function is not covered by tests';
}
