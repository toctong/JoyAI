import axios from "axios";
import { ProviderPlatform } from "@joyai/shared";
import type { ImageGenerateInput, ImageGenerateResult, ImageProvider } from "./types";
import { formatProviderErrorBody } from "./http-error";
import { resolveImageSize } from "./image-size";
import { resolveDashscopeApiBase } from "./dashscope-video";

const FLEXIBLE = new Set(["auto", "adaptive", "keep"]);

/** Qwen-Image 2.x documented WxH (asterisk) tables. */
const QWEN_2K: Record<string, string> = {
  "1:1": "2048*2048",
  "16:9": "2688*1536",
  "9:16": "1536*2688",
  "4:3": "2368*1728",
  "3:4": "1728*2368",
  "3:2": "2496*1664",
  "2:3": "1664*2496",
};

const QWEN_1K: Record<string, string> = {
  "1:1": "1024*1024",
  "16:9": "1280*720",
  "9:16": "720*1280",
  "4:3": "1152*864",
  "3:4": "864*1152",
  "3:2": "1248*832",
  "2:3": "832*1248",
};

/** Wanx 2.1 T2I only supports a small fixed size set. */
const WANX21_SIZES: Record<string, string> = {
  "1:1": "1024*1024",
  "16:9": "1280*720",
  "9:16": "720*1280",
  "3:4": "768*1152",
  "2:3": "768*1152",
  "4:3": "1024*1024",
  "3:2": "1024*1024",
};

function authHeaders(apiKey: string, asyncEnable = false) {
  const h: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (asyncEnable) h["X-DashScope-Async"] = "enable";
  return h;
}

function toAsteriskSize(raw: string): string {
  const m = raw.trim().match(/^(\d+)\s*[x×*]\s*(\d+)$/i);
  if (m) return `${m[1]}*${m[2]}`;
  return raw.trim();
}

function isQwenImage(model: string) {
  return /^qwen-image/i.test(model);
}

/** Wan 2.6+ / wan*-image multimodal sync models. */
function isWanMultimodalImage(model: string) {
  return /^wan2\.[6-9]-image/i.test(model) || /^wan3\.\d+-image/i.test(model);
}

/** Classic async text2image (wanx2.1-t2i-*, wan2.5-t2i-*, wan2.2-t2i-*). */
function isWanxAsyncT2i(model: string) {
  return (
    /^wanx2\.1-t2i/i.test(model) ||
    /^wanx2\.0-t2i/i.test(model) ||
    /^wan2\.[0-5]-t2i/i.test(model) ||
    /^wan2\.2-t2i/i.test(model)
  );
}

function isWanxImageEdit(model: string) {
  return /imageedit/i.test(model) || /^wanx2\.1-i2i/i.test(model);
}

function resolveDashscopeImageSize(input: ImageGenerateInput): string | undefined {
  const ratio = input.ratio?.trim();
  const flexible = !ratio || FLEXIBLE.has(ratio.toLowerCase());
  const resKey = (input.resolution ?? "").trim().toUpperCase();

  if (isQwenImage(input.model)) {
    if (flexible) {
      return resKey === "1K" ? "1024*1024" : "2048*2048";
    }
    const table = resKey === "1K" ? QWEN_1K : QWEN_2K;
    if (table[ratio]) return table[ratio];
  }

  if (isWanxAsyncT2i(input.model)) {
    if (flexible || !ratio) return "1024*1024";
    return WANX21_SIZES[ratio] ?? "1024*1024";
  }

  if (isWanMultimodalImage(input.model) && flexible && /^[12]K$/i.test(resKey)) {
    return resKey;
  }

  const raw = resolveImageSize({
    size: input.size,
    width: input.width,
    height: input.height,
    ratio: input.ratio,
    resolution: input.resolution,
    catalogSizes: input.catalogSizes,
    mode: input.sizeMode ?? "auto",
    fallback: "1024x1024",
  });

  if (isWanMultimodalImage(input.model) && /^\d+(\.\d+)?k$/i.test(raw)) {
    return raw.toUpperCase().replace(/\.0K$/i, "K");
  }

  return toAsteriskSize(raw);
}

function extractDashscopeImages(data: unknown): Array<{ url?: string }> {
  if (!data || typeof data !== "object") return [];
  const root = data as Record<string, unknown>;
  const output = (root.output ?? root) as Record<string, unknown>;
  const out: Array<{ url?: string }> = [];

  const choices = output.choices;
  if (Array.isArray(choices)) {
    for (const choice of choices) {
      if (!choice || typeof choice !== "object") continue;
      const message = (choice as { message?: { content?: unknown } }).message;
      const content = message?.content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (!part || typeof part !== "object") continue;
        const img = (part as { image?: unknown }).image;
        if (typeof img === "string" && /^https?:\/\//i.test(img)) {
          out.push({ url: img });
        }
      }
    }
  }

  const results = output.results;
  if (Array.isArray(results)) {
    for (const row of results) {
      if (!row || typeof row !== "object") continue;
      const url = (row as { url?: unknown }).url;
      if (typeof url === "string" && /^https?:\/\//i.test(url)) {
        out.push({ url });
      }
    }
  }

  return out;
}

function pickTaskId(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const root = data as Record<string, unknown>;
  const output = root.output as Record<string, unknown> | undefined;
  const id = output?.task_id ?? root.task_id ?? root.id;
  return id != null && String(id).length ? String(id) : undefined;
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

async function pollDashscopeTask(params: {
  apiBase: string;
  apiKey: string;
  taskId: string;
}): Promise<ImageGenerateResult> {
  const url = `${params.apiBase}/tasks/${params.taskId}`;
  for (let attempt = 0; attempt < 90; attempt++) {
    await sleep(2000);
    const { data, status } = await axios.get(url, {
      headers: authHeaders(params.apiKey),
      timeout: 30_000,
      validateStatus: () => true,
    });

    if (status >= 400 || (data as { code?: string })?.code) {
      throw new Error(
        formatProviderErrorBody(data, status, {
          platform: ProviderPlatform.DASHSCOPE,
          fallback: "图片任务查询失败",
        }),
      );
    }

    const output = (data as { output?: Record<string, unknown> })?.output;
    const st = String(
      output?.task_status ?? (data as { task_status?: string })?.task_status ?? "",
    ).toUpperCase();

    if (st === "FAILED" || st === "CANCELED" || st === "UNKNOWN") {
      throw new Error(
        formatProviderErrorBody(data, status, {
          platform: ProviderPlatform.DASHSCOPE,
          fallback: st || "图片任务失败",
        }),
      );
    }

    if (st === "SUCCEEDED") {
      const images = extractDashscopeImages(data);
      if (!images.length) {
        throw new Error("任务已完成但未返回图片 URL");
      }
      return { images, raw: data };
    }
  }
  throw new Error("图片任务轮询超时，请稍后重试");
}

/**
 * Aliyun Bailian / DashScope image models.
 * - Qwen-Image / Wan 2.6+ image → multimodal-generation (sync)
 * - Wanx 2.1 / Wan 2.5 T2I → text2image/image-synthesis (async)
 * - Wanx imageedit → image2image/image-synthesis (async)
 */
export class DashscopeImageProvider implements ImageProvider {
  readonly platform = ProviderPlatform.DASHSCOPE;

  async generate(input: ImageGenerateInput): Promise<ImageGenerateResult> {
    const apiBase = resolveDashscopeApiBase(input.baseUrl, input.metadata);

    if (isWanxImageEdit(input.model)) {
      return this.generateImageEdit(apiBase, input);
    }
    if (isWanxAsyncT2i(input.model)) {
      return this.generateAsyncT2i(apiBase, input);
    }
    return this.generateMultimodal(apiBase, input);
  }

  private async generateMultimodal(
    apiBase: string,
    input: ImageGenerateInput,
  ): Promise<ImageGenerateResult> {
    const refs = (input.referenceUrls ?? []).filter((u) =>
      /^https?:\/\//i.test(u),
    );
    const content: Array<Record<string, string>> = [];
    for (const url of refs) {
      content.push({ image: url });
    }
    content.push({ text: input.prompt });

    const parameters: Record<string, unknown> = {
      watermark: input.watermark ?? false,
      prompt_extend: true,
      n: input.n ?? 1,
    };
    const size = resolveDashscopeImageSize(input);
    if (size) parameters.size = size;
    if (input.negativePrompt) {
      parameters.negative_prompt = input.negativePrompt;
    }

    const body = {
      model: input.model,
      input: {
        messages: [{ role: "user", content }],
      },
      parameters,
    };

    const url = `${apiBase}/services/aigc/multimodal-generation/generation`;
    const { data, status } = await axios.post(url, body, {
      headers: authHeaders(input.apiKey),
      timeout: 180_000,
      validateStatus: () => true,
    });

    if (status >= 400 || (data as { code?: string })?.code) {
      throw new Error(
        formatProviderErrorBody(data, status, {
          platform: ProviderPlatform.DASHSCOPE,
          fallback: "图片生成失败",
        }),
      );
    }

    const images = extractDashscopeImages(data);
    if (!images.length) {
      throw new Error(
        formatProviderErrorBody(data, status, {
          platform: ProviderPlatform.DASHSCOPE,
          fallback: "图片生成成功但未返回 URL",
        }),
      );
    }
    return { images, raw: data };
  }

  private async generateAsyncT2i(
    apiBase: string,
    input: ImageGenerateInput,
  ): Promise<ImageGenerateResult> {
    const parameters: Record<string, unknown> = {
      n: Math.min(Math.max(input.n ?? 1, 1), 4),
    };
    const size = resolveDashscopeImageSize(input);
    if (size) parameters.size = size;

    const inputBag: Record<string, unknown> = {
      prompt: input.prompt,
    };
    if (input.negativePrompt) {
      inputBag.negative_prompt = input.negativePrompt;
    }
    // Optional ref pad image for some wanx models
    const ref = (input.referenceUrls ?? []).find((u) => /^https?:\/\//i.test(u));
    if (ref) inputBag.ref_img = ref;

    const body = {
      model: input.model,
      input: inputBag,
      parameters,
    };

    const url = `${apiBase}/services/aigc/text2image/image-synthesis`;
    const { data, status } = await axios.post(url, body, {
      headers: authHeaders(input.apiKey, true),
      timeout: 60_000,
      validateStatus: () => true,
    });

    if (status >= 400 || (data as { code?: string })?.code) {
      throw new Error(
        formatProviderErrorBody(data, status, {
          platform: ProviderPlatform.DASHSCOPE,
          fallback: "图片任务提交失败",
        }),
      );
    }

    const taskId = pickTaskId(data);
    if (!taskId) {
      // Some responses may return sync results
      const images = extractDashscopeImages(data);
      if (images.length) return { images, raw: data };
      throw new Error("缺少图片任务 ID");
    }

    return pollDashscopeTask({
      apiBase,
      apiKey: input.apiKey,
      taskId,
    });
  }

  private async generateImageEdit(
    apiBase: string,
    input: ImageGenerateInput,
  ): Promise<ImageGenerateResult> {
    const ref = (input.referenceUrls ?? []).find((u) => /^https?:\/\//i.test(u));
    if (!ref) {
      throw new Error("Wanx 图像编辑需要至少 1 张参考图");
    }

    const body = {
      model: input.model,
      input: {
        function: "description_edit",
        prompt: input.prompt,
        base_image_url: ref,
      },
      parameters: {
        n: Math.min(Math.max(input.n ?? 1, 1), 4),
      },
    };

    const url = `${apiBase}/services/aigc/image2image/image-synthesis`;
    const { data, status } = await axios.post(url, body, {
      headers: authHeaders(input.apiKey, true),
      timeout: 60_000,
      validateStatus: () => true,
    });

    if (status >= 400 || (data as { code?: string })?.code) {
      throw new Error(
        formatProviderErrorBody(data, status, {
          platform: ProviderPlatform.DASHSCOPE,
          fallback: "图像编辑任务提交失败",
        }),
      );
    }

    const taskId = pickTaskId(data);
    if (!taskId) {
      const images = extractDashscopeImages(data);
      if (images.length) return { images, raw: data };
      throw new Error("缺少图像编辑任务 ID");
    }

    return pollDashscopeTask({
      apiBase,
      apiKey: input.apiKey,
      taskId,
    });
  }
}
