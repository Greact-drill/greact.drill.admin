import React, { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import { Toast } from 'primereact/toast';
import type { ToastMessage, ToastSeverity } from './toast';

type ToastApi = {
  show: (msg: ToastMessage) => void;
  success: (detail: string, summary?: string) => void;
  info: (detail: string, summary?: string) => void;
  warn: (detail: string, summary?: string) => void;
  error: (detail: string, summary?: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

function normalizeLife(severity: ToastSeverity | undefined) {
  if (severity === 'error') return 7000;
  if (severity === 'warn') return 6000;
  return 4500;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const toastRef = useRef<Toast | null>(null);

  const show = useCallback((msg: ToastMessage) => {
    toastRef.current?.show({
      severity: msg.severity ?? 'info',
      summary: msg.summary ?? undefined,
      detail: msg.detail,
      life: msg.life ?? normalizeLife(msg.severity),
    });
  }, []);

  const api = useMemo<ToastApi>(() => {
    const make =
      (severity: ToastSeverity) =>
      (detail: string, summary?: string) =>
        show({ severity, detail, summary });

    return {
      show,
      success: make('success'),
      info: make('info'),
      warn: make('warn'),
      error: make('error'),
    };
  }, [show]);

  return (
    <ToastContext.Provider value={api}>
      <Toast ref={(el) => (toastRef.current = el)} position="top-right" />
      {children}
    </ToastContext.Provider>
  );
}

export function useAppToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useAppToast must be used within ToastProvider');
  }
  return ctx;
}

