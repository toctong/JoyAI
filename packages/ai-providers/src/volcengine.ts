import axios from "axios";
import { ProviderPlatform } from "@joyai/shared";
import { formatProviderError, formatProviderErrorBody } from "./http-error";
import { resolveImageSize } from "./image-size";
import type {
  ImageGenerateInput,
  ImageGenerateResult,
  ImageProvider,
  VideoPollResult,
  VideoProvider,
  VideoSubmitInput,
} from "./types";

function authHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

export class VolcengineImageProvider implements ImageProvider {
  readonly platform = ProviderPlatform.VOLCENGINE;

  async generate(input: ImageGenerateInput): Promise<ImageGenerateResult> {
    const size = resolveImageSize({
      size: input.size,
      width: input.width,
      height: input.height,
      ratio: input.ratio,
      resolution: input.resolution,
      catalogSizes: input.catalogSizes,
      mode: input.sizeMode ?? "auto",
      fallback: "2K",
    });

    const body: Record<string, unknown> = {
      model: input.model,
      prompt: input.prompt,
      n: input.n ?? 1,
      size,
      response_format: "url",
      // Seedream defaults to a visible 「AI 生成」mark unless explicitly off
      watermark: input.watermark ?? false,
    };

    if (input.negativePrompt) {
      body.negative_prompt = input.negativePrompt;
    }
    if (input.referenceUrls?.length) {
      body.image = input.referenceUrls[0];
    }

    try {
      const { data } = await axios.post(
        `${input.baseUrl.replace(/\/$/, "")}/images/generations`,
        body,
        { headers: authHeaders(input.apiKey), timeout: 180_000 },
      );

      const images = (data?.data ?? []).map(
        (item: { url?: string; b64_json?: string }) => ({
          url: item.url,
          b64: item.b64_json,
        }),
      );

      return { images, raw: data };
    } catch (error) {
      throw new Error(
        formatProviderError(error, {
          platform: ProviderPlatform.VOLCENGINE,
          fallback: "图片生成失败",
        }),
      );
    }
  }
}

function pickHttpUrl(value: unknown): string | undefined {
  if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.url === "string" && /^https?:\/\//i.test(o.url)) return o.url;
  }
  return undefined;
}

/** Ark Seedance poll payload: content.video_url (object or nested shapes). */
export function extractVolcengineVideoUrl(data: unknown): string | undefined {
  const root = (data ?? {}) as Record<string, unknown>;
  const direct =
    pickHttpUrl(root.video_url) ??
    pickHttpUrl(root.videoUrl) ??
    pickHttpUrl(root.url);
  if (direct) return direct;

  const content = root.content;
  if (content && typeof content === "object" && !Array.isArray(content)) {
    const c = content as Record<string, unknown>;
    const fromObj =
      pickHttpUrl(c.video_url) ??
      pickHttpUrl(c.videoUrl) ??
      pickHttpUrl(c.url);
    if (fromObj) return fromObj;
  }
  if (Array.isArray(content)) {
    for (const item of content) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const nested =
        pickHttpUrl(row.video_url) ??
        pickHttpUrl(row.videoUrl) ??
        pickHttpUrl(row.url) ??
        pickHttpUrl(row.image_url);
      if (nested) return nested;
    }
  }

  for (const key of ["output", "result", "data"] as const) {
    const nested = root[key];
    if (!nested) continue;
    const found = extractVolcengineVideoUrl(nested);
    if (found) return found;
  }
  return undefined;
}

export class VolcengineVideoProvider implements VideoProvider {
  readonly platform = ProviderPlatform.VOLCENGINE;

  async submit(input: VideoSubmitInput): Promise<{ remoteTaskId: string }> {
    const content: Array<Record<string, unknown>> = [
      { type: "text", text: input.prompt },
    ];

    for (const url of input.referenceUrls ?? []) {
      content.push({
        type: "image_url",
        image_url: { url },
      });
    }

    const body: Record<string, unknown> = {
      model: input.model,
      content,
    };

    if (input.ratio) body.ratio = input.ratio;
    if (input.duration) body.duration = input.duration;
    if (input.resolution) body.resolution = input.resolution;

    try {
      const { data } = await axios.post(
        `${input.baseUrl.replace(/\/$/, "")}/contents/generations/tasks`,
        body,
        { headers: authHeaders(input.apiKey), timeout: 60_000 },
      );

      const remoteTaskId = data?.id as string | undefined;
      if (!remoteTaskId) {
        throw new Error("Volcengine video submit missing task id");
      }
      return { remoteTaskId };
    } catch (error) {
      throw new Error(
        formatProviderError(error, {
          platform: ProviderPlatform.VOLCENGINE,
          fallback: "视频提交失败",
        }),
      );
    }
  }

  async poll(params: {
    remoteTaskId: string;
    apiKey: string;
    baseUrl: string;
  }): Promise<VideoPollResult> {
    try {
      const { data } = await axios.get(
        `${params.baseUrl.replace(/\/$/, "")}/contents/generations/tasks/${params.remoteTaskId}`,
        { headers: authHeaders(params.apiKey), timeout: 30_000 },
      );

      const status = String(data?.status ?? "").toLowerCase();
      const videoUrl = extractVolcengineVideoUrl(data);

      if (
        status === "succeeded" ||
        status === "success" ||
        status === "completed" ||
        status === "complete"
      ) {
        if (!videoUrl) {
          // Upstream may mark success a tick before URL is attached — keep polling.
          return { status: "running", raw: data };
        }
        return { status: "succeeded", videoUrl, raw: data };
      }

      // Some gateways omit status but already include the video URL.
      if (videoUrl) {
        return { status: "succeeded", videoUrl, raw: data };
      }

      if (
        status === "failed" ||
        status === "cancelled" ||
        status === "canceled" ||
        status === "expired"
      ) {
        return {
          status: "failed",
          error: formatProviderErrorBody(data, undefined, {
            platform: ProviderPlatform.VOLCENGINE,
            fallback: status || "failed",
          }),
          raw: data,
        };
      }

      if (status === "queued" || status === "pending") {
        return { status: "queued", raw: data };
      }
      return { status: "running", raw: data };
    } catch (error) {
      // Transient network / 5xx — keep polling instead of failing the job.
      return {
        status: "running",
        raw: {
          softError: formatProviderError(error, {
            platform: ProviderPlatform.VOLCENGINE,
            fallback: "视频轮询暂时失败，将重试",
          }),
        },
      };
    }
  }
}
