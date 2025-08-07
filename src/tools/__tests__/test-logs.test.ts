import { describe, it, expect } from 'vitest';

// Skip these tests in CI to prevent console output issues
const skipInCI = process.env.CI === 'true' ? describe.skip : describe;

skipInCI('Test with console logs', () => {
  it('should log messages', () => {
    console.log('This is a regular log message');
    console.error('This is an error message');
    console.warn('This is a warning message');
    console.info('This is an info message');
    console.debug('This is a debug message');
    
    // Also log objects
    console.log('Object:', { foo: 'bar', nested: { value: 123 } });
    
    expect(1 + 1).toBe(2);
  });
  
  it('should log more messages', () => {
    console.log('Test 2 log message');
    console.error('Test 2 error');
    
    expect(true).toBe(true);
  });
});