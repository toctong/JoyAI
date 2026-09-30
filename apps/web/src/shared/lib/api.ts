import axios, {
  AxiosHeaders,
  isCancel,
  type AxiosRequestConfig,
} from "axios";
import { useAuthStore } from "./auth-store";

export function isLoopbackHost(host: string): boolean {
  return (
    host === "localhost" || host === "127.0.0.1" || host === "[::1]"
  );
}

/**
 * Build-time default is often localhost:3001 / :18081.
 *
 * - Relative `/api` → same origin (Docker nginx → Nest; local Next rewrite).
 *   Needed for 飞牛 HTTPS / domain reverse proxy (only 80/443; :18081 blocked).
 * - Absolute localhost while the page is LAN IP or a domain → also same
 *   origin. Do **not** only swap hostname (that yields `https://domain:18081`
 *   mixed-content / firewall failures). Direct `:18081` stays for local
 *   loopback pages only.
 */
export function resolveApiBase(configured?: string): string {
  const raw =
    (configured ?? process.env.NEXT_PUBLIC_API_URL)?.trim() ||
    "http://localhost:3001/api";

  if (raw.startsWith("/")) {
    if (typeof window === "undefined") {
      return raw.replace(/\/$/, "") || "/api";
    }
    return `${window.location.origin}${raw}`.replace(/\/$/, "");
  }

  if (typeof window === "undefined") return raw.replace(/\/$/, "");

  try {
    const u = new URL(raw);
    const pageHost = window.location.hostname;
    if (
      pageHost &&
      !isLoopbackHost(pageHost) &&
      isLoopbackHost(u.hostname)
    ) {
      return `${window.location.origin}/api`.replace(/\/$/, "");
    }
    return u.toString().replace(/\/$/, "");
  } catch {
    return raw.replace(/\/$/, "");
  }
}

export const API_BASE = resolveApiBase();

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

type JoyaiRequestConfig = AxiosRequestConfig & {
  token?: string | null;
  /** 跨路由 / 切页也不取消（默认：非 GET 已保活） */
  keepalive?: boolean;
};

/**
 * 路由切换时仍要跑完的 GET 前缀白名单。
 * 写操作（POST/PUT/PATCH/DELETE）与 apiUpload 默认保活，不必写在这里。
 */
export const KEEPALIVE_GET_PREFIXES = [
  "/upload/check",
  "/media/fetch",
] as const;

/** 进行中的可取消 GET（路由切换时统一 abort） */
const pendingGets = new Set<AbortController>();

export function abortPendingGets(reason = "route-change") {
  for (const controller of pendingGets) {
    if (!controller.signal.aborted) {
      controller.abort(reason);
    }
  }
  pendingGets.clear();
}

function pathOnly(url: string) {
  const q = url.indexOf("?");
  return (q >= 0 ? url.slice(0, q) : url).replace(/\/$/, "") || "/";
}

function isKeepaliveGet(path: string) {
  const p = pathOnly(path);
  return KEEPALIVE_GET_PREFIXES.some(
    (prefix) => p === prefix || p.startsWith(`${prefix}/`),
  );
}

function shouldTrackForRouteAbort(
  method: string,
  path: string,
  keepalive?: boolean,
) {
  if (keepalive) return false;
  const m = method.toUpperCase();
  if (m !== "GET" && m !== "HEAD") return false;
  if (isKeepaliveGet(path)) return false;
  return true;
}

function mergeAbortSignals(
  a?: AbortSignal | null,
  b?: AbortSignal | null,
): AbortSignal | undefined {
  if (!a && !b) return undefined;
  if (a && !b) return a;
  if (!a && b) return b;
  const anyFn = (
    AbortSignal as typeof AbortSignal & {
      any?: (signals: AbortSignal[]) => AbortSignal;
    }
  ).any;
  if (typeof anyFn === "function") return anyFn([a!, b!]);

  const merged = new AbortController();
  const forward = () => {
    if (!merged.signal.aborted) merged.abort();
  };
  if (a!.aborted || b!.aborted) {
    forward();
    return merged.signal;
  }
  a!.addEventListener("abort", forward, { once: true });
  b!.addEventListener("abort", forward, { once: true });
  return merged.signal;
}

export const http = axios.create({
  baseURL: API_BASE,
  timeout: 120_000,
});

http.interceptors.request.use((config) => {
  // Re-resolve per request so client bundles that SSR'd with localhost still work on LAN.
  config.baseURL = resolveApiBase();
  const headers = AxiosHeaders.from(config.headers);
  const explicit = (config as JoyaiRequestConfig).token;
  const token =
    explicit !== undefined
      ? explicit
      : typeof window !== "undefined"
        ? useAuthStore.getState().token
        : null;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  config.headers = headers;
  return config;
});

export function isApiCancelError(error: unknown): boolean {
  if (isCancel(error)) return true;
  if (axios.isAxiosError(error) && error.code === "ERR_CANCELED") return true;
  if (
    error instanceof ApiError &&
    (error.body as { code?: string } | undefined)?.code === "CANCELLED"
  ) {
    return true;
  }
  if (error instanceof DOMException && error.name === "AbortError") return true;
  return false;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Backend hot-reload / brief Redis blip — safe to retry once or twice. */
function isTransientNetworkFailure(error: unknown): boolean {
  if (isApiCancelError(error)) return false;
  if (error instanceof ApiError) {
    if (error.status === 502 || error.status === 503 || error.status === 504) {
      return true;
    }
    const code = (error.body as { code?: string } | undefined)?.code;
    return (
      error.status === 0 &&
      (code === "NETWORK" ||
        code === "ECONNREFUSED" ||
        code === "ECONNRESET" ||
        code === "ERR_NETWORK" ||
        code === "ENOTFOUND")
    );
  }
  if (!axios.isAxiosError(error)) return false;
  if (error.response) {
    const s = error.response.status;
    return s === 502 || s === 503 || s === 504;
  }
  const code = error.code ?? "";
  return (
    code === "ECONNREFUSED" ||
    code === "ECONNRESET" ||
    code === "ERR_NETWORK" ||
    code === "ENOTFOUND" ||
    code === "ETIMEDOUT" ||
    /network error/i.test(error.message)
  );
}

function stringifyApiMessage(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    return raw
      .map((item) => (typeof item === "string" ? item : stringifyApiMessage(item)))
      .filter(Boolean)
      .join("；");
  }
  if (typeof raw === "object") {
    const obj = raw as {
      formErrors?: string[];
      fieldErrors?: Record<string, string[] | undefined>;
      message?: unknown;
    };
    if (obj.message != null && obj.message !== raw) {
      return stringifyApiMessage(obj.message);
    }
    const parts: string[] = [];
    if (Array.isArray(obj.formErrors)) parts.push(...obj.formErrors.filter(Boolean));
    if (obj.fieldErrors) {
      for (const [key, msgs] of Object.entries(obj.fieldErrors)) {
        if (!msgs?.length) continue;
        parts.push(`${key}: ${msgs.join("、")}`);
      }
    }
    if (parts.length) return parts.slice(0, 8).join("；");
  }
  return "";
}

function humanizeApiMessage(message: string, status: number): string {
  const text = message.trim();
  if (!text || text === "[object Object]") {
    if (status === 0) return "无法连接服务器，请确认后端已启动或稍候重试";
    if (status >= 500) return "服务内部错误，请稍后重试";
    return "请求失败，请稍后重试";
  }
  const lower = text.toLowerCase();
  if (
    lower === "internal server error" ||
    lower === "internal error" ||
    text === "Internal Server Error"
  ) {
    return "服务内部错误，请稍后重试";
  }
  if (status === 502 || lower === "bad gateway") return "网关错误，请稍后重试";
  if (status === 503 || lower === "service unavailable") {
    return "服务暂不可用，请稍后重试";
  }
  if (status === 504 || lower === "gateway timeout") {
    return "网关超时，请稍后重试";
  }
  if (status === 429) return "请求过于频繁，请稍后重试";
  return text.length > 280 ? `${text.slice(0, 280)}…` : text;
}

export function toApiError(error: unknown): ApiError {
  if (isApiCancelError(error)) {
    return new ApiError("请求已取消", 0, { code: "CANCELLED" });
  }
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      if (error.code === "ECONNABORTED") {
        return new ApiError("请求超时，请稍后重试", 0);
      }
      const code = error.code ?? "NETWORK";
      const hint =
        code === "ECONNREFUSED"
          ? "无法连接服务器（连接被拒绝）。后端可能正在重启，请稍后重试"
          : "无法连接服务器，请确认后端 (3001) 已启动";
      return new ApiError(hint, 0, { code });
    }
    const status = error.response.status;
    const payload = error.response.data;
    const raw =
      stringifyApiMessage(
        (payload as { message?: unknown } | undefined)?.message,
      ) ||
      stringifyApiMessage(payload) ||
      error.message ||
      "请求失败";
    return new ApiError(humanizeApiMessage(raw, status), status, payload);
  }
  if (error instanceof ApiError) {
    return new ApiError(
      humanizeApiMessage(error.message, error.status),
      error.status,
      error.body,
    );
  }
  return new ApiError(
    humanizeApiMessage(
      error instanceof Error ? error.message : "请求失败",
      0,
    ),
    0,
  );
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /**
   * 为 true 时不参与「切路由取消」。
   * 写操作默认已保活；仅特殊长耗时 GET 需要显式打开。
   */
  keepalive?: boolean;
  /** 关闭网络闪断重试（默认开启，最多 2 次） */
  noRetry?: boolean;
};

export async function api<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const {
    body,
    token,
    headers,
    method = "GET",
    signal,
    keepalive,
    noRetry,
  } = options;

  const track = shouldTrackForRouteAbort(method, path, keepalive);
  const routeController = track ? new AbortController() : null;
  if (routeController) pendingGets.add(routeController);

  const merged = mergeAbortSignals(signal, routeController?.signal);
  const maxAttempts = noRetry ? 1 : 3;

  try {
    let lastError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const config: JoyaiRequestConfig = {
          url: path,
          method,
          headers,
          signal: merged,
          token,
          keepalive,
        };
        if (body !== undefined) config.data = body;
        const res = await http.request<T>(config);
        if (res.status === 204) return undefined as T;
        return res.data;
      } catch (error) {
        lastError = error;
        const canRetry =
          attempt < maxAttempts - 1 &&
          isTransientNetworkFailure(error) &&
          !merged?.aborted;
        if (!canRetry) throw toApiError(error);
        await sleep(350 * (attempt + 1));
      }
    }
    throw toApiError(lastError);
  } finally {
    if (routeController) pendingGets.delete(routeController);
  }
}

export async function apiUpload<T = unknown>(
  path: string,
  file: File,
  token?: string | null,
): Promise<T> {
  try {
    const { md5HexOfFile } = await import("./content-hash");
    const md5 = await md5HexOfFile(file);
    const checked = await api<{
      exists: boolean;
      asset?: T;
    }>("/upload/check", {
      method: "POST",
      body: {
        md5,
        size: file.size,
        mimeType: file.type,
        originalName: file.name || undefined,
      },
      token,
      keepalive: true,
    });
    if (checked.exists && checked.asset) {
      return checked.asset;
    }
  } catch (error) {
    if (!isApiCancelError(error)) {
      // 预检失败则走正常上传
    }
  }

  const form = new FormData();
  form.append("file", file);

  try {
    const res = await http.post<T>(path, form, {
      token,
      keepalive: true,
    } as JoyaiRequestConfig);
    return res.data;
  } catch (error) {
    if (isApiCancelError(error)) throw toApiError(error);
    const err = toApiError(error);
    throw new ApiError(err.message || "上传失败", err.status, err.body);
  }
}

/**
 * Binary GET via Fetch (not axios XHR). Avoids DevTools/inspector hooks that
 * crash on XMLHttpRequest.responseText when responseType is "blob".
 */
export async function apiFetchBlob(
  path: string,
  options: {
    params?: Record<string, string>;
    token?: string | null;
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {},
): Promise<Blob> {
  const { params, token: explicitToken, signal, timeoutMs = 180_000 } = options;
  const base = resolveApiBase();
  const url = new URL(
    path.startsWith("http")
      ? path
      : `${base}${path.startsWith("/") ? path : `/${path}`}`,
  );
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value != null && value !== "") url.searchParams.set(key, value);
    }
  }

  const token =
    explicitToken !== undefined
      ? explicitToken
      : typeof window !== "undefined"
        ? useAuthStore.getState().token
        : null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const merged = mergeAbortSignals(signal, controller.signal);

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal: merged,
      credentials: "omit",
    });
    const blob = await res.blob();
    if (!res.ok) {
      let message = `请求失败 (${res.status})`;
      if (blob.type.includes("json") || blob.size < 4096) {
        try {
          const parsed = JSON.parse(await blob.text()) as {
            message?: string | string[];
          };
          if (parsed.message) {
            message = Array.isArray(parsed.message)
              ? parsed.message.join(", ")
              : parsed.message;
          }
        } catch {
          /* keep status message */
        }
      }
      throw new ApiError(message, res.status);
    }
    return blob;
  } catch (error) {
    if (isApiCancelError(error)) throw toApiError(error);
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError("请求超时，请稍后重试", 0);
    }
    throw toApiError(error);
  } finally {
    clearTimeout(timer);
  }
}
