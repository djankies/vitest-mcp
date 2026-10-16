export function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function neverCalled(): string {
  return 'not covered';
}
