import axios, { type AxiosInstance, type AxiosResponse } from 'axios'

class ApiClient {
  private primaryUrl: string
  private fallbackUrl: string
  private currentInstance: AxiosInstance
  private isUsingFallback: boolean = false

  constructor() {
    this.primaryUrl = import.meta.env.VITE_API_URL || 'https://test.backend.drill.greact.ru'
    this.fallbackUrl = 'https://test.backend.drill.greact.ru'
    
    // Создаем instance для основного URL
    this.currentInstance = this.createAxiosInstance(this.primaryUrl)
  }

  private createAxiosInstance(baseURL: string): AxiosInstance {
    return axios.create({
      baseURL,
      timeout: 10000, // 10 секунд таймаут
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  private async switchToFallback(): Promise<void> {
    this.currentInstance = this.createAxiosInstance(this.fallbackUrl)
    this.isUsingFallback = true
  }

  public isUsingLocalServer(): boolean {
    return this.isUsingFallback
  }

  public getCurrentUrl(): string {
    return this.isUsingFallback ? this.fallbackUrl : this.primaryUrl
  }

  public async get<T = unknown>(url: string, config = {}): Promise<AxiosResponse<T>> {
    try {
      const response = await this.currentInstance.get<T>(url, config)
      return response
    } catch (error) {
      if (!this.isUsingFallback && this.isNetworkError(error)) {
        await this.switchToFallback()
        const response = await this.currentInstance.get<T>(url, config)
        return response
      }
      throw error
    }
  }

  public async post<T = unknown>(url: string, data?: unknown, config = {}): Promise<AxiosResponse<T>> {
    try {
      const response = await this.currentInstance.post<T>(url, data, config)
      return response
    } catch (error) {
      if (!this.isUsingFallback && this.isNetworkError(error)) {
        await this.switchToFallback()
        const response = await this.currentInstance.post<T>(url, data, config)
        return response
      }
      throw error
    }
  }

  public async patch<T = unknown>(url: string, data?: unknown, config = {}): Promise<AxiosResponse<T>> {
    try {
      const response = await this.currentInstance.patch<T>(url, data, config)
      return response
    } catch (error) {
      if (!this.isUsingFallback && this.isNetworkError(error)) {
        await this.switchToFallback()
        const response = await this.currentInstance.patch<T>(url, data, config)
        return response
      }
      throw error
    }
  }

  public async delete<T = unknown>(url: string, config = {}): Promise<AxiosResponse<T>> {
    try {
      const response = await this.currentInstance.delete<T>(url, config)
      return response
    } catch (error) {
      if (!this.isUsingFallback && this.isNetworkError(error)) {
        await this.switchToFallback()
        const response = await this.currentInstance.delete<T>(url, config)
        return response
      }
      throw error
    }
  }

  private isNetworkError(error: unknown): boolean {
    const err = error as { code?: string; message?: string; response?: { status?: number } }
    return (
      err?.code === 'ECONNREFUSED' ||
      err?.code === 'ENOTFOUND' ||
      err?.code === 'ETIMEDOUT' ||
      err?.message?.includes('Network Error') ||
      err?.message?.includes('timeout') ||
      err?.response?.status === 404 || // Добавляем 404 как причину для fallback
      !err?.response // Нет ответа от сервера
    )
  }

  public async checkConnection(): Promise<{ isAvailable: boolean; url: string }> {
    try {
      await this.currentInstance.get('/health-check', { timeout: 5000 })
      return { isAvailable: true, url: this.getCurrentUrl() }
    } catch {
      if (!this.isUsingFallback) {
        try {
          await this.switchToFallback()
          await this.currentInstance.get('/health-check', { timeout: 5000 })
          return { isAvailable: true, url: this.getCurrentUrl() }
        } catch {
          return { isAvailable: false, url: this.getCurrentUrl() }
        }
      }
      return { isAvailable: false, url: this.getCurrentUrl() }
    }
  }
}

export const apiClient = new ApiClient()
export default apiClient
