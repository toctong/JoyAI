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

  // Seedance 2.5 — larger caps; do not share seedance-2 branch.
  // @see https://docs.toapis.com/docs/cn/api-reference/videos/seedance-2-5/generation
  if (/^seedance-2-5\b/i.test(id)) {
    const partitioned = partitionToapisRefs(input);
    if (resolution) body.resolution = resolution;
    body.prompt = rewriteSeedancePromptMentions(String(body.prompt ?? ""));

    const firstLast = input.refMode === "first_last";
    if (firstLast) {
      body.aspect_ratio = "adaptive";
      const roles: Array<{ url: string; role: string }> = [];
      if (partitioned.images[0]) {
        roles.push({ url: partitioned.images[0], role: "first_frame" });
      }
      if (partitioned.images[1]) {
        roles.push({ url: partitioned.images[1], role: "last_frame" });
      }
      if (roles.length) body.image_with_roles = roles;
    } else {
      if (partitioned.images.length) {
        body.image_with_roles = partitioned.images
          .slice(0, 30)
          .map((url) => ({ url, role: "reference_image" }));
      }
      if (partitioned.videos.length) {
        body.video_with_roles = partitioned.videos
          .slice(0, 10)
          .map((url) => ({ url, role: "reference_video" }));
      }
      if (partitioned.audios.length) {
        body.audio_with_roles = partitioned.audios
          .slice(0, 10)
          .map((url) => ({ url, role: "reference_audio" }));
      }
    }
    if (typeof body.duration === "number" && body.duration > 0) {
      body.duration = Math.min(30, Math.max(4, Math.round(body.duration)));
    }
    return body;
  }

  // Seedance 2 / mini / fast (not 2.5)
  // @see https://docs.toapis.com/docs/cn/api-reference/videos/seedance-2/generation
  if (/^seedance-2(-mini|-fast)?$/i.test(id)) {
    const partitioned = partitionToapisRefs(input);
    let res = resolution;
    if (res && /mini|fast/i.test(id) && /^(1080p|4k)$/i.test(res)) {
      res = "720p";
    }
    if (res) body.resolution = res;
    body.prompt = rewriteSeedancePromptMentions(String(body.prompt ?? ""));
    // Docs default true; set explicitly so outputs have sync audio.
    body.generate_audio = true;

    const firstLast = input.refMode === "first_last";
    if (firstLast) {
      const roles: Array<{ url: string; role: string }> = [];
      if (partitioned.images[0]) {
        roles.push({ url: partitioned.images[0], role: "first_frame" });
      }
      if (partitioned.images[1]) {
        roles.push({ url: partitioned.images[1], role: "last_frame" });
      }
      if (roles.length) body.image_with_roles = roles;
    } else {
      if (partitioned.images.length) {
        body.image_with_roles = partitioned.images
          .slice(0, 9)
          .map((url) => ({ url, role: "reference_image" }));
      }
      if (partitioned.videos.length) {
        body.video_with_roles = partitioned.videos
          .slice(0, 3)
          .map((url) => ({ url, role: "reference_video" }));
      }
      if (partitioned.audios.length) {
        body.audio_with_roles = partitioned.audios
          .slice(0, 3)
          .map((url) => ({ url, role: "reference_audio" }));
      }
    }
    if (typeof body.duration === "number" && body.duration > 0) {
      body.duration = Math.min(15, Math.max(4, Math.round(body.duration)));
    }
    return body;
  }

  // Kling V3 (not Omni): mode + reference_images / image_with_roles
  // @see https://docs.toapis.com/docs/cn/api-reference/videos/kling-v3/generation
  if (/^kling-v3$/i.test(id)) {
    const partitioned = partitionToapisRefs(input);
    const images = partitioned.images;
    const r = (resolution ?? "").toLowerCase();
    body.mode =
      r.includes("1080") || r.includes("4k") || r.includes("pro")
        ? "pro"
        : "std";
    delete body.resolution;
    if (typeof body.duration === "number") {
      body.duration = Math.min(15, Math.max(3, Math.round(body.duration)));
    }
    if (input.refMode === "first_last" && images.length > 0) {
      const roles: Array<{ url: string; role: string }> = [
        { url: images[0]!, role: "first_frame" },
      ];
      if (images[1]) roles.push({ url: images[1], role: "last_frame" });
      body.image_with_roles = roles;
    } else if (images.length > 0) {
      body.reference_images = images.slice(0, 2);
    }
    return body;
  }

  // Kling V3 Omni: metadata.image_list + video_list; prompt <<<image_N>>> / <<<video_N>>>
  // @see https://docs.toapis.com/docs/cn/api-reference/videos/kling-v3-omni/generation
  // Upstream image rules (Kling): JPEG/JPG/PNG only, side 300–8000px, no alpha/WebP.
  if (/kling-v3-omni/i.test(id)) {
    const partitioned = partitionToapisRefs(input);
    const r = (resolution ?? "").toLowerCase();
    body.mode = r.includes("1080") || r.includes("4k") ? "pro" : "std";
    delete body.resolution;

    const images = partitioned.images.slice(0, 4);
    const videos = partitioned.videos.slice(0, 1);

    for (const imageUrl of images) {
      assertKlingOmniImageUrl(imageUrl);
    }

    if (typeof body.duration === "number") {
      body.duration = Math.min(15, Math.max(3, Math.round(body.duration)));
    }

    // With a reference video, character/subject images belong in element_list
    // only for Kling asset-library elements. Arbitrary uploads use image_list
    // + video_list (<<<image_N>>> / <<<video_N>>>); element_list caused
    // "Element id not found: 0" with plain image URLs.
    //
    // ToAPIs docs show video_list at top-level, but this gateway rejects that
    // and accepts metadata.video_list in practice — keep it under metadata.
    const metadata: Record<string, unknown> = {};

    if (input.refMode === "first_last" && images.length > 0) {
      const imageList: Array<Record<string, string>> = [
        { image_url: images[0]!, type: "first_frame" },
      ];
      if (images[1]) {
        imageList.push({ image_url: images[1], type: "end_frame" });
      }
      metadata.image_list = imageList;
      body.prompt = rewriteKlingOmniPlaceholders(String(body.prompt ?? ""), {
        images: images.length,
        videos: 0,
      });
    } else if (images.length > 0) {
      metadata.image_list = images.map((image_url) => ({ image_url }));
      body.prompt = rewriteKlingOmniPlaceholders(String(body.prompt ?? ""), {
        images: images.length,
        videos: videos.length,
      });
    } else {
      body.prompt = rewriteKlingOmniPlaceholders(String(body.prompt ?? ""), {
        images: 0,
        videos: videos.length,
      });
    }

    // Prefer native audio. Keep ref video under metadata (not top-level
    // video_list) so audio=true is not rejected by the audio↔video_list mutex.
    // Do not keep the reference clip's original soundtrack.
    if (videos.length > 0) {
      metadata.video_list = [
        {
          video_url: videos[0],
          refer_type: "base",
          keep_original_sound: "no",
        },
      ];
      delete body.video_list;
    }
    body.audio = true;

    if (Object.keys(metadata).length > 0) {
      body.metadata = metadata;
    }
    return body;
  }

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

  // MiniMax Hailuo 2.3 / Fast — image_urls first frame; duration 6|10; 1080P→6s only
  // @see https://docs.toapis.com/docs/cn/api-reference/videos/minimax-hailuo-2.3/generation
  if (/minimax-hailuo-2\.3/i.test(id)) {
    const r = (resolution ?? "768P").toLowerCase();
    body.resolution = r.includes("1080") ? "1080P" : "768P";

    let duration =
      typeof input.duration === "number" && Number.isFinite(input.duration)
        ? Math.round(input.duration)
        : 6;
    if (duration !== 6 && duration !== 10) {
      duration = Math.abs(duration - 6) <= Math.abs(duration - 10) ? 6 : 10;
    }
    if (body.resolution === "1080P") duration = 6;
    body.duration = duration;

    const images = partitionToapisRefs(input).images;
    if (/fast/i.test(id) && images.length === 0) {
      throw new Error(
        "MiniMax-Hailuo-2.3-Fast 仅支持图生视频，请上传 1 张首帧图",
      );
    }
    if (images.length > 0) body.image_urls = [images[0]!];
    delete body.aspect_ratio;
    return body;
  }

  // HappyHorse 1.1 — action + image_urls / reference_images / url
  // @see https://docs.toapis.com/docs/cn/api-reference/videos/happyhorse/generation
  if (/happyhorse-1\.1/i.test(id)) {
    const partitioned = partitionToapisRefs(input);
    if (resolution) {
      body.resolution = /1080/i.test(resolution) ? "1080P" : "720P";
    }
    if (typeof body.duration === "number") {
      body.duration = Math.min(15, Math.max(3, Math.round(body.duration)));
    }

    if (partitioned.videos.length > 0) {
      body.action = "video-edit";
      body.url = partitioned.videos[0];
      if (partitioned.images.length) {
        body.reference_images = partitioned.images.slice(0, 5);
      }
      delete body.aspect_ratio;
    } else if (input.refMode === "first_last" && partitioned.images.length > 0) {
      body.action = "image-to-video";
      body.image_urls = [partitioned.images[0]!];
      delete body.aspect_ratio;
    } else if (input.refMode === "omni" && partitioned.images.length > 0) {
      body.action = "reference-to-video";
      body.reference_images = partitioned.images.slice(0, 9);
    } else if (partitioned.images.length > 0) {
      body.action = "image-to-video";
      body.image_urls = [partitioned.images[0]!];
      delete body.aspect_ratio;
    } else {
      body.action = "text-to-video";
    }
    return body;
  }

  // Wan 3.0 All-in-One — wan3.0-video
  // @see https://docs.toapis.com/docs/cn/api-reference/videos/wan3.0/generation
  if (/^wan3\.0-video$/i.test(id) || /^wan3\.0$/i.test(id)) {
    body.model = "wan3.0-video";
    const partitioned = partitionToapisRefs(input);
    if (input.ratio) {
      body.ratio = input.ratio;
      delete body.aspect_ratio;
    }
    if (resolution) body.resolution = resolution;
    if (typeof body.duration === "number") {
      body.duration = Math.min(30, Math.max(2, Math.round(body.duration)));
    }
    body.audio = true;

    const firstLast = input.refMode === "first_last";
    if (firstLast && partitioned.images.length > 0) {
      const roles: Array<{ url: string; role: string }> = [
        { url: partitioned.images[0]!, role: "first_frame" },
      ];
      if (partitioned.images[1]) {
        roles.push({ url: partitioned.images[1], role: "last_frame" });
      }
      body.image_with_roles = roles;
      if (!body.ratio) body.ratio = "adaptive";
    } else {
      if (partitioned.images.length) {
        body.reference_images = partitioned.images.slice(0, 10);
      }
      if (partitioned.videos.length) {
        body.video_list = partitioned.videos
          .slice(0, 5)
          .map((video_url) => ({ video_url }));
      }
      if (partitioned.audios.length) {
        body.audio_with_roles = partitioned.audios
          .slice(0, 5)
          .map((url) => ({ url, role: "reference_audio" }));
      }
    }
    body.prompt = rewriteSeedancePromptMentions(String(body.prompt ?? ""));
    return body;
  }

  // Vidu Q3 — image_urls (+ optional audio)
  // @see https://docs.toapis.com/docs/cn/api-reference/videos/viduq3/generation
  if (/^viduq3/i.test(id)) {
    const images = partitionToapisRefs(input).images;
    if (resolution) body.resolution = resolution.toLowerCase();
    const maxImgs = /^viduq3$/i.test(id) ? 7 : 2;
    if (images.length) body.image_urls = images.slice(0, maxImgs);
    if (body.audio == null) body.audio = true;
    if (typeof body.duration === "number") {
      const min = /^viduq3$/i.test(id) ? 3 : 1;
      body.duration = Math.min(16, Math.max(min, Math.round(body.duration)));
    }
    return body;
  }

  // Gemini Omni / Veo / Kling Turbo / default ToAPIs video
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

function partitionToapisRefs(input: VideoSubmitInput): {
  images: string[];
  videos: string[];
  audios: string[];
} {
  const refs = (input.referenceUrls ?? []).filter(Boolean);
  const kinds = input.referenceMediaKinds ?? [];
  const images: string[] = [];
  const videos: string[] = [];
  const audios: string[] = [];
  refs.forEach((url, i) => {
    const hint = kinds[i];
    const kind =
      hint === "video" || hint === "audio" || hint === "image"
        ? hint
        : /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)
          ? "video"
          : /\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/i.test(url)
            ? "audio"
            : "image";
    if (kind === "video") videos.push(url);
    else if (kind === "audio") audios.push(url);
    else images.push(url);
  });
  return { images, videos, audios };
}

/** Docs: prompt refers to 图片1 / 视频1 / 音频1 (no leading @). */
function rewriteSeedancePromptMentions(prompt: string): string {
  return prompt
    .replace(/@(图片|视频|音频|图)(\d+)/g, (_m, k: string, n: string) =>
      k === "图" ? `图片${n}` : `${k}${n}`,
    )
    .replace(
      /\{\{(Image|Video|Audio)\s+(\d+)\}\}/gi,
      (_m, kind: string, n: string) => {
        const k = kind.toLowerCase();
        if (k === "video") return `视频${n}`;
        if (k === "audio") return `音频${n}`;
        return `图片${n}`;
      },
    );
}

/**
 * Map JoyAI `@图片N` / `@视频N` → Kling Omni wire placeholders.
 * UI / job storage always keep `@…`; `<<<…>>>` is only for the upstream body.
 */
function rewriteKlingOmniPlaceholders(
  prompt: string,
  counts: { images: number; videos: number },
): string {
  // Normalize any leaked Omni wire tokens back to JoyAI @ mentions first
  let out = String(prompt ?? "")
    .replace(/<<<image_(\d+)>>>/gi, (_m, n: string) => `@图片${n}`)
    .replace(/<<<element_(\d+)>>>/gi, (_m, n: string) => `@图片${n}`)
    .replace(/<<<video_(\d+)>>>/gi, (_m, n: string) => `@视频${n}`);

  // Ensure refs are mentioned in @ form when the model requires them
  if (counts.videos > 0 && !/@视频\d+/.test(out)) {
    out = `${out} @视频1`.trim();
  }
  if (counts.images > 0 && !/@(?:图片|图)\d+/.test(out)) {
    out = `${out} @图片1`.trim();
  }

  out = out
    .replace(/@(图片|图)(\d+)/g, (_m, _k: string, n: string) => {
      const i = Number(n);
      return i >= 1 && i <= counts.images ? `<<<image_${i}>>>` : _m;
    })
    .replace(/@视频(\d+)/g, (_m, n: string) => {
      const i = Number(n);
      return i >= 1 && i <= counts.videos ? `<<<video_${i}>>>` : _m;
    })
    .replace(/\{\{Image\s+(\d+)\}\}/gi, (_m, n: string) => {
      const i = Number(n);
      return i >= 1 && i <= counts.images ? `<<<image_${i}>>>` : _m;
    })
    .replace(/\{\{Video\s+(\d+)\}\}/gi, (_m, n: string) => {
      const i = Number(n);
      return i >= 1 && i <= counts.videos ? `<<<video_${i}>>>` : _m;
    });

  return out.replace(/>>><<</g, ">>> <<<");
}

function assertKlingOmniImageUrl(url: string) {
  const path = url.split("?")[0]?.toLowerCase() ?? "";
  if (/\.(webp|gif|bmp|tiff?|heic|avif)$/i.test(path)) {
    throw new Error(
      "Kling V3 Omni 参考图仅支持 JPEG/JPG/PNG（不支持 WebP 等格式），请换一张图再试",
    );
  }
}

/** Map legacy / ToAPIs-style ids onto APIMart public model names. */
function normalizeApiMartVideoModelId(model: string): string {
  let id = model.trim();
  // seedance-2 / seedance-2-5 (ToAPIs) → seedance-2.0 / seedance-2.5
  if (/^seedance-2-5\b/i.test(id)) return "seedance-2.5";
  if (/^seedance-2-0(-fast|-mini|-face|-fast-face)?$/i.test(id)) {
    return id.replace(/^seedance-2-0/i, "seedance-2.0");
  }
  if (/^seedance-2(-fast|-mini)?$/i.test(id)) {
    return id.replace(/^seedance-2/i, "seedance-2.0");
  }
  if (/^wan3\.0-video$/i.test(id)) return "wan3.0";
  // Docs use viduq3-pro / viduq3-turbo (no hyphen after vidu)
  if (/^vidu-q3\b/i.test(id)) {
    return id.replace(/^vidu-q3/i, "viduq3");
  }
  return id;
}

/** Snap duration to the nearest allowed value (e.g. Kling 5|10). */
function snapDuration(value: unknown, allowed: number[], fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  let best = allowed[0] ?? fallback;
  let bestDist = Math.abs(value - best);
  for (const d of allowed) {
    const dist = Math.abs(value - d);
    if (dist < bestDist) {
      best = d;
      bestDist = dist;
    }
  }
  return best;
}

function clampDuration(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * APIMart / apib.ai video dialect — field shapes differ from ToAPIs.
 * @see https://docs.apimart.ai/en/api-reference/texts/models/list
 * @see https://docs.apimart.ai/en/api-reference/videos/
 */
function buildApiMartVideoBody(input: VideoSubmitInput): Record<string, unknown> {
  const model = normalizeApiMartVideoModelId(input.model);
  const refs = (input.referenceUrls ?? []).filter(Boolean);
  const resolution = normalizeVideoResolution(input.resolution);
  const body: Record<string, unknown> = {
    model,
    prompt: input.prompt,
  };
  if (input.duration != null) body.duration = input.duration;
  if (input.ratio) body.aspect_ratio = input.ratio;

  const id = model.toLowerCase();
  const partitioned = partitionToapisRefs(input);

  // Seedance 2.5 — size + video_urls/audio_urls; 480p/720p only; 4–30s
  // @see https://docs.apimart.ai/en/api-reference/videos/seedance-2-5/generation
  if (/^seedance-2\.5\b/i.test(id)) {
    let res = resolution;
    if (res && /^(1080p|4k)$/i.test(res)) res = "720p";
    if (res) body.resolution = res;
    body.prompt = rewriteSeedancePromptMentions(String(body.prompt ?? ""));
    body.generate_audio = true;

    const firstLast = input.refMode === "first_last";
    if (firstLast) {
      body.size = "adaptive";
      delete body.aspect_ratio;
      const roles: Array<{ url: string; role: string }> = [];
      if (partitioned.images[0]) {
        roles.push({ url: partitioned.images[0], role: "first_frame" });
      }
      if (partitioned.images[1]) {
        roles.push({ url: partitioned.images[1], role: "last_frame" });
      }
      if (roles.length) body.image_with_roles = roles;
    } else {
      if (input.ratio) {
        body.size = input.ratio;
        delete body.aspect_ratio;
      }
      if (partitioned.images.length) {
        body.image_urls = partitioned.images.slice(0, 30);
      }
      if (partitioned.videos.length) {
        body.video_urls = partitioned.videos.slice(0, 10);
      }
      if (partitioned.audios.length) {
        body.audio_urls = partitioned.audios.slice(0, 10);
      }
    }
    body.duration = clampDuration(body.duration, 4, 30, 5);
    return body;
  }

  // Seedance 2.0 / fast / mini
  // @see https://docs.apimart.ai/en/api-reference/videos/seedance-2-0/generation
  if (/^seedance-2\.0\b/i.test(id)) {
    let res = resolution;
    if (/fast|mini/i.test(id) && res && /^(1080p|4k)$/i.test(res)) {
      res = "720p";
    }
    if (res) body.resolution = res;
    body.prompt = rewriteSeedancePromptMentions(String(body.prompt ?? ""));
    body.generate_audio = true;

    const firstLast = input.refMode === "first_last";
    if (firstLast) {
      // Docs: first/last cannot mix with video_urls / audio_urls
      const roles: Array<{ url: string; role: string }> = [];
      if (partitioned.images[0]) {
        roles.push({ url: partitioned.images[0], role: "first_frame" });
      }
      if (partitioned.images[1]) {
        roles.push({ url: partitioned.images[1], role: "last_frame" });
      }
      if (roles.length) body.image_with_roles = roles;
      if (input.ratio) {
        body.size = input.ratio;
        delete body.aspect_ratio;
      }
    } else {
      if (input.ratio) {
        body.size = input.ratio;
        delete body.aspect_ratio;
      }
      if (partitioned.images.length) {
        body.image_urls = partitioned.images.slice(0, 9);
      }
      if (partitioned.videos.length) {
        body.video_urls = partitioned.videos.slice(0, 3);
      }
      if (partitioned.audios.length) {
        body.audio_urls = partitioned.audios.slice(0, 3);
      }
    }
    body.duration = clampDuration(body.duration, 4, 15, 5);
    return body;
  }

  // Seedance 1.5 Pro — aspect_ratio + audio; first/last via image_urls or roles
  // @see https://docs.apimart.ai/en/api-reference/videos/seedance-1-5-pro/generation
  if (/^seedance-1-5-pro\b/i.test(id)) {
    if (resolution) body.resolution = resolution;
    body.audio = true;
    body.duration = clampDuration(body.duration, 4, 12, 5);
    const images = partitioned.images;
    if (images.length > 0) {
      if (input.refMode === "first_last" || images.length >= 2) {
        const roles: Array<{ url: string; role: string }> = [
          { url: images[0]!, role: "first_frame" },
        ];
        if (images[1]) roles.push({ url: images[1], role: "last_frame" });
        body.image_with_roles = roles;
      } else {
        body.image_urls = [images[0]!];
      }
    }
    return body;
  }

  // Seedance 1.0 Pro — first/last via image_urls; no audio
  // @see https://docs.apimart.ai/en/api-reference/videos/seedance-1-0-pro/generation
  if (/^seedance-1-0-pro\b/i.test(id)) {
    if (resolution) body.resolution = resolution;
    body.duration = clampDuration(body.duration, 2, 12, 5);
    const images = partitioned.images;
    if (images.length > 0) {
      if (input.refMode === "first_last" || images.length >= 2) {
        body.image_urls = images.slice(0, 2);
      } else {
        body.image_urls = [images[0]!];
      }
    }
    return body;
  }

  // Kling V3 — mode std/pro/4k + image_urls (1 first / 2 first+last)
  // @see https://docs.apimart.ai/en/api-reference/videos/kling-v3/generation
  if (/^kling-v3$/i.test(id)) {
    const r = (resolution ?? "").toLowerCase();
    body.mode = r.includes("4k")
      ? "4k"
      : r.includes("1080") || r.includes("pro")
        ? "pro"
        : "std";
    delete body.resolution;
    body.audio = true;
    body.duration = clampDuration(body.duration, 3, 15, 5);
    const images = partitioned.images;
    if (images.length > 0) {
      body.image_urls = images.slice(0, 2);
    }
    return body;
  }

  // Kling 2.6 — duration only 5|10; mode std/pro
  // @see https://docs.apimart.ai/en/api-reference/videos/kling-v2-6/generation
  if (/^kling-v2-6$/i.test(id) || /^kling-v2\.6$/i.test(id)) {
    const r = (resolution ?? "").toLowerCase();
    const isPro = r.includes("1080") || r.includes("pro");
    body.mode = isPro ? "pro" : "std";
    delete body.resolution;
    body.duration = snapDuration(body.duration, [5, 10], 5);
    if (isPro) body.audio = true;
    const images = partitioned.images;
    if (images.length > 0) {
      // last frame only supported in pro
      body.image_urls = images.slice(0, isPro ? 2 : 1);
    }
    return body;
  }

  // Kling V3 Omni — image_urls + <<<image_N>>>; top-level video_list
  // audio mutually exclusive with video_list (official APIMart docs).
  // @see https://docs.apimart.ai/en/api-reference/videos/kling-v3-omni/generation
  if (/kling-v3-omni/i.test(id)) {
    const r = (resolution ?? "").toLowerCase();
    body.mode = r.includes("4k")
      ? "4k"
      : r.includes("1080") || r.includes("pro")
        ? "pro"
        : "std";
    delete body.resolution;

    const images = partitioned.images.slice(0, 4);
    const videos = partitioned.videos.slice(0, 1);

    body.duration = clampDuration(body.duration, 3, 15, 5);

    if (input.refMode === "first_last" && images.length > 0) {
      const roles: Array<{ url: string; role: string }> = [
        { url: images[0]!, role: "first_frame" },
      ];
      if (images[1]) roles.push({ url: images[1], role: "last_frame" });
      body.image_with_roles = roles;
    } else if (images.length > 0) {
      body.image_urls = images;
      body.prompt = rewriteKlingOmniPlaceholders(String(body.prompt ?? ""), {
        images: images.length,
        videos: videos.length,
      });
    }

    if (videos.length > 0) {
      body.video_list = [
        {
          video_url: videos[0],
          refer_type: "base",
          keep_original_sound: "no",
        },
      ];
      // Docs: audio is mutually exclusive with video_list
    } else {
      body.audio = true;
    }
    return body;
  }

  // Kling 3.0 Turbo — image_urls as first frame
  if (/kling-3\.0-turbo|kling-v3-turbo/i.test(id)) {
    if (resolution) body.resolution = resolution;
    body.duration = clampDuration(body.duration, 3, 15, 5);
    if (partitioned.images.length) {
      body.image_urls = partitioned.images.slice(0, 1);
    }
    return body;
  }

  // FLUX 3 Video — duration 5–20; resolution hd|fhd
  // @see https://docs.apimart.ai/en/api-reference/videos/flux-3-video/generation
  if (/^flux-3-video$/i.test(id)) {
    const r = (resolution ?? "fhd").toLowerCase();
    body.resolution = r.includes("hd") && !r.includes("fhd") ? "hd" : "fhd";
    body.duration = clampDuration(body.duration, 5, 20, 5);
    body.audio = true;
    if (partitioned.images.length) {
      body.image_urls = partitioned.images.slice(0, 10);
    }
    if (partitioned.videos.length) {
      body.video_url = partitioned.videos[0];
    }
    return body;
  }

  // Grok Imagine Video (official) — duration 1–15
  // @see https://docs.apimart.ai/en/api-reference/videos/grok-imagine/official
  if (/^grok-imagine-video(-1\.5)?$/i.test(id)) {
    body.duration = clampDuration(body.duration, 1, 15, 8);
    if (resolution) {
      const r = resolution.toLowerCase();
      if (/^grok-imagine-video$/i.test(id) && r.includes("1080")) {
        body.resolution = "720p";
      } else {
        body.resolution = r.includes("1080")
          ? "1080p"
          : r.includes("480")
            ? "480p"
            : "720p";
      }
    }
    if (partitioned.images.length) {
      body.image_urls = partitioned.images.slice(0, 7);
    }
    return body;
  }

  // Grok Imagine 1.5 video (APIMart relay, non-ZDR) — size + quality, duration 6–30
  // @see https://docs.apimart.ai/en/api-reference/videos/grok-imagine/generation
  if (/grok-imagine-1\.5-video-apimart/i.test(id)) {
    body.duration = clampDuration(body.duration, 6, 30, 6);
    if (input.ratio) {
      body.size = input.ratio;
      delete body.aspect_ratio;
    }
    if (resolution) {
      const r = resolution.toLowerCase();
      body.quality = r.includes("720") || r.includes("1080") ? "720p" : "480p";
    }
    delete body.resolution;
    if (partitioned.images.length) {
      body.image_urls = partitioned.images.slice(0, 7);
    }
    return body;
  }

  // HappyHorse 1.1 — first_frame_image (I2V) vs image_urls (R2V); size for ratio
  // @see https://docs.apimart.ai/en/api-reference/videos/happyhorse-1.1/generation
  if (/happyhorse-1\.1/i.test(id)) {
    if (resolution) {
      body.resolution = /1080/i.test(resolution) ? "1080P" : "720P";
    }
    body.duration = clampDuration(body.duration, 3, 15, 5);
    if (input.ratio) {
      body.size = input.ratio;
      delete body.aspect_ratio;
    }
    const images = partitioned.images;
    if (images.length > 0) {
      if (input.refMode === "omni" || images.length > 1) {
        body.image_urls = images.slice(0, 9);
      } else {
        // Single image / first-frame → I2V
        body.first_frame_image = images[0];
        delete body.aspect_ratio;
        delete body.size;
      }
    }
    return body;
  }

  // HappyHorse 1.0 — same media fields as 1.1 (+ optional video edit via video_url)
  if (/happyhorse-1\.0/i.test(id)) {
    if (resolution) {
      body.resolution = /1080/i.test(resolution) ? "1080P" : "720P";
    }
    body.duration = clampDuration(body.duration, 3, 15, 5);
    if (input.ratio) {
      body.size = input.ratio;
      delete body.aspect_ratio;
    }
    if (partitioned.videos.length > 0) {
      body.video_url = partitioned.videos[0];
      if (partitioned.images.length) {
        body.image_urls = partitioned.images.slice(0, 5);
      }
    } else if (partitioned.images.length === 1 || input.refMode === "first_last") {
      body.first_frame_image = partitioned.images[0];
    } else if (partitioned.images.length > 0) {
      body.image_urls = partitioned.images.slice(0, 9);
    }
    return body;
  }

  // Wan 2.6 — image_urls (1); duration 5|10|15; audio
  // @see https://docs.apimart.ai/en/api-reference/videos/wan2.6/generation
  if (/^wan2\.6\b/i.test(id)) {
    if (resolution) body.resolution = resolution.toLowerCase();
    body.audio = true;
    body.duration = snapDuration(body.duration, [5, 10, 15], 5);
    if (partitioned.images.length) {
      body.image_urls = partitioned.images.slice(0, 1);
      delete body.aspect_ratio;
    }
    return body;
  }

  // Wan 2.7 — image_urls / video_urls; size via aspect_ratio; 2–15s
  // @see https://docs.apimart.ai/en/api-reference/videos/wan2.7/generation
  if (/^wan2\.7\b/i.test(id) && !/r2v|videoedit|image/i.test(id)) {
    if (resolution) {
      body.resolution = /1080/i.test(resolution) ? "1080P" : "720P";
    }
    body.duration = clampDuration(body.duration, 2, 15, 5);
    if (partitioned.videos.length > 0) {
      body.video_urls = partitioned.videos.slice(0, 1);
      delete body.aspect_ratio;
    } else if (partitioned.images.length > 0) {
      if (input.refMode === "first_last" && partitioned.images.length >= 2) {
        body.image_with_roles = [
          { url: partitioned.images[0]!, role: "first_frame" },
          { url: partitioned.images[1]!, role: "last_frame" },
        ];
      } else {
        body.image_urls = partitioned.images.slice(0, 2);
      }
      delete body.aspect_ratio;
    }
    if (partitioned.audios.length > 0 && !partitioned.videos.length) {
      body.audio_url = partitioned.audios[0];
    }
    return body;
  }

  // Wan 3.0 — multimodal refs; ratio field; audio
  if (/^wan3\.0\b/i.test(id)) {
    if (input.ratio) {
      body.ratio = input.ratio;
      delete body.aspect_ratio;
    }
    if (resolution) {
      const r = resolution.toLowerCase();
      body.resolution = r.includes("1080")
        ? "1080P"
        : r.includes("480")
          ? "480P"
          : "720P";
    }
    body.duration = clampDuration(body.duration, 2, 30, 5);
    body.audio = true;
    body.prompt = rewriteSeedancePromptMentions(String(body.prompt ?? ""));

    if (input.refMode === "first_last" && partitioned.images.length > 0) {
      const roles: Array<{ url: string; role: string }> = [
        { url: partitioned.images[0]!, role: "first_frame" },
      ];
      if (partitioned.images[1]) {
        roles.push({ url: partitioned.images[1], role: "last_frame" });
      }
      body.image_with_roles = roles;
      if (!body.ratio) body.ratio = "adaptive";
    } else {
      if (partitioned.images.length) {
        body.image_urls = partitioned.images.slice(0, 10);
      }
      if (partitioned.videos.length) {
        body.video_urls = partitioned.videos.slice(0, 5);
      }
      if (partitioned.audios.length) {
        body.audio_urls = partitioned.audios.slice(0, 5);
      }
    }
    return body;
  }

  // MiniMax Hailuo 02 — duration 5|10 only
  // @see https://docs.apimart.ai/en/api-reference/videos/minimax-hailuo/generation
  if (/minimax-hailuo-02/i.test(id)) {
    const r = (resolution ?? "768p").toLowerCase();
    body.resolution = r.includes("1080")
      ? "1080p"
      : r.includes("512")
        ? "512p"
        : "768p";
    let duration = snapDuration(body.duration, [5, 10], 5);
    if (body.resolution === "1080p") duration = 5;
    body.duration = duration;
    body.prompt_optimizer = true;
    if (partitioned.images.length >= 2) {
      body.first_frame_image = partitioned.images[0];
      body.last_frame_image = partitioned.images[1];
    } else if (partitioned.images.length === 1) {
      body.first_frame_image = partitioned.images[0];
    }
    delete body.aspect_ratio;
    return body;
  }

  // MiniMax Hailuo 2.3 — duration 6|10; 1080P → 6s only
  if (/minimax-hailuo-2\.3/i.test(id)) {
    const r = (resolution ?? "768P").toLowerCase();
    body.resolution = r.includes("1080") ? "1080P" : "768P";
    let duration = snapDuration(body.duration, [6, 10], 6);
    if (body.resolution === "1080P") duration = 6;
    body.duration = duration;
    if (/fast/i.test(id) && partitioned.images.length === 0) {
      throw new Error(
        "MiniMax-Hailuo-2.3-Fast 仅支持图生视频，请上传 1 张首帧图",
      );
    }
    if (partitioned.images.length > 0) {
      body.first_frame_image = partitioned.images[0];
    }
    delete body.aspect_ratio;
    return body;
  }

  // Vidu Q3 Pro/Turbo — wire id viduq3-pro; duration 1–16
  // @see https://docs.apimart.ai/en/api-reference/videos/vidu-q3-pro/generation
  if (/^viduq3/i.test(id)) {
    if (resolution) body.resolution = resolution.toLowerCase();
    const maxImgs = /mix|standard/i.test(id) ? 7 : 2;
    if (partitioned.images.length) {
      body.image_urls = partitioned.images.slice(0, maxImgs);
      delete body.aspect_ratio;
    }
    body.audio = true;
    const min = /^viduq3$/i.test(id) ? 3 : 1;
    body.duration = clampDuration(body.duration, min, 16, 5);
    return body;
  }

  // Default APIMart OpenAI-compatible video
  if (resolution) body.resolution = resolution;
  if (typeof body.duration === "number" && body.duration > 0) {
    body.duration = Math.max(1, Math.round(body.duration));
  }
  if (refs.length > 0) {
    body.image_urls = refs.slice(0, 10);
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
    const platform = this.platform.trim().toLowerCase();
    const isToapis = platform === "toapis";
    const isApimart = platform === "apimart";
    let submitInput = withMentions;
    if (
      (isToapis || isApimart) &&
      withMentions.refMode === "first_last" &&
      withMentions.firstLastViaPrompt
    ) {
      // Seedance/Kling use native roles; skip prompt-prefix fallback.
      submitInput = { ...withMentions, firstLastViaPrompt: false };
    }

    const body = isToapis
      ? buildToapisVideoBody(submitInput)
      : isApimart
        ? buildApiMartVideoBody(submitInput)
        : buildGenericOpenAIVideoBody(submitInput);

    const base = normalizeBase(withMentions.baseUrl);
    // Official OpenAI-compatible video endpoint is /videos/generations.
    // Only fall back on 404/405 — never on 400 (param errors), or lastError
    // becomes the misleading "Invalid URL (POST /v1/video/generations)".
    const paths =
      isApimart || isToapis
        ? [`${base}/videos/generations`, `${base}/videos`]
        : [
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
          // Wrong endpoint → try next path; param/auth errors → stop.
          if (status === 404 || status === 405) continue;
          break;
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
