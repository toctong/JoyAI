import axios from "axios";
import type {
  ImageGenerateInput,
  ImageGenerateResult,
  ImageProvider,
  VideoPollResult,
  VideoProvider,
  VideoSubmitInput,
} from "./types";
import { formatProviderErrorBody } from "./http-error";
import { resolveImageSize } from "./image-size";

function authHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function normalizeBase(baseUrl: string) {
  return baseUrl.replace(/\/$/, "");
}

const SUCCESS_STATUSES = new Set([
  "succeeded",
  "success",
  "completed",
  "done",
]);
const FAILED_STATUSES = new Set(["failed", "error", "cancelled", "canceled"]);
const QUEUED_STATUSES = new Set([
  "queued",
  "pending",
  "submitted",
  "created",
]);
const RUNNING_STATUSES = new Set([
  "running",
  "processing",
  "in_progress",
  "in-progress",
]);

/** Unwrap APIMart `{ code, data }` envelope when present. */
function unwrapPayload(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object") return {};
  const root = data as Record<string, unknown>;
  const inner = root.data;
  if (
    inner &&
    typeof inner === "object" &&
    !Array.isArray(inner) &&
    ("status" in (inner as object) ||
      "task_status" in (inner as object) ||
      "result" in (inner as object) ||
      "id" in (inner as object) ||
      "task_id" in (inner as object))
  ) {
    return inner as Record<string, unknown>;
  }
  return root;
}

function readStatus(data: unknown): string {
  const root = (data ?? {}) as Record<string, unknown>;
  const payload = unwrapPayload(data);
  return String(
    payload.status ??
      payload.task_status ??
      root.status ??
      root.task_status ??
      "",
  ).toLowerCase();
}

function pickTaskId(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const o = value as Record<string, unknown>;
  const id = o.task_id ?? o.id ?? o.taskId;
  return id != null && String(id).length ? String(id) : undefined;
}

/** Extract async task id from OpenAI / ToAPIs / APIMart submit responses. */
function extractTaskId(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const root = data as Record<string, unknown>;

  const direct = pickTaskId(root);
  if (direct) return direct;

  if (Array.isArray(root.data)) {
    for (const item of root.data) {
      const id = pickTaskId(item);
      if (id) return id;
    }
  }

  if (root.data && typeof root.data === "object" && !Array.isArray(root.data)) {
    const id = pickTaskId(root.data);
    if (id) return id;
  }

  return undefined;
}

function firstUrl(value: unknown): string | undefined {
  if (typeof value === "string" && value.length) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const u = firstUrl(item);
      if (u) return u;
    }
  }
  return undefined;
}

function mapMediaItem(
  item: unknown,
): { url?: string; b64?: string } | null {
  if (typeof item === "string") return { url: item };
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  const url =
    firstUrl(o.url) ??
    firstUrl(o.image_url) ??
    firstUrl(o.video_url) ??
    firstUrl(o.uri);
  const b64 =
    typeof o.b64_json === "string"
      ? o.b64_json
      : typeof o.b64 === "string"
        ? o.b64
        : undefined;
  if (!url && !b64) return null;
  return { url, b64 };
}

/**
 * OpenAI-compatible gateway used by APIMart / ToAPIs (and similar relays).
 */
export class OpenAICompatibleImageProvider implements ImageProvider {
  constructor(readonly platform: string) {}

  async generate(input: ImageGenerateInput): Promise<ImageGenerateResult> {
    const size = resolveImageSize({
      size: input.size,
      width: input.width,
      height: input.height,
      ratio: input.ratio,
      resolution: input.resolution,
      catalogSizes: input.catalogSizes,
      mode: input.sizeMode ?? "auto",
      fallback: "1024x1024",
    });

    const body: Record<string, unknown> = {
      model: input.model,
      prompt: input.prompt,
      n: input.n ?? 1,
      size,
      response_format: "url",
      watermark: input.watermark ?? false,
    };

    if (input.ratio && !/^\d+x\d+$/i.test(size)) {
      body.aspect_ratio = input.ratio;
      body.ratio = input.ratio;
    }

    if (input.negativePrompt) {
      body.negative_prompt = input.negativePrompt;
    }
    if (input.referenceUrls?.length) {
      body.image = input.referenceUrls[0];
      if (input.referenceUrls.length > 1) {
        body.images = input.referenceUrls;
      }
    }

    const base = normalizeBase(input.baseUrl);
    const { data } = await axios.post(`${base}/images/generations`, body, {
      headers: authHeaders(input.apiKey),
      timeout: 180_000,
      validateStatus: () => true,
    });

    // Sync OpenAI shape — only when items actually carry media
    const syncImages = extractImages(data);
    const syncStatus = readStatus(data);
    if (
      syncImages.length &&
      (!syncStatus || SUCCESS_STATUSES.has(syncStatus)) &&
      !extractTaskId(data)
    ) {
      return { images: syncImages, raw: data };
    }

    // Async task shape — poll until done
    const taskId = extractTaskId(data);
    if (taskId) {
      return this.pollImageTask({
        taskId,
        apiKey: input.apiKey,
        baseUrl: base,
        rawSubmit: data,
      });
    }

    const errMsg = formatProviderErrorBody(data, undefined, {
      platform: this.platform,
      fallback: "图片生成失败",
    });
    throw new Error(errMsg);
  }

  private async pollImageTask(params: {
    taskId: string;
    apiKey: string;
    baseUrl: string;
    rawSubmit: unknown;
  }): Promise<ImageGenerateResult> {
    const endpoints = [
      `${params.baseUrl}/tasks/${params.taskId}`,
      `${params.baseUrl}/images/generations/${params.taskId}`,
      `${params.baseUrl}/images/tasks/${params.taskId}`,
    ];

    for (let attempt = 0; attempt < 60; attempt++) {
      await sleep(2000);
      let lastError: unknown;
      for (const url of endpoints) {
        try {
          const { data, status } = await axios.get(url, {
            headers: authHeaders(params.apiKey),
            timeout: 30_000,
            validateStatus: () => true,
          });
          if (status >= 400) continue;

          const st = readStatus(data);
          if (FAILED_STATUSES.has(st) || (data as { error?: unknown })?.error) {
            throw new Error(
              formatProviderErrorBody(data, status, {
                platform: this.platform,
                fallback: st || "图片任务失败",
              }),
            );
          }

          const images = extractImages(data);
          if (images.length && (SUCCESS_STATUSES.has(st) || !st)) {
            return { images, raw: data };
          }
          if (SUCCESS_STATUSES.has(st) && !images.length) {
            throw new Error("任务已完成但未返回图片 URL");
          }
          if (images.length && attempt > 2) {
            return { images, raw: data };
          }
        } catch (e) {
          lastError = e;
          if (
            e instanceof Error &&
            (e.message.includes("图片任务失败") ||
              e.message.includes("未返回图片"))
          ) {
            throw e;
          }
        }
      }
      if (attempt === 59 && lastError) throw lastError;
    }
    throw new Error("Image task polling timed out");
  }
}

/**
 * Supports:
 * - OpenAI sync: `{ data: [{ url }] }`
 * - ToAPIs: `{ status, result: { data: [{ url }] } }`
 * - APIMart: `{ code, data: { result: { images: [{ url: [string] }] } } }`
 */
export function extractImages(
  data: Record<string, unknown> | unknown,
): Array<{ url?: string; b64?: string }> {
  const root = (data ?? {}) as Record<string, unknown>;
  const payload = unwrapPayload(data);
  const result = (payload.result ?? root.result) as
    | Record<string, unknown>
    | undefined;

  const candidates: unknown[] = [];

  const pushList = (list: unknown) => {
    if (Array.isArray(list)) candidates.push(...list);
  };

  // APIMart: result.images[].url[]
  pushList(result?.images);
  // ToAPIs: result.data[].url
  pushList(result?.data);
  pushList(result?.videos);

  // OpenAI / nested bags
  pushList(payload.data);
  pushList(payload.images);
  pushList(root.data);
  pushList((root.output as { data?: unknown[] } | undefined)?.data);

  const out: Array<{ url?: string; b64?: string }> = [];
  const seen = new Set<string>();
  for (const item of candidates) {
    const mapped = mapMediaItem(item);
    if (!mapped) continue;
    const key = mapped.url ?? mapped.b64 ?? "";
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(mapped);
  }

  if (out.length) return out;

  const single =
    firstUrl(payload.url) ??
    firstUrl(payload.image_url) ??
    firstUrl(root.url) ??
    firstUrl((result as { url?: unknown } | undefined)?.url);
  if (single) return [{ url: single }];
  return [];
}

export class OpenAICompatibleVideoProvider implements VideoProvider {
  constructor(readonly platform: string) {}

  async submit(input: VideoSubmitInput): Promise<{ remoteTaskId: string }> {
    const refs = input.referenceUrls ?? [];
    let prompt = input.prompt;
    if (input.refMode === "first_last" && refs.length > 0) {
      // Gateways rarely expose Ark-style roles; always use prompt guidance.
      prompt =
        refs.length >= 2
          ? `【首尾帧约束】请将第 1 张参考图作为视频首帧、第 2 张参考图作为视频尾帧，在两帧之间生成自然连贯的过渡动画。用户需求：${input.prompt}`
          : `【首帧约束】请将参考图作为视频首帧，据此生成后续动作。用户需求：${input.prompt}`;
    }

    const base = normalizeBase(input.baseUrl);
    const body: Record<string, unknown> = {
      model: input.model,
      prompt,
    };
    if (input.duration) body.duration = input.duration;
    if (input.resolution) body.resolution = input.resolution;
    if (input.ratio) {
      body.ratio = input.ratio;
      body.aspect_ratio = input.ratio;
      body.size = input.ratio;
    }
    if (refs.length) {
      body.image = refs[0];
      body.images = refs;
      body.input_reference = refs[0];
    }

    const paths = [
      `${base}/videos/generations`,
      `${base}/videos`,
      `${base}/video/generations`,
    ];

    let lastError = "Video submit failed";
    for (const url of paths) {
      try {
        const { data, status } = await axios.post(url, body, {
          headers: authHeaders(input.apiKey),
          timeout: 60_000,
          validateStatus: () => true,
        });
        if (status >= 400) {
          lastError = formatProviderErrorBody(data, status, {
            platform: this.platform,
            fallback: `HTTP ${status}`,
          });
          continue;
        }
        const remoteTaskId = extractTaskId(data);
        if (remoteTaskId) return { remoteTaskId };
        lastError = "Missing video task id";
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
    }
    throw new Error(lastError);
  }

  async poll(params: {
    remoteTaskId: string;
    apiKey: string;
    baseUrl: string;
  }): Promise<VideoPollResult> {
    const base = normalizeBase(params.baseUrl);
    const urls = [
      `${base}/videos/generations/${params.remoteTaskId}`,
      `${base}/tasks/${params.remoteTaskId}`,
      `${base}/videos/${params.remoteTaskId}`,
      `${base}/video/generations/${params.remoteTaskId}`,
    ];

    for (const url of urls) {
      try {
        const { data, status } = await axios.get(url, {
          headers: authHeaders(params.apiKey),
          timeout: 30_000,
          validateStatus: () => true,
        });
        if (status >= 400) continue;

        const st = readStatus(data);

        if (FAILED_STATUSES.has(st)) {
          return {
            status: "failed",
            error: formatProviderErrorBody(data, status, {
              platform: this.platform,
              fallback: st,
            }),
            raw: data,
          };
        }

        const videoUrl = extractVideoUrl(data);
        if (SUCCESS_STATUSES.has(st)) {
          if (videoUrl) {
            return { status: "succeeded", videoUrl, raw: data };
          }
          return {
            status: "failed",
            error: "任务已完成但未返回视频 URL",
            raw: data,
          };
        }
        if (videoUrl && !st) {
          return { status: "succeeded", videoUrl, raw: data };
        }
        if (QUEUED_STATUSES.has(st)) {
          return { status: "queued" };
        }
        if (RUNNING_STATUSES.has(st) || st) {
          return { status: "running" };
        }
      } catch {
        /* try next */
      }
    }
    return { status: "running" };
  }
}

/**
 * Supports:
 * - ToAPIs: `result.data[0].url`
 * - APIMart: `result.videos[0].url` (string or string[])
 * - OpenAI-ish: top-level / nested `url` / `video_url`
 */
export function extractVideoUrl(data: unknown): string | undefined {
  const root = (data ?? {}) as Record<string, unknown>;
  const payload = unwrapPayload(data);
  const result = (payload.result ?? root.result) as
    | Record<string, unknown>
    | undefined;

  const fromList = (list: unknown): string | undefined => {
    if (!Array.isArray(list)) return undefined;
    for (const item of list) {
      const mapped = mapMediaItem(item);
      if (mapped?.url) return mapped.url;
    }
    return undefined;
  };

  return (
    fromList(result?.videos) ??
    fromList(result?.data) ??
    fromList(result?.images) ??
    firstUrl(result?.url) ??
    firstUrl(result?.video_url) ??
    firstUrl(payload.video_url) ??
    firstUrl(payload.url) ??
    firstUrl((payload.content as { video_url?: unknown } | undefined)?.video_url) ??
    fromList(payload.data) ??
    firstUrl(root.url)
  );
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    (
      globalThis as unknown as {
        setTimeout: (fn: () => void, ms: number) => void;
      }
    ).setTimeout(resolve, ms);
  });
}
