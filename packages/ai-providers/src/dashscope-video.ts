import axios from "axios";
import { CHANNEL_PRESETS, ProviderPlatform } from "@joyai/shared";
import type {
  VideoPollResult,
  VideoProvider,
  VideoSubmitInput,
} from "./types";

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
  readonly platform = ProviderPlatform.DASHSCOPE;

  async submit(input: VideoSubmitInput): Promise<{ remoteTaskId: string }> {
    const apiBase = resolveDashscopeApiBase(input.baseUrl, input.metadata);
    const isI2v = /i2v/i.test(input.model) || (input.referenceUrls?.length ?? 0) > 0;

    const body: Record<string, unknown> = {
      model: input.model,
      input: {
        prompt: input.prompt,
      } as Record<string, unknown>,
      parameters: {} as Record<string, unknown>,
    };

    const parameters = body.parameters as Record<string, unknown>;
    if (input.duration) parameters.duration = Math.round(input.duration);
    if (input.ratio) parameters.ratio = input.ratio;
    if (input.resolution) parameters.resolution = input.resolution;
    if (input.watermark != null) parameters.watermark = input.watermark;

    if (isI2v && input.referenceUrls?.length) {
      (body.input as Record<string, unknown>).media = [
        {
          type: "first_frame",
          url: input.referenceUrls[0],
        },
      ];
    }

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
        data?.message ?? data?.code ?? "DashScope video submit missing task_id",
      );
    }
    return { remoteTaskId: String(remoteTaskId) };
  }

  async poll(params: {
    remoteTaskId: string;
    apiKey: string;
    baseUrl: string;
    metadata?: Record<string, unknown> | null;
  }): Promise<VideoPollResult> {
    const apiBase = resolveDashscopeApiBase(params.baseUrl, params.metadata);
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
        return { status: "failed", error: "Missing video_url", raw: data };
      }
      return { status: "succeeded", videoUrl, raw: data };
    }
    if (status === "FAILED" || status === "CANCELED" || status === "UNKNOWN") {
      return {
        status: "failed",
        error:
          data?.output?.message ??
          data?.message ??
          data?.output?.code ??
          status,
        raw: data,
      };
    }
    if (status === "PENDING") return { status: "queued" };
    return { status: "running" };
  }
}
