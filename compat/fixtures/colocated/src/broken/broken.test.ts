import { expect, it } from 'vitest';
import { answer } from './broken';

it('returns the answer', () => {
  expect(answer()).toBe(42);
});
