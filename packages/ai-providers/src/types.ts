export type ImageGenerateInput = {
  prompt: string;
  negativePrompt?: string;
  /** Exact size string (WxH or 2K). Takes precedence when set. */
  size?: string;
  width?: number;
  height?: number;
  /** Aspect ratio from UI, e.g. 16:9 */
  ratio?: string;
  /** Resolution tier from UI, e.g. 2K / 1080p */
  resolution?: string;
  /** Catalog sizes (WxH) from the selected model */
  catalogSizes?: string[];
  /** Prefer keyword (2K) vs pixels (WxH) */
  sizeMode?: "keyword" | "pixels" | "auto";
  n?: number;
  /** Seedream / compatible gateways: visible corner mark. Default false. */
  watermark?: boolean;
  referenceUrls?: string[];
  model: string;
  apiKey: string;
  baseUrl: string;
};

export type ImageGenerateResult = {
  images: Array<{ url?: string; b64?: string }>;
  raw?: unknown;
};

export type VideoSubmitInput = {
  prompt: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  ratio?: string;
  duration?: number;
  resolution?: string;
  watermark?: boolean;
  referenceUrls?: string[];
  /** Channel metadata (e.g. dashscopeApiBase) */
  metadata?: Record<string, unknown> | null;
};

export type VideoPollResult =
  | { status: "running" | "queued"; raw?: unknown }
  | { status: "succeeded"; videoUrl: string; raw?: unknown }
  | { status: "failed"; error: string; raw?: unknown };

export interface ImageProvider {
  readonly platform: string;
  generate(input: ImageGenerateInput): Promise<ImageGenerateResult>;
}

export interface VideoProvider {
  readonly platform: string;
  submit(input: VideoSubmitInput): Promise<{ remoteTaskId: string }>;
  poll(params: {
    remoteTaskId: string;
    apiKey: string;
    baseUrl: string;
    metadata?: Record<string, unknown> | null;
  }): Promise<VideoPollResult>;
}
