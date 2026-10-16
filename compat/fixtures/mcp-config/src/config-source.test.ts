import { expect, it } from 'vitest';

it('runs with the MCP-specific config', () => {
  expect(process.env.CONFIG_SOURCE).toBe('vitest.mcp.config.ts');
});
