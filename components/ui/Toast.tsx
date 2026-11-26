'use client';

import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        className="no-print fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-md w-[calc(100vw-2rem)] sm:w-auto pointer-events-none"
      >
        {toasts.map((t) => {
          const styles =
            t.variant === 'success'
              ? 'bg-white border-emerald-200 text-emerald-900'
              : t.variant === 'error'
              ? 'bg-white border-red-200 text-red-900'
              : 'bg-white border-slate-200 text-slate-900';
          const Icon =
            t.variant === 'success'
              ? CheckCircle2
              : t.variant === 'error'
              ? AlertCircle
              : Info;
          const iconColor =
            t.variant === 'success'
              ? 'text-emerald-600'
              : t.variant === 'error'
              ? 'text-red-600'
              : 'text-teal-600';

          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-lg border shadow-lg ${styles}`}
            >
              <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconColor}`} />
              <p className="text-sm font-medium leading-snug flex-1">{t.message}</p>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="text-slate-400 hover:text-slate-600 shrink-0"
                aria-label="Tutup notifikasi"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
