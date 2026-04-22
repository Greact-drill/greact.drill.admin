export type ToastSeverity = 'success' | 'info' | 'warn' | 'error';

export type ToastMessage = {
  severity?: ToastSeverity;
  summary?: string;
  detail: string;
  life?: number;
};

