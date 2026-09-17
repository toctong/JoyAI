import axios from "axios";
import {
  ProviderPlatform,
  resolveImageProtocol,
  type ImageProtocolProfile,
  type ModelProtocol,
} from "@joyai/shared";
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
import { rewritePromptMentionsForApi } from "./prompt-mentions";

function authHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function normalizeBase(baseUrl: string) {
  return baseUrl.replace(/\/$/, "");
}

const FLEXIBLE_RATIO = new Set(["auto", "adaptive", "keep"]);

/** ToAPIs bills on K-tier (`1K`/`2K`); never send OpenAI-style `2048x2048`. */
function normalizeKTier(raw?: string): string | undefined {
  if (!raw?.trim()) return undefined;
  const key = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (key === "1k") return "1K";
  if (key === "1.5k" || key === "1_5k") return "1.5K";
  if (key === "2k") return "2K";
  if (key === "3k") return "3K";
  if (key === "4k") return "4K";
  return raw.trim();
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

/**
 * ToAPIs `size` is an aspect ratio (`1:1`), not pixel WxH.
 * @see https://docs.toapis.com/docs/cn/api-reference/images/flux-2/generation
 */
function resolveToApisAspectSize(input: ImageGenerateInput): string {
  const ratio = input.ratio?.trim();
  if (ratio && !FLEXIBLE_RATIO.has(ratio.toLowerCase()) && /^\d+:\d+$/.test(ratio)) {
    return ratio;
  }
  const size = input.size?.trim();
  if (size && /^\d+:\d+$/.test(size)) return size;
  if (size) {
    const m = size.match(/^(\d+)\s*[x×]\s*(\d+)$/i);
    if (m) {
      const w = Number(m[1]);
      const h = Number(m[2]);
      if (w > 0 && h > 0) {
        const g = gcd(w, h);
        return `${w / g}:${h / g}`;
      }
    }
  }
  if (input.width && input.height) {
    const g = gcd(input.width, input.height);
    return `${input.width / g}:${input.height / g}`;
  }
  return "1:1";
}

/** Models that only accept prompt/size/n — no resolution tier or watermark metadata. */
function isToApisBareImageModel(model: string): boolean {
  return (
    /^grok-imagine-1\.0$/i.test(model) || /^grok-4-\d-image$/i.test(model)
  );
}

function isToApisImageEditModel(model: string): boolean {
  return /^(grok-imagine-1\.0-edit)$/i.test(model) || /-edit$/i.test(model);
}

/**
 * Build ToAPIs image body: ratio-as-size + optional resolution + image_urls.
 * Prefer `profile` from capabilities.protocol; regex is fallback only.
 */
function buildToApisImageBody(
  input: ImageGenerateInput,
  profile?: ImageProtocolProfile,
): Record<string, unknown> {
  const isEdit =
    profile === "toapis-edit" ||
    (!profile && isToApisImageEditModel(input.model));
  const resolution = normalizeKTier(input.resolution);
  const isGptImage =
    profile === "toapis-gpt-image" ||
    (!profile && /^gpt-image/i.test(input.model));
  const bare =
    profile === "toapis-bare" ||
    (!profile && isToApisBareImageModel(input.model));

  if (isEdit) {
    const body: Record<string, unknown> = {
      model: input.model,
      prompt: input.prompt,
      n: input.n ?? 1,
    };
    if (input.referenceUrls?.length) {
      body.image_urls = input.referenceUrls;
    }
    return body;
  }

  const size = resolveToApisAspectSize(input);
  const body: Record<string, unknown> = {
    model: input.model,
    prompt: input.prompt,
    n: input.n ?? 1,
    size,
  };

  // GPT-Image docs use response_format; bare Grok models omit it.
  if (!bare) {
    body.response_format = "url";
  }

  if (isGptImage) {
    if (resolution) body.resolution = resolution.toLowerCase();
  } else if (!bare) {
    if (resolution) body.resolution = resolution;
    const metadata: Record<string, unknown> = {
      watermark: input.watermark ?? false,
    };
    if (resolution) metadata.resolution = resolution;
    body.metadata = metadata;
  }

  if (input.negativePrompt) {
    body.negative_prompt = input.negativePrompt;
  }
  if (input.referenceUrls?.length) {
    body.image_urls = input.referenceUrls;
  }

  return body;
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
 * Default OpenAI-compatible image body (DashScope-style).
 * Uses pixel WxH or keyword size — not APIMart / ToAPIs ratio-as-size.
 */
function buildOpenAICompatImageBody(
  input: ImageGenerateInput,
): Record<string, unknown> {
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

  return body;
}

/**
 * APIMart image body: aspect-ratio `size`, optional K-tier `resolution`, `image_urls`.
 * Never send `width`/`height` — Flux Kontext and peers fail the async task if present.
 * @see https://docs.apimart.ai/en/api-reference/images/flux-kontext/generation
 */
const APIMART_MODEL_ALIASES: Record<string, string> = {
  "gpt-image-1": "gpt-image-1-official",
  "gpt-image-1.5": "gpt-image-1.5-official",
  "flux-2": "flux-2-pro",
};

function resolveApiMartModelId(model: string): string {
  return APIMART_MODEL_ALIASES[model] ?? model;
}

function buildApiMartImageBody(
  input: ImageGenerateInput,
  profile?: ImageProtocolProfile,
): Record<string, unknown> {
  // Prefer catalog/protocol alias; keep hardcoded map as safety net.
  const model = resolveApiMartModelId(input.model);
  const resolution = normalizeKTier(input.resolution);
  const isGptImage =
    profile === "apimart-gpt-image" ||
    profile === "apimart-gpt-image-1" ||
    (!profile && /^gpt-image/i.test(model));
  const isGptImage1Family =
    profile === "apimart-gpt-image-1" ||
    (!profile && /^gpt-image-1(\.5)?(-official)?$/i.test(model));
  const isFluxKontext =
    profile === "apimart-flux-kontext" ||
    (!profile && /^flux-kontext/i.test(model));
  // Official xAI async models reject `size`; use aspect_ratio + resolution.
  const isGrokImagineXai =
    profile === "apimart-grok-imagine" ||
    (!profile && /^grok-imagine-image/i.test(model));

  if (isGrokImagineXai) {
    const ratio = input.ratio?.trim();
    const aspectRatio =
      ratio && FLEXIBLE_RATIO.has(ratio.toLowerCase())
        ? "auto"
        : ratio && /^\d+:\d+(\.\d+)?$/.test(ratio)
          ? ratio
          : resolveToApisAspectSize(input);

    const body: Record<string, unknown> = {
      model,
      prompt: input.prompt,
      n: input.n ?? 1,
      aspect_ratio: aspectRatio,
    };
    if (resolution) body.resolution = resolution.toLowerCase();
    if (input.referenceUrls?.length) {
      body.image_urls = input.referenceUrls;
    }
    return body;
  }

  const size = resolveToApisAspectSize(input);
  const body: Record<string, unknown> = {
    model,
    prompt: input.prompt,
    n: input.n ?? 1,
    size,
  };

  // GPT Image 1/1.5 use quality tiers, not K-resolution. Kontext ignores resolution.
  // Seedream / Flux.2 / GPT Image 2 accept resolution when the UI sends it.
  if (!isFluxKontext && !isGptImage1Family && resolution) {
    body.resolution = isGptImage ? resolution.toLowerCase() : resolution;
  }

  if (input.negativePrompt) {
    body.negative_prompt = input.negativePrompt;
  }
  if (input.referenceUrls?.length) {
    body.image_urls = input.referenceUrls;
  }

  return body;
}

function isToApisProfile(profile: ImageProtocolProfile | undefined): boolean {
  return (
    profile === "toapis-default" ||
    profile === "toapis-gpt-image" ||
    profile === "toapis-bare" ||
    profile === "toapis-edit"
  );
}

function isApiMartProfile(profile: ImageProtocolProfile | undefined): boolean {
  return (
    profile === "apimart-default" ||
    profile === "apimart-gpt-image" ||
    profile === "apimart-gpt-image-1" ||
    profile === "apimart-flux-kontext" ||
    profile === "apimart-grok-imagine"
  );
}

/** Resolve dialect from input.protocol or infer from platform + model. */
function resolveInputImageProtocol(
  platform: string,
  input: ImageGenerateInput,
): ModelProtocol {
  const fromInput = input.protocol
    ? ({
        imageProfile: input.protocol.imageProfile as
          | ImageProtocolProfile
          | undefined,
        modelAlias: input.protocol.modelAlias,
        imagePath: input.protocol.imagePath,
      } satisfies ModelProtocol)
    : null;
  return resolveImageProtocol(platform, input.model, fromInput);
}

function buildImageBodyByProfile(
  platform: string,
  input: ImageGenerateInput,
  protocol: ModelProtocol,
): Record<string, unknown> {
  const profile = protocol.imageProfile as ImageProtocolProfile | undefined;
  const effective: ImageGenerateInput = protocol.modelAlias
    ? { ...input, model: protocol.modelAlias }
    : input;

  if (isToApisProfile(profile)) {
    return buildToApisImageBody(effective, profile);
  }
  if (isApiMartProfile(profile)) {
    return buildApiMartImageBody(effective, profile);
  }

  // Legacy platform fallback when profile missing / openai-default
  if (platform === ProviderPlatform.TOAPIS) {
    return buildToApisImageBody(effective, profile);
  }
  if (platform === ProviderPlatform.APIMART) {
    return buildApiMartImageBody(effective, profile);
  }
  return buildOpenAICompatImageBody(effective);
}

function resolveImagePath(
  platform: string,
  model: string,
  protocol: ModelProtocol,
): "generations" | "edits" {
  if (protocol.imagePath === "edits" || protocol.imagePath === "generations") {
    return protocol.imagePath;
  }
  if (protocol.imageProfile === "toapis-edit") return "edits";
  if (platform === ProviderPlatform.TOAPIS && isToApisImageEditModel(model)) {
    return "edits";
  }
  return "generations";
}

/**
 * OpenAI-compatible gateway used by APIMart / ToAPIs (and similar relays).
 */
export class OpenAICompatibleImageProvider implements ImageProvider {
  readonly adapterId = "openai-images";
  constructor(readonly platform: string) {}

  async generate(input: ImageGenerateInput): Promise<ImageGenerateResult> {
    const refs = (input.referenceUrls ?? []).filter(Boolean);
    const prompt = rewritePromptMentionsForApi(input.prompt, {
      maxImages: refs.length || undefined,
    });
    const next = prompt === input.prompt ? input : { ...input, prompt };
    const protocol = resolveInputImageProtocol(this.platform, next);
    const body = buildImageBodyByProfile(this.platform, next, protocol);
    const imagePath = resolveImagePath(this.platform, next.model, protocol);

    const base = normalizeBase(next.baseUrl);
    const path = `${base}/images/${imagePath}`;
    const { data } = await axios.post(path, body, {
      headers: authHeaders(next.apiKey),
      timeout: 180_000,
      validateStatus: () => true,
    });

    // Sync OpenAI shape — only when items actually carry media
    const syncImages = extractImages(data);
    const syncStatus = readStatus(data);
    const taskId = extractTaskId(data);

    // Catalog `async: true` → prefer task poll when a task id is present
    if (next.async && taskId) {
      return this.pollImageTask({
        taskId,
        apiKey: next.apiKey,
        baseUrl: base,
        rawSubmit: data,
      });
    }

    if (
      syncImages.length &&
      (!syncStatus || SUCCESS_STATUSES.has(syncStatus)) &&
      !taskId
    ) {
      return { images: syncImages, raw: data };
    }

    // Async task shape — poll until done
    if (taskId) {
      return this.pollImageTask({
        taskId,
        apiKey: next.apiKey,
        baseUrl: base,
        rawSubmit: data,
      });
    }

    if (next.async) {
      throw new Error(
        formatProviderErrorBody(data, undefined, {
          platform: this.platform,
          fallback: "异步图片任务未返回 task id",
        }),
      );
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
    const pollParams =
      this.platform === ProviderPlatform.APIMART
        ? { language: "zh" }
        : undefined;

    // ~8 min @ 2s (slow async gateways / peak queues)
    for (let attempt = 0; attempt < 240; attempt++) {
      await sleep(2000);
      let lastError: unknown;
      for (const url of endpoints) {
        try {
          const { data, status } = await axios.get(url, {
            headers: authHeaders(params.apiKey),
            params: pollParams,
            timeout: 30_000,
            validateStatus: () => true,
          });
          if (status >= 400) continue;

          const st = readStatus(data);
          const payload = unwrapPayload(data);
          const nestedError =
            (payload as { error?: unknown }).error ??
            (data as { error?: unknown })?.error;
          if (FAILED_STATUSES.has(st) || nestedError) {
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
          // validateStatus never rejects — any Error here is a terminal
          // business failure (failed task / missing URL). Do not swallow.
          if (e instanceof Error) throw e;
          lastError = e;
        }
      }
      if (attempt === 239 && lastError) throw lastError;
    }
    throw new Error("图片任务轮询超时，请稍后重试");
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

function normalizeVideoResolution(res?: string): string | undefined {
  if (!res?.trim()) return undefined;
  return res.trim().toLowerCase();
}

/** Strip Ark dated IDs / legacy aliases so ToAPIs public names are used. */
function normalizeToapisVideoModelId(model: string): string {
  let id = model.trim();
  const dated = id.match(/^(doubao-seedance-[\w.-]+?)-\d{6}$/i);
  if (dated?.[1]) id = dated[1];
  // Marketplace uses underscore for legacy Omni Flash; hyphen redirects here.
  if (/^gemini-omni-flash$/i.test(id)) return "gemini_omni_flash";
  // Broken ChannelCapability id → official Vertex SKU
  if (/^gemini_omni$/i.test(id)) return "gemini-omni-flash-preview-official";
  if (/^sora-2$/i.test(id)) return "sora-2-official";
  return id;
}

/**
 * ToAPIs video dialect — do not shotgun ratio/size/image aliases.
 * @see https://docs.toapis.com/docs/cn/api-reference/videos/
 */
function buildToapisVideoBody(input: VideoSubmitInput): Record<string, unknown> {
  const model = normalizeToapisVideoModelId(input.model);
  const refs = (input.referenceUrls ?? []).filter(Boolean);
  const resolution = normalizeVideoResolution(input.resolution);
  const body: Record<string, unknown> = {
    model,
    prompt: input.prompt,
  };
  if (input.duration != null) body.duration = input.duration;
  // Safe to send even for Kling Turbo i2v (upstream ignores; follows first frame).
  if (input.ratio) body.aspect_ratio = input.ratio;

  const id = model.toLowerCase();

  if (id.includes("doubao-seedance-1-5")) {
    const metadata: Record<string, unknown> = { audio: true };
    if (resolution) metadata.resolution = resolution;
    body.metadata = metadata;
    if (refs.length > 0) {
      // 1.5 Pro: 仅首尾帧，无 reference 角色；优先 image_with_roles
      const roles: Array<{ url: string; role: string }> = [
        { url: refs[0]!, role: "first_frame" },
      ];
      if (refs[1]) roles.push({ url: refs[1], role: "last_frame" });
      body.image_with_roles = roles;
    }
    return body;
  }

  if (id.includes("doubao-seedance-1-0")) {
    const isFast = id.includes("fast");
    let res = resolution;

    if (refs.length > 0) {
      if (isFast) {
        // Fast: 仅单图图生视频；用 image_urls（1 张=首帧）。不支持 last_frame。
        body.image_urls = [refs[0]!];
      } else if (
        input.refMode === "first_last" ||
        refs.length >= 2
      ) {
        // Quality: 1 张=首帧，2 张=首+尾（docs image_urls 兼容规则）
        body.image_urls = refs.slice(0, 2);
      } else {
        // 单张风格参考
        body.image_with_roles = [{ url: refs[0]!, role: "reference" }];
        if (res === "1080p") res = "720p";
      }
    }
    if (res) body.resolution = res;
    return body;
  }

  if (id.startsWith("grok-video")) {
    // 1.0: only 6 / 10s; 1.5: 1–15s. Clamp so stale UI prefs can't send 8s on 1.0.
    const allowed =
      /grok-video-1\.0\b/i.test(id)
        ? [6, 10]
        : Array.from({ length: 15 }, (_, i) => i + 1);
    let duration = input.duration;
    if (typeof duration === "number" && Number.isFinite(duration)) {
      let best = allowed[0]!;
      let bestDist = Math.abs(duration - best);
      for (const d of allowed) {
        const dist = Math.abs(duration - d);
        if (dist < bestDist) {
          best = d;
          bestDist = dist;
        }
      }
      duration = best;
    } else {
      duration = /grok-video-1\.0\b/i.test(id) ? 6 : 8;
    }
    body.duration = duration;

    if (resolution) {
      // ToAPIs Grok: 480p / 720p (1.5 t2v/i2v may allow 1080p on some channels)
      const r = resolution.toLowerCase();
      body.resolution =
        r === "1080p" && /grok-video-1\.0\b/i.test(id) ? "720p" : resolution;
    }

    if (refs.length === 0) {
      body.video_generation_mode = "text_to_video";
    } else if (
      input.refMode === "first_last" ||
      refs.length === 1 ||
      /grok-video-1\.5\b/i.test(id)
    ) {
      // Single image → first-frame; 1.5 docs also accept reference mode but
      // first_frame is the common i2v path.
      body.video_generation_mode = "first_frame_image_to_video";
      body.image = refs[0];
    } else {
      body.video_generation_mode = "reference_images_to_video";
      body.reference_images = refs.slice(0, 7);
    }
    return body;
  }

  // Gemini Omni / Veo / Kling / default ToAPIs video
  if (resolution) body.resolution = resolution;
  if (refs.length > 0) {
    // Legacy Omni Flash: image_urls 仅允许 0 / 1 / 3 张，禁止 2 张
    // @see https://docs.toapis.com/docs/cn/api-reference/videos/gemini-omni-flash/generation
    if (
      /gemini[_-]?omni[_-]?flash/i.test(id) &&
      !/official/i.test(id) &&
      refs.length === 2
    ) {
      throw new Error(
        "Gemini Omni Flash 参考图只支持 1 张或 3 张，不支持 2 张",
      );
    }
    // Kling Turbo docs use reference_images as first_frame; keep image_urls for others.
    if (/kling-3\.0-turbo|kling-v3-turbo/i.test(id)) {
      body.reference_images = refs.slice(0, 1);
    } else {
      body.image_urls = refs.slice(0, 10);
    }
  }
  return body;
}

function buildGenericOpenAIVideoBody(
  input: VideoSubmitInput,
): Record<string, unknown> {
  const refs = input.referenceUrls ?? [];
  let prompt = input.prompt;
  if (input.refMode === "first_last" && refs.length > 0) {
    prompt =
      refs.length >= 2
        ? `【首尾帧约束】请将第 1 张参考图作为视频首帧、第 2 张参考图作为视频尾帧，在两帧之间生成自然连贯的过渡动画。用户需求：${input.prompt}`
        : `【首帧约束】请将参考图作为视频首帧，据此生成后续动作。用户需求：${input.prompt}`;
  }

  const body: Record<string, unknown> = {
    model: input.model,
    prompt,
  };
  if (input.duration) body.duration = input.duration;
  if (input.resolution) body.resolution = normalizeVideoResolution(input.resolution);
  if (input.ratio) {
    body.aspect_ratio = input.ratio;
  }
  if (refs.length) {
    body.image_urls = refs;
    body.image = refs[0];
  }
  return body;
}

export class OpenAICompatibleVideoProvider implements VideoProvider {
  readonly adapterId = "openai-videos";
  constructor(readonly platform: string) {}

  async submit(input: VideoSubmitInput): Promise<{ remoteTaskId: string }> {
    const refs = (input.referenceUrls ?? []).filter(Boolean);
    const prompt = rewritePromptMentionsForApi(input.prompt, {
      maxImages: refs.length || undefined,
      maxVideos: refs.filter((u) => /\.(mp4|webm|mov)(\?|$)/i.test(u)).length || undefined,
      maxAudios:
        refs.filter((u) =>
          /\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/i.test(u),
        ).length || undefined,
    });
    const withMentions =
      prompt === input.prompt ? input : { ...input, prompt };
    const isToapis = this.platform.trim().toLowerCase() === "toapis";
    let submitInput = withMentions;
    if (
      isToapis &&
      withMentions.refMode === "first_last" &&
      withMentions.firstLastViaPrompt
    ) {
      // ToAPIs Seedance/Grok use native roles; skip prompt-prefix fallback.
      submitInput = { ...withMentions, firstLastViaPrompt: false };
    }

    const body = isToapis
      ? buildToapisVideoBody(submitInput)
      : buildGenericOpenAIVideoBody(submitInput);

    const base = normalizeBase(withMentions.baseUrl);
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
        if (status >= 400) {
          // Surface CF / auth failures instead of silently "running"
          if (status === 403 || status === 401 || isCloudflareBody(data)) {
            return {
              status: "failed",
              error: formatProviderErrorBody(data, status, {
                platform: this.platform,
                fallback: `HTTP ${status}`,
              }),
              raw: data,
            };
          }
          continue;
        }

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

function isCloudflareBody(data: unknown): boolean {
  const text =
    typeof data === "string"
      ? data
      : data && typeof data === "object"
        ? JSON.stringify(data)
        : "";
  return /just a moment|cloudflare|cf-ray|cf-challenge|<!DOCTYPE html/i.test(
    text,
  );
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
