import axios, {
  AxiosHeaders,
  isCancel,
  type AxiosRequestConfig,
} from "axios";
import { useAuthStore } from "./auth-store";

/**
 * Build-time default (often localhost). When the page is opened via LAN IP
 * (e.g. http://192.168.x.x:3000) but API still points at localhost, the
 * colleague's browser would hit *their* machine — rewrite host to match the page.
 */
export function resolveApiBase(configured?: string): string {
  const raw =
    (configured ?? process.env.NEXT_PUBLIC_API_URL)?.trim() ||
    "http://localhost:3001/api";
  if (typeof window === "undefined") return raw.replace(/\/$/, "");
  try {
    const u = new URL(raw);
    const pageHost = window.location.hostname;
    if (
      pageHost &&
      pageHost !== "localhost" &&
      pageHost !== "127.0.0.1" &&
      (u.hostname === "localhost" || u.hostname === "127.0.0.1")
    ) {
      u.hostname = pageHost;
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

export function toApiError(error: unknown): ApiError {
  if (isApiCancelError(error)) {
    return new ApiError("请求已取消", 0, { code: "CANCELLED" });
  }
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      if (error.code === "ECONNABORTED") {
        return new ApiError("请求超时，请稍后重试", 0);
      }
      // axios "Network Error" = no response (server down / CORS / offline)
      return new ApiError(
        "无法连接服务器，请确认后端 (3001) 已启动",
        0,
        { code: error.code ?? "NETWORK" },
      );
    }
    const status = error.response.status;
    const payload = error.response.data;
    const message =
      (payload as { message?: string | string[] } | undefined)?.message ??
      error.message ??
      "请求失败";
    return new ApiError(
      Array.isArray(message) ? message.join(", ") : String(message),
      status,
      payload,
    );
  }
  if (error instanceof ApiError) return error;
  return new ApiError(
    error instanceof Error ? error.message : "请求失败",
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
  } = options;

  const track = shouldTrackForRouteAbort(method, path, keepalive);
  const routeController = track ? new AbortController() : null;
  if (routeController) pendingGets.add(routeController);

  const merged = mergeAbortSignals(signal, routeController?.signal);

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
    throw toApiError(error);
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
