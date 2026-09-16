import { z } from "zod";

export const ProviderPlatform = {
  VOLCENGINE: "volcengine",
  APIMART: "apimart",
  TOAPIS: "toapis",
  DASHSCOPE: "dashscope",
} as const;
export type ProviderPlatformId =
  (typeof ProviderPlatform)[keyof typeof ProviderPlatform];

export const ModalitySchema = z.enum(["text", "image", "video", "audio"]);
export type Modality = z.infer<typeof ModalitySchema>;

export const ModelPricingTierSchema = z.object({
  label: z.string(),
  resolution: z.string().optional(),
  perSecond: z.number().optional(),
  perImage: z.number().optional(),
  perVideo: z.number().optional(),
});

export const ModelPricingSchema = z.object({
  currency: z.literal("CNY").default("CNY"),
  billing: z.enum([
    "token",
    "per_image",
    "per_second",
    "per_video",
    "tiered",
  ]),
  inputPer1M: z.number().optional(),
  outputPer1M: z.number().optional(),
  perImage: z.number().optional(),
  perSecond: z.number().optional(),
  perVideo: z.number().optional(),
  tiers: z.array(ModelPricingTierSchema).optional(),
  note: z.string().optional(),
  sourceUrl: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type ModelPricing = z.infer<typeof ModelPricingSchema>;

export const ModelCapabilitiesSchema = z.object({
  input: z.array(ModalitySchema).default(["text"]),
  output: z.array(ModalitySchema),
  /** 参考 / 输入图上限（含首帧、垫图等） */
  maxRefImages: z.number().int().optional(),
  /** 参考视频上限 */
  maxRefVideos: z.number().int().optional(),
  /** 参考音频上限 */
  maxRefAudios: z.number().int().optional(),
  /** 单个参考视频最短时长（秒） */
  minRefVideoDurationSec: z.number().optional(),
  /** 参考视频总时长上限（秒） */
  maxRefVideoDurationSec: z.number().optional(),
  /** 参考音频总时长上限（秒） */
  maxRefAudioDurationSec: z.number().optional(),
  /** 单个参考音频最短时长（秒） */
  minRefAudioDurationSec: z.number().optional(),
  /** 参考图最短边（px） */
  minRefImageSidePx: z.number().int().optional(),
  /** 参考图最长边（px） */
  maxRefImageSidePx: z.number().int().optional(),
  /** 参考图总像素上限（宽×高），如 Seedream 6000×6000 */
  maxRefImagePixels: z.number().int().optional(),
  /** 参考图最小宽高比（宽/高） */
  minRefImageAspect: z.number().optional(),
  /** 参考图最大宽高比（宽/高） */
  maxRefImageAspect: z.number().optional(),
  /** 单张参考图体积上限（字节） */
  maxRefImageBytes: z.number().int().optional(),
  /** 单个参考视频体积上限（字节） */
  maxRefVideoBytes: z.number().int().optional(),
  /** 单个参考音频体积上限（字节） */
  maxRefAudioBytes: z.number().int().optional(),
  maxDurationSec: z.number().optional(),
  /** 输出分辨率档位，如 480p / 720p / 2K */
  resolutions: z.array(z.string()).optional(),
  /** 画幅比例，如 16:9 */
  ratios: z.array(z.string()).optional(),
  /** 精确像素尺寸，如 1024x1024 */
  sizes: z.array(z.string()).optional(),
  async: z.boolean().optional(),
  /**
   * Capability tags (examples):
   * - t2v / i2v / r2v / audio / reference-video
   * - omni-ref — multimodal reference (alias of r2v for UI)
   * - first-last-frame — native first_frame / last_frame roles
   */
  features: z.array(z.string()).optional(),
});
export type ModelCapabilities = z.infer<typeof ModelCapabilitiesSchema>;

export const CHANNEL_PRESETS: Record<
  ProviderPlatformId,
  {
    label: string;
    defaultName: string;
    baseUrl: string;
    docsUrl?: string;
    dashscopeApiBase?: string;
  }
> = {
  [ProviderPlatform.VOLCENGINE]: {
    label: "火山引擎 Ark",
    defaultName: "火山引擎",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    docsUrl:
      "https://ark.volcengine.com/region:cn-beijing/model?view=DEFAULT_VIEW&groupType=ModelGroups",
  },
  [ProviderPlatform.APIMART]: {
    label: "APIMart",
    defaultName: "APIMart 中转",
    baseUrl: "https://apib.ai/v1",
    docsUrl: "https://docs.apimart.ai",
  },
  [ProviderPlatform.TOAPIS]: {
    label: "ToAPIs",
    defaultName: "ToAPIs 中转",
    baseUrl: "https://toapis.cn/v1",
    docsUrl: "https://toapis.cn/market",
  },
  [ProviderPlatform.DASHSCOPE]: {
    label: "阿里云百炼",
    defaultName: "阿里云百炼 / 千问",
    baseUrl: "https://llm-oxwm46w4kzmd5vir.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
    dashscopeApiBase: "https://dashscope.aliyuncs.com/api/v1",
    docsUrl: "https://dashscope.aliyuncs.com/",
  },
};
