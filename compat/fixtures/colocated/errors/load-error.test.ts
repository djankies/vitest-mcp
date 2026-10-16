import { expect, it } from 'vitest';
import { missing } from './does-not-exist';

it('never runs', () => {
  expect(missing).toBe(true);
});
