"use client";

import hotToast, { Toaster as HotToaster, type ToastOptions } from "react-hot-toast";

const baseOptions: ToastOptions = {
  duration: 2800,
  position: "top-center",
};

/** 应用内通知（react-hot-toast），替代 sonner / 系统 alert */
export const toast = {
  success(message: string, options?: ToastOptions) {
    return hotToast.success(message, { ...baseOptions, ...options });
  },
  error(message: string, options?: ToastOptions) {
    return hotToast.error(message, { ...baseOptions, duration: 3600, ...options });
  },
  message(message: string, options?: ToastOptions) {
    return hotToast(message, { ...baseOptions, ...options });
  },
  loading(message: string, options?: ToastOptions) {
    return hotToast.loading(message, { ...baseOptions, ...options });
  },
  dismiss(id?: string) {
    hotToast.dismiss(id);
  },
};

export function AppToaster() {
  return (
    <HotToaster
      position="top-center"
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
