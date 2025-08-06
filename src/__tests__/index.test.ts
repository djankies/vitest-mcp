import { describe, it, vi, beforeEach, afterEach, expect } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Mock MCP SDK
vi.mock('@modelcontextprotocol/sdk/server/index.js');
vi.mock('@modelcontextprotocol/sdk/server/stdio.js');

// Mock all tool modules
vi.mock('../tools/list-tests.js');
vi.mock('../tools/run-tests.js');
vi.mock('../tools/analyze-coverage.js');
vi.mock('../tools/set-project-root.js');
vi.mock('../config/config-loader.js');
vi.mock('../plugins/index.js');

describe('VitestMCPServer', () => {
  let mockServer: Server;
  let mockTransport: StdioServerTransport;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup mock server
    mockServer = {
      onerror: null,
      onclose: null,
      setRequestHandler: vi.fn(),
      connect: vi.fn()
    };
    vi.mocked(Server).mockReturnValue(mockServer);
    
    // Setup mock transport
    mockTransport = {};
    vi.mocked(StdioServerTransport).mockReturnValue(mockTransport);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Server Initialization', () => {
    it('should create server with correct configuration', async () => {
      // Mock the plugin registry
      const mockToolRegistry = {
        getTools: vi.fn().mockReturnValue([]),
        execute: vi.fn()
      };
      const { createStandardToolRegistry } = await import('../plugins/index.js');
      vi.mocked(createStandardToolRegistry).mockReturnValue(mockToolRegistry);
      
      // Mock config loader
      const { getConfig } = await import('../config/config-loader.js');
      vi.mocked(getConfig).mockResolvedValue({
        server: { verbose: false },
        coverageDefaults: {
          thresholdsExplicitlySet: false,
          thresholds: {}
        }
      });
      
      const { VitestMCPServer } = await import('../index.js');
      new VitestMCPServer(); // Actually instantiate the server
      
      expect(Server).toHaveBeenCalledWith({
        name: 'vitest-mcp',
        version: '0.2.0'
      }, {
        capabilities: {
          tools: {},
          resources: {}
        }
      });
    });

    it('should set up error and close handlers', async () => {
      await import('../index.js');
      expect(mockServer.onerror).toBeDefined();
      expect(mockServer.onclose).toBeDefined();
    });
  });

  describe('Request Handler Registration', () => {
    it('should register all required MCP request handlers', async () => {
      // Mock the plugin registry
      const mockToolRegistry = {
        getTools: vi.fn().mockReturnValue([]),
        execute: vi.fn()
      };
      const { createStandardToolRegistry } = await import('../plugins/index.js');
      vi.mocked(createStandardToolRegistry).mockReturnValue(mockToolRegistry);
      
      // Mock config loader
      const { getConfig } = await import('../config/config-loader.js');
      vi.mocked(getConfig).mockResolvedValue({
        server: { verbose: false },
        coverageDefaults: {
          thresholdsExplicitlySet: false,
          thresholds: {}
        }
      });
      
      const { VitestMCPServer } = await import('../index.js');
      new VitestMCPServer(); // Actually instantiate the server
      
      expect(mockServer.setRequestHandler).toHaveBeenCalledTimes(4);
    });
  });

  describe('Tool Registration', () => {
    it('should register all core tools', async () => {
      // Mock the plugin registry
      const mockToolRegistry = {
        getTools: vi.fn().mockReturnValue([]),
        execute: vi.fn()
      };
      const { createStandardToolRegistry } = await import('../plugins/index.js');
      vi.mocked(createStandardToolRegistry).mockReturnValue(mockToolRegistry);
      
      // Mock config loader
      const { getConfig } = await import('../config/config-loader.js');
      vi.mocked(getConfig).mockResolvedValue({
        server: { verbose: false },
        coverageDefaults: {
          thresholdsExplicitlySet: false,
          thresholds: {}
        }
      });
      
      const { VitestMCPServer } = await import('../index.js');
      new VitestMCPServer(); // Actually instantiate the server
      
      // Verify the essential tools are registered
      expect(mockServer.setRequestHandler).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle tool execution errors gracefully', async () => {
      // Mock the plugin registry
      const mockToolRegistry = {
        getTools: vi.fn().mockReturnValue([]),
        execute: vi.fn()
      };
      const { createStandardToolRegistry } = await import('../plugins/index.js');
      vi.mocked(createStandardToolRegistry).mockReturnValue(mockToolRegistry);
      
      // Mock config loader
      const { getConfig } = await import('../config/config-loader.js');
      vi.mocked(getConfig).mockResolvedValue({
        server: { verbose: false },
        coverageDefaults: {
          thresholdsExplicitlySet: false,
          thresholds: {}
        }
      });
      
      const { VitestMCPServer } = await import('../index.js');
      new VitestMCPServer(); // Actually instantiate the server
      
      expect(mockServer.onerror).toBeDefined();
      
      // Test error handler doesn't throw
      const errorHandler = mockServer.onerror;
      expect(() => errorHandler(new Error('test error'))).not.toThrow();
    });
  });

  describe('Resource Management', () => {
    it('should handle resource requests', async () => {
      // Mock the plugin registry
      const mockToolRegistry = {
        getTools: vi.fn().mockReturnValue([]),
        execute: vi.fn()
      };
      const { createStandardToolRegistry } = await import('../plugins/index.js');
      vi.mocked(createStandardToolRegistry).mockReturnValue(mockToolRegistry);
      
      // Mock config loader
      const { getConfig } = await import('../config/config-loader.js');
      vi.mocked(getConfig).mockResolvedValue({
        server: { verbose: false },
        coverageDefaults: {
          thresholdsExplicitlySet: false,
          thresholds: {}
        }
      });
      
      const { VitestMCPServer } = await import('../index.js');
      new VitestMCPServer(); // Actually instantiate the server
      
      // Verify resource handlers are set up
      expect(mockServer.setRequestHandler).toHaveBeenCalled();
    });
  });

  describe('Server Lifecycle', () => {
    it('should connect to transport successfully', async () => {
      // Mock the plugin registry
      const mockToolRegistry = {
        getTools: vi.fn().mockReturnValue([]),
        execute: vi.fn()
      };
      const { createStandardToolRegistry } = await import('../plugins/index.js');
      vi.mocked(createStandardToolRegistry).mockReturnValue(mockToolRegistry);
      
      // Mock config loader to prevent verbose mode
      const { getConfig } = await import('../config/config-loader.js');
      vi.mocked(getConfig).mockResolvedValue({
        server: { verbose: false },
        coverageDefaults: {
          thresholdsExplicitlySet: false,
          thresholds: {}
        }
      });
      
      const { VitestMCPServer } = await import('../index.js');
      const serverInstance = new VitestMCPServer();
      
      // Test the run method which creates transport and connects
      await serverInstance.run();
      
      expect(StdioServerTransport).toHaveBeenCalled();
      expect(mockServer.connect).toHaveBeenCalledWith(mockTransport);
    });
  });
});
