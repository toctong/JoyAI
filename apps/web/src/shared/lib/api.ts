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

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  token?: string | null;
};

export async function api<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, token, headers, ...rest } = options;
  const authToken =
    token ??
    (typeof window !== "undefined" ? useAuthStore.getState().token : null);

  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      /* ignore */
    }
    const message =
      (payload as { message?: string | string[] } | null)?.message ??
      res.statusText;
    throw new ApiError(
      Array.isArray(message) ? message.join(", ") : String(message),
      res.status,
      payload,
    );
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function apiUpload<T = unknown>(
  path: string,
  file: File,
  token?: string | null,
): Promise<T> {
  const authToken =
    token ??
    (typeof window !== "undefined" ? useAuthStore.getState().token : null);

  // 前端预检：同用户同 MD5 直接复用，避免重复传文件
  try {
    const { md5HexOfFile } = await import("./content-hash");
    const md5 = await md5HexOfFile(file);
    const checked = await api<{
      exists: boolean;
      asset?: T;
    }>("/upload/check", {
      method: "POST",
      body: { md5, size: file.size, mimeType: file.type },
      token: authToken,
    });
    if (checked.exists && checked.asset) {
      return checked.asset;
    }
  } catch {
    // 预检失败则走正常上传，由服务端再按 MD5 / TOS head 去重
  }

  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    body: form,
  });

  if (!res.ok) {
    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      /* ignore */
    }
    throw new ApiError("Upload failed", res.status, payload);
  }

  return (await res.json()) as T;
}
