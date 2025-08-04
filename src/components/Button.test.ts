import { describe, it, expect } from 'vitest';
import { Button } from './Button.js';

describe('Button', () => {
  it('should return button text', () => {
    expect(Button()).toBe('button');
  });
});