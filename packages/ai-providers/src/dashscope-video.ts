import axios from "axios";
import { CHANNEL_PRESETS, ProviderPlatform } from "@joyai/shared";
import type {
  VideoPollResult,
  VideoProvider,
  VideoSubmitInput,
} from "./types";
import { formatProviderError, formatProviderErrorBody } from "./http-error";

function authHeaders(apiKey: string, async = false) {
  const h: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (async) h["X-DashScope-Async"] = "enable";
  return h;
}

/** Derive DashScope native API root from compatible-mode baseUrl or metadata. */
export function resolveDashscopeApiBase(
  baseUrl: string,
  metadata?: Record<string, unknown> | null,
): string {
  const fromMeta = metadata?.dashscopeApiBase;
  if (typeof fromMeta === "string" && fromMeta) {
    return fromMeta.replace(/\/$/, "");
  }
  const preset = CHANNEL_PRESETS[ProviderPlatform.DASHSCOPE].dashscopeApiBase;
  if (preset) return preset.replace(/\/$/, "");

  // compatible-mode/v1 → api/v1
  if (baseUrl.includes("compatible-mode")) {
    return baseUrl.replace(/\/compatible-mode\/v1\/?$/, "/api/v1").replace(/\/$/, "");
  }
  if (baseUrl.includes("/api/v1")) {
    return baseUrl.replace(/\/$/, "");
  }
  return "https://dashscope.aliyuncs.com/api/v1";
}

/**
 * Aliyun Bailian / DashScope HappyHorse (and similar) video synthesis.
 * Native async API — not OpenAI chat completions.
 */
export class DashscopeVideoProvider implements VideoProvider {
  readonly adapterId = "dashscope-video";
  readonly platform = ProviderPlatform.DASHSCOPE;

  async submit(input: VideoSubmitInput): Promise<{ remoteTaskId: string }> {
    const apiBase = resolveDashscopeApiBase(input.baseUrl, input.metadata);
    const refs = input.referenceUrls ?? [];
    const isI2v = /i2v/i.test(input.model) || refs.length > 0;
    const isR2v = /r2v/i.test(input.model);

    let prompt = input.prompt;
    if (input.refMode === "first_last" && refs.length > 0) {
      prompt =
        refs.length >= 2
          ? `【首尾帧约束】请将第 1 张参考图作为视频首帧、第 2 张参考图作为视频尾帧，在两帧之间生成自然连贯的过渡动画。用户需求：${input.prompt}`
          : `【首帧约束】请将参考图作为视频首帧，据此生成后续动作。用户需求：${input.prompt}`;
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
    if (input.ratio) parameters.ratio = input.ratio;
    if (input.resolution) parameters.resolution = input.resolution;
    if (input.watermark != null) parameters.watermark = input.watermark;

    if (refs.length && (isI2v || isR2v || input.refMode)) {
      const media: Array<Record<string, unknown>> = [];
      if (
        input.refMode === "first_last" &&
        !input.firstLastViaPrompt &&
        refs.length > 0
      ) {
        media.push({ type: "first_frame", url: refs[0] });
        if (refs[1]) media.push({ type: "last_frame", url: refs[1] });
      } else if (input.refMode === "first_last" && refs.length > 0) {
        // Prompt fallback path still attach as first/last when DashScope accepts it
        media.push({ type: "first_frame", url: refs[0] });
        if (refs[1]) media.push({ type: "last_frame", url: refs[1] });
      } else {
        media.push(
          ...refs.map((url) => ({
            type: isR2v ? "reference_image" : "first_frame",
            url,
          })),
        );
      }
      (body.input as Record<string, unknown>).media = media;
    }

    try {
      const { data } = await axios.post(
        `${apiBase}/services/aigc/video-generation/video-synthesis`,
        body,
        {
          headers: authHeaders(input.apiKey, true),
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
