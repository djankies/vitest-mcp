import { describe, expect, it } from 'vitest';
import { add, divide } from './math';

describe('math', () => {
  it('adds numbers', () => {
    console.log('compat-log-marker');
    console.error('compat-error-marker');
    expect(add(1, 2)).toBe(3);
  });

  it('divides numbers', () => {
    expect(divide(6, 3)).toBe(2);
  });

  it.skip('is skipped', () => {
    expect(true).toBe(false);
  });
});
