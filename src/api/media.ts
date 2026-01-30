import axios from 'axios';

const mediaBaseUrl =
  import.meta.env.VITE_MEDIA_API_URL ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:3010';

const mediaClient = axios.create({
  baseURL: mediaBaseUrl,
  timeout: 15000
});

export interface MediaConfigResponse<T = Record<string, unknown>> {
  key: string;
  data: T | null;
}

export interface PresignUploadResponse {
  url: string;
  key: string;
  method: 'PUT';
  headers: Record<string, string>;
  publicUrl?: string | null;
}

export interface PresignDownloadResponse {
  url: string;
  key: string;
  method: 'GET';
  publicUrl?: string | null;
}

export interface UploadMediaResponse {
  key: string;
  publicUrl?: string | null;
}

export async function getMediaConfig<T = Record<string, unknown>>(
  scope: string,
  rigId?: string
): Promise<MediaConfigResponse<T>> {
  const response = await mediaClient.get<MediaConfigResponse<T>>('/media/config', {
    params: {
      scope,
      rigId: rigId || undefined
    }
  });
  return response.data;
}

export async function putMediaConfig<T = Record<string, unknown>>(
  scope: string,
  rigId: string | undefined,
  data: T
): Promise<MediaConfigResponse<T>> {
  const response = await mediaClient.put<MediaConfigResponse<T>>('/media/config', {
    scope,
    rigId,
    data
  });
  return response.data;
}

export async function presignUpload(params: {
  key: string;
  contentType?: string;
  cacheControl?: string;
  expiresIn?: number;
}): Promise<PresignUploadResponse> {
  const response = await mediaClient.post<PresignUploadResponse>('/media/presign-upload', params);
  return response.data;
}

export async function presignDownload(params: {
  key: string;
  expiresIn?: number;
}): Promise<PresignDownloadResponse> {
  const response = await mediaClient.post<PresignDownloadResponse>('/media/presign-download', params);
  return response.data;
}

export async function uploadMediaAsset(params: {
  key: string;
  file: File;
  contentType?: string;
  cacheControl?: string;
}): Promise<UploadMediaResponse> {
  const formData = new FormData();
  formData.append('file', params.file);
  formData.append('key', params.key);
  if (params.contentType) {
    formData.append('contentType', params.contentType);
  }
  if (params.cacheControl) {
    formData.append('cacheControl', params.cacheControl);
  }
  const response = await mediaClient.post<UploadMediaResponse>('/media/upload', formData);
  return response.data;
}
