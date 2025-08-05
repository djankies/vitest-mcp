/**
 * API service with async operations and error handling for testing coverage scenarios
 */

export interface ApiResponse<T> {
  data: T;
  status: number;
  message: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: any;
}

export class ApiService {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl: string = 'https://api.example.com', timeout: number = 5000) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
  }

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    try {
      const url = this.buildUrl(endpoint);
      const response = await this.makeRequest('GET', url);
      return this.parseResponse<T>(response);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async post<T>(endpoint: string, data: any): Promise<ApiResponse<T>> {
    try {
      const url = this.buildUrl(endpoint);
      const response = await this.makeRequest('POST', url, data);
      return this.parseResponse<T>(response);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async put<T>(endpoint: string, data: any): Promise<ApiResponse<T>> {
    try {
      const url = this.buildUrl(endpoint);
      const response = await this.makeRequest('PUT', url, data);
      return this.parseResponse<T>(response);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    try {
      const url = this.buildUrl(endpoint);
      const response = await this.makeRequest('DELETE', url);
      return this.parseResponse<T>(response);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // This method will remain untested
  async patch<T>(endpoint: string, data: any): Promise<ApiResponse<T>> {
    try {
      const url = this.buildUrl(endpoint);
      const response = await this.makeRequest('PATCH', url, data);
      return this.parseResponse<T>(response);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private buildUrl(endpoint: string): string {
    if (endpoint.startsWith('http')) {
      return endpoint;
    }
    
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${this.baseUrl}${cleanEndpoint}`;
  }

  private async makeRequest(method: string, url: string, data?: any): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const options: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        signal: controller.signal
      };

      if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        options.body = JSON.stringify(data);
      }

      const response = await fetch(url, options);
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private async parseResponse<T>(response: Response): Promise<ApiResponse<T>> {
    try {
      const data = await response.json() as T;
      return {
        data,
        status: response.status,
        message: 'Success'
      };
    } catch (error) {
      // If JSON parsing fails, try to get text
      try {
        const text = await response.text();
        return {
          data: text as T,
          status: response.status,
          message: 'Success (text response)'
        };
      } catch (textError) {
        throw new Error('Failed to parse response');
      }
    }
  }

  private handleError(error: any): ApiError {
    if (error.name === 'AbortError') {
      return {
        code: 'TIMEOUT',
        message: 'Request timed out',
        details: { timeout: this.timeout }
      };
    }

    if (error.message?.includes('HTTP')) {
      const statusMatch = error.message.match(/HTTP (\d+)/);
      const status = statusMatch ? parseInt(statusMatch[1]) : 500;
      
      return {
        code: this.getErrorCodeFromStatus(status),
        message: error.message,
        details: { status }
      };
    }

    if (error.message?.includes('Failed to fetch')) {
      return {
        code: 'NETWORK_ERROR',
        message: 'Network connection failed',
        details: error
      };
    }

    return {
      code: 'UNKNOWN_ERROR',
      message: error.message || 'An unknown error occurred',
      details: error
    };
  }

  private getErrorCodeFromStatus(status: number): string {
    if (status >= 400 && status < 500) {
      switch (status) {
        case 400: return 'BAD_REQUEST';
        case 401: return 'UNAUTHORIZED';
        case 403: return 'FORBIDDEN';
        case 404: return 'NOT_FOUND';
        case 409: return 'CONFLICT';
        case 422: return 'VALIDATION_ERROR';
        default: return 'CLIENT_ERROR';
      }
    }

    if (status >= 500) {
      switch (status) {
        case 500: return 'INTERNAL_SERVER_ERROR';
        case 502: return 'BAD_GATEWAY';
        case 503: return 'SERVICE_UNAVAILABLE';
        case 504: return 'GATEWAY_TIMEOUT';
        default: return 'SERVER_ERROR';
      }
    }

    return 'UNKNOWN_STATUS';
  }

  // Utility methods that may not be fully tested
  setTimeout(timeout: number): void {
    this.timeout = timeout;
  }

  getTimeout(): number {
    return this.timeout;
  }

  setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }
}
