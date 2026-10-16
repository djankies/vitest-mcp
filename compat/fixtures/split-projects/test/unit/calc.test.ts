import { expect, it } from 'vitest';
import { average, sum } from '../../src/calc';

it('sums values', () => {
  expect(sum([1, 2, 3])).toBe(6);
});

it('averages values', () => {
  expect(average([2, 4])).toBe(3);
  expect(average([])).toBe(0);
});
