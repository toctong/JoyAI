/**
 * Unified FrameRally params → vendor field notes.
 * Adapters implement the actual mapping; this module documents the contract
 * and small shared helpers so new models stay on existing adapterIds.
 */

/** Fields Studio / Jobs may send (image). */
export type UnifiedImageParams = {
  prompt: string;
  negativePrompt?: string;
  ratio?: string;
  resolution?: string;
  size?: string;
  n?: number;
  referenceUrls?: string[];
  watermark?: boolean;
  async?: boolean;
};

/** Fields Studio / Jobs may send (video). */
export type UnifiedVideoParams = {
  prompt: string;
  ratio?: string;
  resolution?: string;
  duration?: number;
  referenceUrls?: string[];
  refMode?: "omni" | "first_last";
  watermark?: boolean;
};

/**
 * How each adapter typically maps unified fields (documentation / tests).
 * Not executed at runtime — adapters own the real builders.
 */
export const ADAPTER_PARAM_NOTES: Record<
  string,
  { ratio?: string; resolution?: string; refs?: string; async?: string }
> = {
  "openai-images": {
    ratio: "Often folded into size / aspect_ratio (gateway-specific)",
    resolution: "size keyword (2K) or WxH depending on model dialect",
    refs: "image_urls[] or image (edit models)",
    async: "When capabilities.async + task_id → poll /tasks/{id}",
  },
  "openai-videos": {
    ratio: "aspect_ratio or size per gateway",
    resolution: "resolution / size string",
    refs: "image_urls / input_reference",
    async: "Always submit + poll",
  },
  "ark-images": {
    ratio: "Combined with resolution via resolveImageSize → size",
    resolution: "2K / WxH on /images/generations",
    refs: "image (first URL)",
    async: "Usually sync URL response",
  },
  "ark-video": {
    ratio: "content[] / parameters per Seedance",
    resolution: "parameters.resolution",
    refs: "content roles (reference_image / first_frame / …)",
    async: "submit task + poll",
  },
  "dashscope-images": {
    ratio: "size as 1024*1024 (asterisk)",
    resolution: "mapped via Qwen/Wanx size tables",
    refs: "multimodal content[].image or imageedit",
    async: "Wanx families use X-DashScope-Async; Qwen multimodal sync",
  },
  "dashscope-video": {
    ratio: "size / ratio native fields",
    resolution: "native",
    refs: "media / img_url depending on model family",
    async: "Always task poll",
  },
};

/** Flexible UI ratios that should not be sent as numeric W:H. */
const FLEXIBLE_RATIOS = new Set(["auto", "adaptive", "keep"]);

export function isFlexibleRatio(ratio?: string | null): boolean {
  if (!ratio) return true;
  return FLEXIBLE_RATIOS.has(ratio.trim().toLowerCase());
}
