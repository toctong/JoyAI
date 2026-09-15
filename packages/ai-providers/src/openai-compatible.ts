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

function authHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function normalizeBase(baseUrl: string) {
  return baseUrl.replace(/\/$/, "");
}

/**
 * OpenAI-compatible gateway used by APIMart / ToAPIs (and similar relays).
 */
export class OpenAICompatibleImageProvider implements ImageProvider {
  constructor(readonly platform: string) {}

  async generate(input: ImageGenerateInput): Promise<ImageGenerateResult> {
    const size =
      input.size ??
      (input.width && input.height
        ? `${input.width}x${input.height}`
        : "1024x1024");

    const body: Record<string, unknown> = {
      model: input.model,
      prompt: input.prompt,
      n: input.n ?? 1,
      size,
      response_format: "url",
      watermark: input.watermark ?? false,
    };

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

    // Sync OpenAI shape
    if (Array.isArray(data?.data)) {
      const images = data.data.map(
        (item: { url?: string; b64_json?: string }) => ({
          url: item.url,
          b64: item.b64_json,
        }),
      );
      if (images.length) return { images, raw: data };
    }

    // Async task shape — poll until done
    const taskId =
      data?.task_id ?? data?.id ?? data?.data?.task_id ?? data?.data?.id;
    if (taskId) {
      return this.pollImageTask({
        taskId: String(taskId),
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
      `${params.baseUrl}/images/tasks/${params.taskId}`,
      `${params.baseUrl}/images/generations/${params.taskId}`,
    ];

    for (let attempt = 0; attempt < 60; attempt++) {
      await sleep(2000);
      for (const url of endpoints) {
        try {
          const { data, status } = await axios.get(url, {
            headers: authHeaders(params.apiKey),
            timeout: 30_000,
            validateStatus: () => true,
          });
          if (status >= 400) continue;

          const st = String(
            data?.status ?? data?.task_status ?? data?.data?.status ?? "",
          ).toLowerCase();
          if (
            ["failed", "error", "cancelled"].includes(st) ||
            data?.error
          ) {
            throw new Error(
              formatProviderErrorBody(data, status, {
                platform: this.platform,
                fallback: st || "图片任务失败",
              }),
            );
          }
          const images = extractImages(data);
          if (
            images.length &&
            (["succeeded", "success", "completed", "done"].includes(st) ||
              !st)
          ) {
            return { images, raw: data };
          }
          if (images.length && attempt > 2) {
            return { images, raw: data };
          }
        } catch (e) {
          if (attempt === 59) throw e;
        }
      }
    }
    throw new Error("Image task polling timed out");
  }
}

function extractImages(
  data: Record<string, unknown>,
): Array<{ url?: string; b64?: string }> {
  const bag =
    (data?.data as Record<string, unknown>) ??
    (data?.output as Record<string, unknown>) ??
    data;
  const list =
    (bag as { data?: unknown[] })?.data ??
    (bag as { images?: unknown[] })?.images ??
    (bag as { result?: unknown[] })?.result;
  if (Array.isArray(list)) {
    return list
      .map((item) => {
        if (typeof item === "string") return { url: item };
        const o = item as { url?: string; b64_json?: string; image_url?: string };
        return { url: o.url ?? o.image_url, b64: o.b64_json };
      })
      .filter((i) => i.url || i.b64);
  }
  const single =
    (bag as { url?: string; image_url?: string })?.url ??
    (bag as { image_url?: string })?.image_url;
  if (typeof single === "string") return [{ url: single }];
  return [];
}

export class OpenAICompatibleVideoProvider implements VideoProvider {
  constructor(readonly platform: string) {}

  async submit(input: VideoSubmitInput): Promise<{ remoteTaskId: string }> {
    const base = normalizeBase(input.baseUrl);
    const body: Record<string, unknown> = {
      model: input.model,
      prompt: input.prompt,
    };
    if (input.duration) body.duration = input.duration;
    if (input.ratio) {
      body.ratio = input.ratio;
      body.aspect_ratio = input.ratio;
      body.size = input.ratio;
    }
    if (input.referenceUrls?.length) {
      body.image = input.referenceUrls[0];
      body.images = input.referenceUrls;
      body.input_reference = input.referenceUrls[0];
    }

    const paths = [
      `${base}/videos`,
      `${base}/video/generations`,
      `${base}/videos/generations`,
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
        const remoteTaskId =
          data?.id ??
          data?.task_id ??
          data?.data?.id ??
          data?.data?.task_id;
        if (remoteTaskId) return { remoteTaskId: String(remoteTaskId) };
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
      `${base}/videos/${params.remoteTaskId}`,
      `${base}/tasks/${params.remoteTaskId}`,
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

        const st = String(
          data?.status ?? data?.task_status ?? data?.data?.status ?? "",
        ).toLowerCase();

        if (["failed", "error", "cancelled"].includes(st)) {
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
        if (
          videoUrl &&
          (["succeeded", "success", "completed", "done"].includes(st) || !st)
        ) {
          return { status: "succeeded", videoUrl, raw: data };
        }
        if (st === "queued" || st === "pending") {
          return { status: "queued" };
        }
        if (st) return { status: "running" };
      } catch {
        /* try next */
      }
    }
    return { status: "running" };
  }
}

function extractVideoUrl(data: Record<string, unknown>): string | undefined {
  const bag =
    (data?.data as Record<string, unknown>) ??
    (data?.output as Record<string, unknown>) ??
    data;
  return (
    (bag as { video_url?: string })?.video_url ??
    (bag as { url?: string })?.url ??
    (data?.content as { video_url?: string })?.video_url ??
    (Array.isArray((bag as { data?: { url?: string }[] })?.data)
      ? (bag as { data: { url?: string }[] }).data[0]?.url
      : undefined)
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