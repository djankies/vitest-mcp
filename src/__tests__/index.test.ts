import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Mock the MCP SDK modules
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: vi.fn().mockImplementation(() => ({
    setRequestHandler: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined)
  }))
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn()
}));

// Mock the tool modules
vi.mock('../tools/list-tests.js', () => ({
  listTestsTool: { name: 'list_tests', description: 'List tests' },
  handleListTests: vi.fn().mockResolvedValue({ testFiles: [], totalCount: 0 })
}));

vi.mock('../tools/run-tests.js', () => ({
  runTestsTool: { name: 'run_tests', description: 'Run tests' },
  handleRunTests: vi.fn().mockResolvedValue({ success: true })
}));

vi.mock('../tools/analyze-coverage.js', () => ({
  analyzeCoverageTool: { name: 'analyze_coverage', description: 'Analyze coverage' },
  handleAnalyzeCoverage: vi.fn().mockResolvedValue({ coverage: {} })
}));

describe('VitestMCPServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create server with correct configuration', async () => {
    // Import after mocks are set up
    await import('../index');

    expect(Server).toHaveBeenCalledWith(
      {
        name: 'vitest-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );
  });

  it('should set up request handlers', async () => {
    await import('../index');

    const serverInstance = vi.mocked(Server).mock.results[0].value;
    expect(serverInstance.setRequestHandler).toHaveBeenCalled();
  });

  it('should connect to stdio transport', async () => {
    await import('../index');

    const serverInstance = vi.mocked(Server).mock.results[0].value;
    expect(StdioServerTransport).toHaveBeenCalled();
    expect(serverInstance.connect).toHaveBeenCalled();
  });
});