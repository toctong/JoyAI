import axios from "axios";
import {
  formatParsedProviderError,
  parseProviderErrorBody,
  type ProviderErrorPlatform,
} from "./error-codes";

export type FormatProviderErrorOptions = {
  platform?: ProviderErrorPlatform;
  fallback?: string;
};

/** Extract a Chinese-friendly message from provider HTTP / body failures. */
export function formatProviderError(
  error: unknown,
  fallbackOrOpts: string | FormatProviderErrorOptions = "请求失败",
): string {
  const opts: FormatProviderErrorOptions =
    typeof fallbackOrOpts === "string"
      ? { fallback: fallbackOrOpts }
      : fallbackOrOpts;
  const fallback = opts.fallback ?? "请求失败";

  if (!axios.isAxiosError(error)) {
    if (error instanceof Error) {
      // Already formatted Chinese message from our throw paths
      return error.message || fallback;
    }
    return fallback;
  }

  const status = error.response?.status;
  const parsed = parseProviderErrorBody(error.response?.data, status);
  if (!parsed.message && !parsed.code && error.message) {
    // network / timeout without body
    if (error.code === "ECONNABORTED") {
      return formatParsedProviderError(
        { code: "Timeout", status, message: "timeout" },
        { platform: opts.platform, fallback },
      );
    }
    if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
      return "无法连接上游服务，请检查 Base URL 或网络";
    }
  }

  return formatParsedProviderError(parsed, {
    platform: opts.platform,
    fallback,
  });
}

/** Format an already-parsed JSON body (e.g. validateStatus: () => true paths). */
export function formatProviderErrorBody(
  data: unknown,
  status?: number,
  opts?: FormatProviderErrorOptions,
): string {
  return formatParsedProviderError(parseProviderErrorBody(data, status), {
    platform: opts?.platform,
    fallback: opts?.fallback ?? "请求失败",
  });
}
