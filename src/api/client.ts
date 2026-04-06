import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import { getAccessToken } from '../auth/keycloak';

class ApiClient {
  private primaryUrl: string;
  private fallbackUrl: string;
  private currentInstance: AxiosInstance;
  private isUsingFallback = false;

  constructor() {
    this.primaryUrl = import.meta.env.VITE_API_URL ?? '';
    this.fallbackUrl = import.meta.env.VITE_API_URL ?? '';
    this.currentInstance = this.createAxiosInstance(this.primaryUrl);
  }

  private createAxiosInstance(baseURL: string): AxiosInstance {
    const instance = axios.create({
      baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    instance.interceptors.request.use(async (config) => {
      const token = await getAccessToken();

      if (token) {
        config.headers = config.headers ?? {};
        config.headers.Authorization = `Bearer ${token}`;
      }

      return config;
    });

    return instance;
  }

  private async switchToFallback(): Promise<void> {
    this.currentInstance = this.createAxiosInstance(this.fallbackUrl);
    this.isUsingFallback = true;
  }

  public isUsingLocalServer(): boolean {
    return this.isUsingFallback;
  }

  public getCurrentUrl(): string {
    return this.isUsingFallback ? this.fallbackUrl : this.primaryUrl;
  }

  public async get<T = unknown>(url: string, config = {}): Promise<AxiosResponse<T>> {
    try {
      return await this.currentInstance.get<T>(url, config);
    } catch (error) {
      if (!this.isUsingFallback && this.isNetworkError(error)) {
        await this.switchToFallback();
        return await this.currentInstance.get<T>(url, config);
      }

      throw error;
    }
  }

  public async post<T = unknown>(url: string, data?: unknown, config = {}): Promise<AxiosResponse<T>> {
    try {
      return await this.currentInstance.post<T>(url, data, config);
    } catch (error) {
      if (!this.isUsingFallback && this.isNetworkError(error)) {
        await this.switchToFallback();
        return await this.currentInstance.post<T>(url, data, config);
      }

      throw error;
    }
  }

  public async put<T = unknown>(url: string, data?: unknown, config = {}): Promise<AxiosResponse<T>> {
    try {
      return await this.currentInstance.put<T>(url, data, config);
    } catch (error) {
      if (!this.isUsingFallback && this.isNetworkError(error)) {
        await this.switchToFallback();
        return await this.currentInstance.put<T>(url, data, config);
      }

      throw error;
    }
  }

  public async patch<T = unknown>(url: string, data?: unknown, config = {}): Promise<AxiosResponse<T>> {
    try {
      return await this.currentInstance.patch<T>(url, data, config);
    } catch (error) {
      if (!this.isUsingFallback && this.isNetworkError(error)) {
        await this.switchToFallback();
        return await this.currentInstance.patch<T>(url, data, config);
      }

      throw error;
    }
  }

  public async delete<T = unknown>(url: string, config = {}): Promise<AxiosResponse<T>> {
    try {
      return await this.currentInstance.delete<T>(url, config);
    } catch (error) {
      if (!this.isUsingFallback && this.isNetworkError(error)) {
        await this.switchToFallback();
        return await this.currentInstance.delete<T>(url, config);
      }

      throw error;
    }
  }

  private isNetworkError(error: unknown): boolean {
    const err = error as { code?: string; message?: string; response?: { status?: number } };

    return (
      err?.code === 'ECONNREFUSED' ||
      err?.code === 'ENOTFOUND' ||
      err?.code === 'ETIMEDOUT' ||
      err?.message?.includes('Network Error') ||
      err?.message?.includes('timeout') ||
      err?.response?.status === 404 ||
      !err?.response
    );
  }

  public async checkConnection(): Promise<{ isAvailable: boolean; url: string }> {
    try {
      await this.currentInstance.get('/health-check', { timeout: 5000 });
      return { isAvailable: true, url: this.getCurrentUrl() };
    } catch {
      if (!this.isUsingFallback) {
        try {
          await this.switchToFallback();
          await this.currentInstance.get('/health-check', { timeout: 5000 });
          return { isAvailable: true, url: this.getCurrentUrl() };
        } catch {
          return { isAvailable: false, url: this.getCurrentUrl() };
        }
      }

      return { isAvailable: false, url: this.getCurrentUrl() };
    }
  }
}

export const apiClient = new ApiClient();
export default apiClient;
