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

function authHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function toAsteriskSize(raw: string): string {
  const m = raw.trim().match(/^(\d+)\s*[x×*]\s*(\d+)$/i);
  if (m) return `${m[1]}*${m[2]}`;
  return raw.trim();
}

function isQwenImage(model: string) {
  return /^qwen-image/i.test(model);
}

function isWanImage(model: string) {
  return /^(wan\d|wanx)/i.test(model);
}

function resolveDashscopeImageSize(input: ImageGenerateInput): string | undefined {
  const ratio = input.ratio?.trim();
  const flexible = !ratio || FLEXIBLE.has(ratio.toLowerCase());
  const resKey = (input.resolution ?? "").trim().toUpperCase();

  if (isQwenImage(input.model)) {
    if (flexible) {
      // Default 1:1 at selected tier (or 2K default per docs).
      return resKey === "1K" ? "1024*1024" : "2048*2048";
    }
    const table = resKey === "1K" ? QWEN_1K : QWEN_2K;
    if (table[ratio]) return table[ratio];
  }

  if (isWanImage(input.model) && flexible && /^[12]K$/i.test(resKey)) {
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

  // Wan also accepts 1K/2K keywords.
  if (isWanImage(input.model) && /^\d+(\.\d+)?k$/i.test(raw)) {
    return raw.toUpperCase().replace(/\.0K$/i, "K");
  }

  return toAsteriskSize(raw);
}

function extractDashscopeImages(data: unknown): Array<{ url?: string }> {
  if (!data || typeof data !== "object") return [];
  const root = data as Record<string, unknown>;
  const output = root.output as Record<string, unknown> | undefined;
  const choices = output?.choices;
  const out: Array<{ url?: string }> = [];

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

  // Async synthesis shapes: output.results[].url
  const results = output?.results;
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

/**
 * Aliyun Bailian / DashScope image models (Qwen-Image, Wan image).
 * Native multimodal-generation — not OpenAI `/images/generations`.
 * Channel Base URL may be `.../compatible-mode/v1`; we rewrite to `.../api/v1`.
 */
export class DashscopeImageProvider implements ImageProvider {
  readonly platform = ProviderPlatform.DASHSCOPE;

  async generate(input: ImageGenerateInput): Promise<ImageGenerateResult> {
    const apiBase = resolveDashscopeApiBase(input.baseUrl, input.metadata);

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
        messages: [
          {
            role: "user",
            content,
          },
        ],
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
}
