"use client";

import hotToast, {
  Toaster as HotToaster,
  type ToastOptions,
} from "react-hot-toast";

const baseOptions: ToastOptions = {
  duration: 2800,
  position: "top-center",
};

/** Same text within a short window updates one toast instead of stacking clones. */
function dedupeId(kind: string, message: string, options?: ToastOptions) {
  if (options?.id != null) return options.id;
  const key = message.length > 160 ? message.slice(0, 160) : message;
  return `joy:${kind}:${key}`;
}

/** 应用内通知（react-hot-toast），替代 sonner / 系统 alert */
export const toast = {
  success(message: string, options?: ToastOptions) {
    return hotToast.success(message, {
      ...baseOptions,
      id: dedupeId("ok", message, options),
      ...options,
    });
  },
  error(message: string, options?: ToastOptions) {
    return hotToast.error(message, {
      ...baseOptions,
      duration: 3600,
      id: dedupeId("err", message, options),
      ...options,
    });
  },
  message(message: string, options?: ToastOptions) {
    return hotToast(message, {
      ...baseOptions,
      id: dedupeId("msg", message, options),
      ...options,
    });
  },
  loading(message: string, options?: ToastOptions) {
    return hotToast.loading(message, {
      ...baseOptions,
      id: dedupeId("load", message, options),
      ...options,
    });
  },
  dismiss(id?: string) {
    hotToast.dismiss(id);
  },
};

export function AppToaster() {
  return (
    <HotToaster
      position="top-center"
      gutter={10}
      toastOptions={{
        className: "joy-toast",
        style: {
          background: "var(--card)",
          color: "var(--card-foreground)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          fontSize: "14px",
          padding: "10px 14px",
          boxShadow: "0 10px 30px color-mix(in oklab, #000 14%, transparent)",
          maxWidth: "420px",
        },
        success: {
          iconTheme: {
            primary: "var(--foreground)",
            secondary: "var(--background)",
          },
        },
        error: {
          iconTheme: {
            primary: "var(--destructive)",
            secondary: "var(--destructive-foreground)",
          },
        },
      }}
    />
  );
}
