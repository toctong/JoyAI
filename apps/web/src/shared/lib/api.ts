import axios, {
  AxiosHeaders,
  isCancel,
  type AxiosRequestConfig,
} from "axios";
import { useAuthStore } from "./auth-store";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

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
};

export const http = axios.create({
  baseURL: API_BASE,
  timeout: 120_000,
});

http.interceptors.request.use((config) => {
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

export function toApiError(error: unknown): ApiError {
  if (isCancel(error)) {
    return new ApiError("请求已取消", 0);
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
};

export async function api<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, token, headers, method = "GET", signal } = options;
  try {
    const config: JoyaiRequestConfig = {
      url: path,
      method,
      headers,
      signal,
      token,
    };
    if (body !== undefined) config.data = body;
    const res = await http.request<T>(config);
    if (res.status === 204) return undefined as T;
    return res.data;
  } catch (error) {
    throw toApiError(error);
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
      body: { md5, size: file.size, mimeType: file.type },
      token,
    });
    if (checked.exists && checked.asset) {
      return checked.asset;
    }
  } catch {
    // 预检失败则走正常上传
  }

  const form = new FormData();
  form.append("file", file);

  try {
    const res = await http.post<T>(path, form, {
      token,
    } as JoyaiRequestConfig);
    return res.data;
  } catch (error) {
    const err = toApiError(error);
    throw new ApiError(err.message || "上传失败", err.status, err.body);
  }
}
