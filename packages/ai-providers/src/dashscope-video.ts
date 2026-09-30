import axios from "axios";
import { CHANNEL_PRESETS, ProviderPlatform } from "@joyai/shared";
import type {
  VideoPollResult,
  VideoProvider,
  VideoSubmitInput,
} from "./types";
import { formatProviderError, formatProviderErrorBody } from "./http-error";
import { rewritePromptMentionsForApi } from "./prompt-mentions";

function authHeaders(apiKey: string, async = false) {
  const h: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (async) h["X-DashScope-Async"] = "enable";
  return h;
}

/** DashScope video `parameters.ratio` allowlist (HappyHorse / Wan 2.x). */
const DASHSCOPE_VIDEO_RATIOS = new Set([
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "1:1",
  "5:4",
  "4:5",
  "9:21",
  "21:9",
]);

/** Wan 3.0 also accepts adaptive (recommended for i2v / first-last). */
const WAN3_VIDEO_RATIOS = new Set([
  "adaptive",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "1:1",
]);

const FLEXIBLE_RATIO = new Set(["auto", "adaptive", "keep"]);

/**
 * Wan 3.0 All-in-One (`wan3.0-video` / `wan3.0-video-prime`).
 * @see https://help.aliyun.com/zh/model-studio/wan3-video-generation-guide
 */
function isWan3Video(model: string) {
  return /^wan3\.0(-video)?(-prime)?$/i.test(model.trim());
}

/**
 * Map UI ratio → DashScope enum.
 * HappyHorse / Wan 2.x reject adaptive → fall back to 16:9.
 * Wan 3.0 keeps adaptive.
 */
function resolveDashscopeVideoRatio(
  raw: string | undefined,
  opts?: { allowAdaptive?: boolean },
): string {
  const ratio = raw?.trim();
  if (!ratio) return opts?.allowAdaptive ? "adaptive" : "16:9";
  const lower = ratio.toLowerCase();
  if (FLEXIBLE_RATIO.has(lower)) {
    return opts?.allowAdaptive ? "adaptive" : "16:9";
  }
  const allow = opts?.allowAdaptive ? WAN3_VIDEO_RATIOS : DASHSCOPE_VIDEO_RATIOS;
  if (allow.has(ratio)) return ratio;
  const norm = ratio.replace(/\s+/g, "");
  for (const allowed of allow) {
    if (allowed.toLowerCase() === norm.toLowerCase()) return allowed;
  }
  return opts?.allowAdaptive ? "adaptive" : "16:9";
}

function dedupeUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const url = String(raw || "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

function classifyRefKind(
  url: string,
  hint?: string,
): "image" | "video" | "audio" {
  if (hint === "video" || hint === "audio" || hint === "image") return hint;
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)) return "video";
  if (/\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/i.test(url)) return "audio";
  return "image";
}

/**
 * HappyHorse / Wan 2.x media rules:
 * - i2v: at most one `first_frame` (API rejects multiples)
 * - r2v: `reference_image` list
 * - first_last: one first_frame + optional last_frame
 */
function buildDashscopeMedia(opts: {
  refs: string[];
  isR2v: boolean;
  refMode?: string;
}): Array<Record<string, unknown>> {
  const { refs, isR2v, refMode } = opts;
  if (!refs.length) return [];

  if (refMode === "first_last") {
    const media: Array<Record<string, unknown>> = [
      { type: "first_frame", url: refs[0] },
    ];
    if (refs[1]) media.push({ type: "last_frame", url: refs[1] });
    return media;
  }

  if (isR2v) {
    return refs.map((url) => ({ type: "reference_image", url }));
  }

  // i2v / default: only the first image as first_frame
  return [{ type: "first_frame", url: refs[0] }];
}

/**
 * Wan 3.0 media — multimodal refs via type field.
 * first_last uses first_frame/last_frame only (cannot mix with reference_*).
 * omni / default uses reference_image|video|audio by kind.
 */
function buildWan3Media(opts: {
  refs: string[];
  kinds?: Array<"image" | "video" | "audio" | string>;
  refMode?: string;
}): Array<Record<string, unknown>> {
  const { refs, kinds = [], refMode } = opts;
  if (!refs.length) return [];

  const partitioned = {
    images: [] as string[],
    videos: [] as string[],
    audios: [] as string[],
  };
  refs.forEach((url, i) => {
    const kind = classifyRefKind(url, kinds[i]);
    if (kind === "video") partitioned.videos.push(url);
    else if (kind === "audio") partitioned.audios.push(url);
    else partitioned.images.push(url);
  });

  if (refMode === "first_last" && partitioned.images.length > 0) {
    const media: Array<Record<string, unknown>> = [
      { type: "first_frame", url: partitioned.images[0] },
    ];
    if (partitioned.images[1]) {
      media.push({ type: "last_frame", url: partitioned.images[1] });
    }
    return media;
  }

  const media: Array<Record<string, unknown>> = [];
  for (const url of partitioned.images.slice(0, 10)) {
    media.push({ type: "reference_image", url });
  }
  for (const url of partitioned.videos.slice(0, 5)) {
    media.push({ type: "reference_video", url });
  }
  for (const url of partitioned.audios.slice(0, 5)) {
    media.push({ type: "reference_audio", url });
  }
  return media;
}

function normalizeWan3Resolution(raw?: string): string | undefined {
  if (!raw?.trim()) return undefined;
  const r = raw.trim().toLowerCase();
  if (r.includes("480")) return "480P";
  if (r.includes("720")) return "720P";
  if (r.includes("1080")) return "1080P";
  return raw.trim().toUpperCase();
}

/**
 * Derive DashScope native API root for images / video / CosyVoice.
 * Prefer the channel's workspace MaaS host (baseUrl) over metadata.dashscopeApiBase:
 * CosyVoice HTTP is Beijing-workspace-only, and create-channel seeds a generic
 * `https://dashscope.aliyuncs.com/api/v1` that would otherwise ignore the workspace URL.
 */
export function resolveDashscopeApiBase(
  baseUrl: string,
  metadata?: Record<string, unknown> | null,
): string {
  const raw = (baseUrl || "").trim();

  // Workspace compatible-mode → native /api/v1 (SpeechSynthesizer / wan / etc.)
  if (raw.includes("compatible-mode")) {
    return raw
      .replace(/\/compatible-mode\/v1\/?$/, "/api/v1")
      .replace(/\/$/, "");
  }
  if (/\.maas\.aliyuncs\.com/i.test(raw)) {
    if (raw.includes("/api/v1")) return raw.replace(/\/$/, "");
    return `${raw.replace(/\/$/, "")}/api/v1`;
  }
  if (raw.includes("/api/v1")) {
    return raw.replace(/\/$/, "");
  }

  const fromMeta = metadata?.dashscopeApiBase;
  if (typeof fromMeta === "string" && fromMeta.trim()) {
    return fromMeta.replace(/\/$/, "");
  }

  const preset = CHANNEL_PRESETS[ProviderPlatform.DASHSCOPE].dashscopeApiBase;
  if (preset) return preset.replace(/\/$/, "");
  return "https://dashscope.aliyuncs.com/api/v1";
}

/**
 * Aliyun Bailian / DashScope video synthesis (HappyHorse, Wan 2.x, Wan 3.0).
 * Native async API — not OpenAI chat completions.
 */
export class DashscopeVideoProvider implements VideoProvider {
  readonly adapterId = "dashscope-video";
  readonly platform = ProviderPlatform.DASHSCOPE;

  async submit(input: VideoSubmitInput): Promise<{ remoteTaskId: string }> {
    const apiBase = resolveDashscopeApiBase(input.baseUrl, input.metadata);
    const refs = dedupeUrls(input.referenceUrls ?? []);
    const wan3 = isWan3Video(input.model);

    let prompt = rewritePromptMentionsForApi(input.prompt, {
      maxImages: refs.length || undefined,
    });

    if (wan3) {
      return this.submitWan3({ ...input, prompt }, apiBase, refs);
    }

    const isR2v = /r2v/i.test(input.model);
    const isI2v = /i2v/i.test(input.model) || (!isR2v && refs.length > 0);

    if (input.refMode === "first_last" && refs.length > 0) {
      prompt =
        refs.length >= 2
          ? `【首尾帧约束】请将第 1 张参考图作为视频首帧、第 2 张参考图作为视频尾帧，在两帧之间生成自然连贯的过渡动画。用户需求：${prompt}`
          : `【首帧约束】请将参考图作为视频首帧，据此生成后续动作。用户需求：${prompt}`;
    }

    const body: Record<string, unknown> = {
      model: input.model,
      input: {
        prompt,
      } as Record<string, unknown>,
      parameters: {} as Record<string, unknown>,
    };

    const parameters = body.parameters as Record<string, unknown>;
    if (input.duration) parameters.duration = Math.round(input.duration);
    // HappyHorse / Wan 图生视频：比例跟随首帧，官方不支持 parameters.ratio
    if (!isI2v && !/video-edit/i.test(input.model)) {
      parameters.ratio = resolveDashscopeVideoRatio(input.ratio);
    }
    if (input.resolution) parameters.resolution = input.resolution;
    if (input.watermark != null) parameters.watermark = input.watermark;

    if (refs.length && (isI2v || isR2v || input.refMode)) {
      (body.input as Record<string, unknown>).media = buildDashscopeMedia({
        refs,
        isR2v,
        refMode: input.refMode,
      });
    }

    return this.postTask(apiBase, input.apiKey, body);
  }

  private async submitWan3(
    input: VideoSubmitInput & { prompt: string },
    apiBase: string,
    refs: string[],
  ): Promise<{ remoteTaskId: string }> {
    const media = buildWan3Media({
      refs,
      kinds: input.referenceMediaKinds,
      refMode: input.refMode,
    });

    const bodyInput: Record<string, unknown> = {
      prompt: input.prompt,
    };
    if (media.length) bodyInput.media = media;

    const parameters: Record<string, unknown> = {};
    const hasVideoRef = media.some((m) => m.type === "reference_video");
    const isFirstLast = media.some(
      (m) => m.type === "first_frame" || m.type === "last_frame",
    );

    // Prefer adaptive for frame-locked / video-ref modes.
    const ratioDefault =
      isFirstLast || hasVideoRef ? "adaptive" : input.ratio || "16:9";
    parameters.ratio = resolveDashscopeVideoRatio(input.ratio ?? ratioDefault, {
      allowAdaptive: true,
    });

    if (input.duration != null) {
      const d = Math.round(input.duration);
      // API: no video input → [2, 30]; -1 = smart duration (not exposed in UI yet)
      parameters.duration = Math.min(30, Math.max(2, d));
    }

    const resolution = normalizeWan3Resolution(input.resolution);
    if (resolution) parameters.resolution = resolution;

    parameters.audio = input.generateAudio !== false;
    if (input.watermark != null) parameters.watermark = input.watermark;

    const remoteModel = /^wan3\.0-video-prime$/i.test(input.model)
      ? "wan3.0-video-prime"
      : "wan3.0-video";

    return this.postTask(apiBase, input.apiKey, {
      model: remoteModel,
      input: bodyInput,
      parameters,
    });
  }

  private async postTask(
    apiBase: string,
    apiKey: string,
    body: Record<string, unknown>,
  ): Promise<{ remoteTaskId: string }> {
    try {
      const { data } = await axios.post(
        `${apiBase}/services/aigc/video-generation/video-synthesis`,
        body,
        {
          headers: authHeaders(apiKey, true),
          timeout: 60_000,
        },
      );

      const remoteTaskId = data?.output?.task_id ?? data?.task_id;
      if (!remoteTaskId) {
        throw new Error(
          formatProviderErrorBody(data, undefined, {
            platform: ProviderPlatform.DASHSCOPE,
            fallback: "视频提交失败：未返回 task_id",
          }),
        );
      }
      return { remoteTaskId: String(remoteTaskId) };
    } catch (error) {
      throw new Error(
        formatProviderError(error, {
          platform: ProviderPlatform.DASHSCOPE,
          fallback: "视频提交失败",
        }),
      );
    }
  }

  async poll(params: {
    remoteTaskId: string;
    apiKey: string;
    baseUrl: string;
    metadata?: Record<string, unknown> | null;
  }): Promise<VideoPollResult> {
    const apiBase = resolveDashscopeApiBase(params.baseUrl, params.metadata);
    try {
      const { data } = await axios.get(`${apiBase}/tasks/${params.remoteTaskId}`, {
        headers: authHeaders(params.apiKey),
        timeout: 30_000,
      });

      const status = String(
        data?.output?.task_status ?? data?.task_status ?? "",
      ).toUpperCase();

      if (status === "SUCCEEDED") {
        const videoUrl = data?.output?.video_url;
        if (!videoUrl) {
          return { status: "failed", error: "未返回视频地址", raw: data };
        }
        return { status: "succeeded", videoUrl, raw: data };
      }
      if (status === "FAILED" || status === "CANCELED" || status === "UNKNOWN") {
        return {
          status: "failed",
          error: formatProviderErrorBody(data, undefined, {
            platform: ProviderPlatform.DASHSCOPE,
            fallback: status,
          }),
          raw: data,
        };
      }
      if (status === "PENDING") return { status: "queued" };
      return { status: "running" };
    } catch (error) {
      return {
        status: "failed",
        error: formatProviderError(error, {
          platform: ProviderPlatform.DASHSCOPE,
          fallback: "视频轮询失败",
        }),
      };
    }
  }
}
