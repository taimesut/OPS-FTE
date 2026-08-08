/* eslint-disable react-refresh/only-export-components */
import { useState, useEffect } from "react";
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

type ToastListener = (toast: ToastMessage) => void;

const listeners: Set<ToastListener> = new Set();

export const showToast = (
  message: string,
  type: ToastType = "info",
  duration = 4000
) => {
  const id = Math.random().toString(36).substring(2, 9);
  const toast: ToastMessage = { id, type, message, duration };
  listeners.forEach((listener) => listener(toast));
};

export const ToastContainer = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handleToast = (toast: ToastMessage) => {
      setToasts((prev) => [...prev, toast]);

      if (toast.duration && toast.duration > 0) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== toast.id));
        }, toast.duration);
      }
    };

    listeners.add(handleToast);
    return () => {
      listeners.delete(handleToast);
    };
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="toast toast-top toast-center z-50 w-[calc(100vw-1.5rem)] max-w-sm space-y-2 p-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:toast-end sm:p-4">
      {toasts.map((toast) => {
        const getAlertClass = () => {
          switch (toast.type) {
            case "success":
              return "alert-success text-success-content";
            case "error":
              return "alert-error text-error-content";
            case "warning":
              return "alert-warning text-warning-content";
            case "info":
            default:
              return "alert-info text-info-content";
          }
        };

        const getIcon = () => {
          switch (toast.type) {
            case "success":
              return <CheckCircle2 className="w-5 h-5 flex-shrink-0" />;
            case "error":
              return <AlertCircle className="w-5 h-5 flex-shrink-0" />;
            case "warning":
              return <AlertTriangle className="w-5 h-5 flex-shrink-0" />;
            case "info":
            default:
              return <Info className="w-5 h-5 flex-shrink-0" />;
          }
        };

        return (
          <div
            key={toast.id}
            className={`alert ${getAlertClass()} min-w-0 items-start justify-between gap-2 rounded-xl border border-white/10 shadow-lg transition-all duration-300 animate-in fade-in slide-in-from-top-2`}
          >
            <div className="flex min-w-0 flex-1 items-center gap-3 pr-1">
              {getIcon()}
              <span className="text-sm font-medium break-words leading-snug">
                {toast.message}
              </span>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="btn btn-xs btn-ghost btn-circle min-h-11 min-w-11 shrink-0 opacity-70 hover:opacity-100"
              aria-label="Đóng thông báo"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
