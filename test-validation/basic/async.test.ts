import { describe, it, expect } from 'vitest';

// Async utility functions
async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchData(): Promise<string> {
  await delay(100);
  return 'async data';
}

async function failingAsync(): Promise<string> {
  await delay(50);
  throw new Error('Async operation failed');
}

describe('Async Tests', () => {
  it('should handle async operations', async () => {
    const result = await fetchData();
    expect(result).toBe('async data');
  });

  it('should handle async failures', async () => {
    await expect(failingAsync()).rejects.toThrow('Async operation failed');
  });

  it('should handle promises', () => {
    return expect(fetchData()).resolves.toBe('async data');
  });
});
