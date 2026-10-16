import { expect, it } from 'vitest';
import { formatCurrency } from '../../src/util/format';

it('formats currency', () => {
  console.log('e2e-log-marker');
  expect(formatCurrency(3)).toBe('$3.00');
});
