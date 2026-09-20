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
  /**
   * From catalog `capabilities.async`.
   * When true, prefer async task submit+poll over sync response.
   */
  async?: boolean;
  /** From catalog `capabilities.protocol` — openai-images dialect etc. */
  protocol?: {
    imageProfile?: string;
    modelAlias?: string;
    imagePath?: "generations" | "edits";
  } | null;
  model: string;
  apiKey: string;
  baseUrl: string;
  /** Channel metadata (e.g. dashscopeApiBase) */
  metadata?: Record<string, unknown> | null;
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
  /** Parallel to referenceUrls when known (image | video | audio). */
  referenceMediaKinds?: Array<"image" | "video" | "audio" | string>;
  /** omni = reference_image*; first_last = first/last frame roles or prompt fallback */
  refMode?: "omni" | "first_last";
  /** When true, first_last uses reference_image + prompt prefix instead of native roles */
  firstLastViaPrompt?: boolean;
  /** Channel metadata (e.g. dashscopeApiBase) */
  metadata?: Record<string, unknown> | null;
};

export type VideoPollResult =
  | { status: "running" | "queued"; raw?: unknown }
  | { status: "succeeded"; videoUrl: string; raw?: unknown }
  | { status: "failed"; error: string; raw?: unknown };

/** OpenAI-compatible multimodal content parts (vision). */
export type LlmContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type LlmChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | LlmContentPart[];
};

export type LlmChatInput = {
  model: string;
  apiKey: string;
  baseUrl: string;
  messages: LlmChatMessage[];
  temperature?: number;
  metadata?: Record<string, unknown> | null;
};

export type LlmChatResult = {
  text: string;
  raw?: unknown;
};

export interface ImageProvider {
  /** Protocol adapter id (openai-images / ark-images / …) */
  readonly adapterId: string;
  /** @deprecated Prefer adapterId; kept for logs / legacy */
  readonly platform: string;
  generate(input: ImageGenerateInput): Promise<ImageGenerateResult>;
}

export interface VideoProvider {
  readonly adapterId: string;
  /** @deprecated Prefer adapterId; kept for logs / legacy */
  readonly platform: string;
  submit(input: VideoSubmitInput): Promise<{ remoteTaskId: string }>;
  poll(params: {
    remoteTaskId: string;
    apiKey: string;
    baseUrl: string;
    metadata?: Record<string, unknown> | null;
  }): Promise<VideoPollResult>;
}

export interface LlmProvider {
  readonly adapterId: string;
  readonly platform: string;
  chat(input: LlmChatInput): Promise<LlmChatResult>;
}

export type AudioGenerateInput = {
  prompt: string;
  voice?: string;
  format?: "mp3" | "wav" | "opus" | "aac" | "flac" | "pcm";
  speed?: number;
  instructions?: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  metadata?: Record<string, unknown> | null;
};

export type AudioGenerateResult = {
  audio: {
    /** Raw speech bytes from the provider */
    bytes: Uint8Array;
    mimeType: string;
    format: string;
  };
  raw?: unknown;
};

export interface AudioProvider {
  readonly adapterId: string;
  readonly platform: string;
  generate(input: AudioGenerateInput): Promise<AudioGenerateResult>;
}
