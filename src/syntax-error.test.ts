import { describe, it, expect } from 'vitest';

describe('Syntax Error Tests', () => {
  it('should pass before syntax errors', () => {
    expect(true).toBe(true);
  });

  // Missing closing brace for function
  it('should have syntax error - missing brace', () => {
    const badFunction = () => {
      console.log('missing closing brace');
    // Missing closing brace here
  });

  // Invalid syntax - missing parentheses
  it('should have syntax error - invalid call', () => {
    const result = someFunction;  // Missing parentheses
    expect result).toBe(true);    // Missing opening parenthesis
  });

  // Unclosed string
  it('should have syntax error - unclosed string', () => {
    const message = 'this string is not closed;
    expect(message).toBe('complete');
  });

  // Invalid object syntax
  it('should have syntax error - invalid object', () => {
    const obj = {
      prop1: 'value1',
      prop2: 'value2'
      prop3: 'value3'  // Missing comma
    };
    expect(obj.prop3).toBe('value3');
  });

  // This test should never run due to syntax errors above
  it('should not reach this test', () => {
    expect(false).toBe(true);
  });
});
