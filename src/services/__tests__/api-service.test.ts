import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiService } from './api-service';

// Mock fetch globally
global.fetch = vi.fn();

describe('ApiService', () => {
  let apiService: ApiService;

  beforeEach(() => {
    apiService = new ApiService();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with default values', () => {
      const service = new ApiService();
      expect(service.getBaseUrl()).toBe('https://api.example.com');
      expect(service.getTimeout()).toBe(5000);
    });

    it('should create instance with custom values', () => {
      const service = new ApiService('https://custom.api.com', 3000);
      expect(service.getBaseUrl()).toBe('https://custom.api.com');
      expect(service.getTimeout()).toBe(3000);
    });
  });

  describe('get method', () => {
    it('should make successful GET request', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: vi.fn().mockResolvedValue({ id: 1, name: 'Test' })
      };

      (fetch as any).mockResolvedValue(mockResponse);

      const result = await apiService.get('/users/1');

      expect(fetch).toHaveBeenCalledWith(
        'https://api.example.com/users/1',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          })
        })
      );

      expect(result).toEqual({
        data: { id: 1, name: 'Test' },
        status: 200,
        message: 'Success'
      });
    });

    it('should handle HTTP errors', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found'
      };

      (fetch as any).mockResolvedValue(mockResponse);

      await expect(apiService.get('/users/999')).rejects.toEqual({
        code: 'NOT_FOUND',
        message: 'HTTP 404: Not Found',
        details: { status: 404 }
      });
    });
  });

  describe('post method', () => {
    it('should make successful POST request', async () => {
      const mockResponse = {
        ok: true,
        status: 201,
        statusText: 'Created',
        json: vi.fn().mockResolvedValue({ id: 2, name: 'New User' })
      };

      (fetch as any).mockResolvedValue(mockResponse);

      const postData = { name: 'New User', email: 'new@example.com' };
      const result = await apiService.post('/users', postData);

      expect(fetch).toHaveBeenCalledWith(
        'https://api.example.com/users',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(postData)
        })
      );

      expect(result.status).toBe(201);
    });
  });

  describe('utility methods', () => {
    it('should update timeout', () => {
      apiService.setTimeout(10000);
      expect(apiService.getTimeout()).toBe(10000);
    });

    it('should update base URL', () => {
      apiService.setBaseUrl('https://new.api.com');
      expect(apiService.getBaseUrl()).toBe('https://new.api.com');
    });
  });

  // Note: Many error handling scenarios and edge cases are intentionally not tested
  // to create coverage gaps for testing the coverage analysis tool
});
