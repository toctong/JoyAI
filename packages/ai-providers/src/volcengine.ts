import axios from "axios";
import type {
  ImageGenerateInput,
  ImageGenerateResult,
  ImageProvider,
  VideoPollResult,
  VideoProvider,
  VideoSubmitInput,
} from "./types";
import { ProviderPlatform } from "@joyai/shared";
import { formatProviderError, formatProviderErrorBody } from "./http-error";

function authHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

export class VolcengineImageProvider implements ImageProvider {
  readonly platform = ProviderPlatform.VOLCENGINE;

  async generate(input: ImageGenerateInput): Promise<ImageGenerateResult> {
    const size =
      input.size ??
      (input.width && input.height
        ? `${input.width}x${input.height}`
        : "2048x2048");

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
      if (status === "succeeded" || status === "success") {
        const videoUrl =
          data?.content?.video_url ??
          data?.output?.video_url ??
          data?.result?.video_url;
        if (!videoUrl) {
          return { status: "failed", error: "未返回视频地址", raw: data };
        }
        return { status: "succeeded", videoUrl, raw: data };
      }
      if (status === "failed" || status === "cancelled") {
        return {
          status: "failed",
          error: formatProviderErrorBody(data, undefined, {
            platform: ProviderPlatform.VOLCENGINE,
            fallback: status,
          }),
          raw: data,
        };
      }
      return { status: status === "queued" ? "queued" : "running" };
    } catch (error) {
      return {
        status: "failed",
        error: formatProviderError(error, {
          platform: ProviderPlatform.VOLCENGINE,
          fallback: "视频轮询失败",
        }),
      };
    }
  }
}
