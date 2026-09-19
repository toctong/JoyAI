import { z } from "zod";

export const UserRoleSchema = z.enum(["admin", "creator"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const JobKindSchema = z.enum(["image", "video", "llm"]);
export type JobKind = z.infer<typeof JobKindSchema>;

export const JobStatusSchema = z.enum([
  "queued",
  "running",
  "polling",
  "succeeded",
  "failed",
  "cancelled",
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const CanvasNodeTypeSchema = z.enum([
  "image",
  "text",
  "prompt",
  "video",
  "panorama",
  "audio",
  "director",
]);
export type CanvasNodeType = z.infer<typeof CanvasNodeTypeSchema>;

export const CanvasNodeSchema = z.object({
  id: z.string(),
  type: CanvasNodeTypeSchema,
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  data: z.record(z.unknown()),
});
export type CanvasNode = z.infer<typeof CanvasNodeSchema>;

export const CanvasEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
});
export type CanvasEdge = z.infer<typeof CanvasEdgeSchema>;

const CanvasViewportSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number(),
});

/** Accepts v1 (no edges) and v2; always normalize via `normalizeCanvasSnapshot`. */
export const CanvasSnapshotSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  viewport: CanvasViewportSchema,
  nodes: z.array(CanvasNodeSchema),
  edges: z.array(CanvasEdgeSchema).optional().default([]),
});
export type CanvasSnapshot = {
  version: 2;
  viewport: z.infer<typeof CanvasViewportSchema>;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
};

export function normalizeCanvasSnapshot(
  raw: unknown,
): CanvasSnapshot | null {
  const parsed = CanvasSnapshotSchema.safeParse(raw);
  if (!parsed.success) return null;
  return {
    version: 2,
    viewport: parsed.data.viewport,
    nodes: parsed.data.nodes,
    edges: parsed.data.edges ?? [],
  };
}

export const ImageEditOperationSchema = z.enum([
  "generate",
  "outpaint",
  "inpaint",
]);
export type ImageEditOperation = z.infer<typeof ImageEditOperationSchema>;

export const ImageJobInputSchema = z.object({
  prompt: z.string().min(1).max(4000),
  negativePrompt: z.string().max(2000).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  size: z.string().optional(),
  /** UI layout: 16:9 / 1:1 / auto … */
  ratio: z.string().optional(),
  /** UI clarity tier: 1K / 2K / 4K … */
  resolution: z.string().optional(),
  n: z.number().int().min(1).max(4).default(1),
  referenceAssetIds: z.array(z.string()).optional(),
  referenceUrls: z.array(z.string().url()).optional(),
  modelId: z.string().optional(),
  canvasProjectId: z.string().optional(),
  canvasNodeId: z.string().optional(),
  /** Future provider ops; currently treated as generate + reference. */
  operation: ImageEditOperationSchema.optional().default("generate"),
});
export type ImageJobInput = z.infer<typeof ImageJobInputSchema>;

export const VideoJobInputSchema = z.object({
  prompt: z.string().min(1).max(4000),
  duration: z.number().positive().optional(),
  ratio: z.string().optional(),
  resolution: z.string().optional(),
  referenceAssetIds: z.array(z.string()).optional(),
  referenceUrls: z.array(z.string().url()).optional(),
  /** omni = multimodal refs; first_last = first/last frame (native or prompt fallback) */
  refMode: z.enum(["omni", "first_last"]).optional(),
  modelId: z.string().optional(),
  canvasProjectId: z.string().optional(),
  canvasNodeId: z.string().optional(),
});
export type VideoJobInput = z.infer<typeof VideoJobInputSchema>;

/** LLM 任务用途：漫剧分析 / 画布反推 / 通用聊天 */
export const LlmJobPurposeSchema = z.enum([
  "analyze_assets",
  "split_shots",
  "script_plan",
  "author_prompts",
  "reverse_prompt",
  "chat",
]);
export type LlmJobPurpose = z.infer<typeof LlmJobPurposeSchema>;

export const LlmJobInputSchema = z.object({
  /** 用户侧主文本（剧本/问题） */
  prompt: z.string().min(1).max(100_000),
  purpose: LlmJobPurposeSchema.default("chat"),
  systemPrompt: z.string().max(20_000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  modelId: z.string().optional(),
  /** 关联漫剧项目：完成后可回写 draft */
  manjuProjectId: z.string().optional(),
  /** 画布回写 */
  canvasProjectId: z.string().optional(),
  canvasNodeId: z.string().optional(),
  /** 视觉参考（反推提示词等） */
  referenceAssetIds: z.array(z.string()).optional(),
  referenceUrls: z.array(z.string()).optional(),
});
export type LlmJobInput = z.infer<typeof LlmJobInputSchema>;

export const ManjuAnalyzeAssetItemSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
});
export const ManjuAnalyzeEpisodeSchema = z.object({
  title: z.string().min(1),
  summary: z.string().default(""),
});
export const ManjuAnalyzeShotSchema = z.object({
  visual: z.string().min(1),
  dialogue: z.string().default(""),
  assetNames: z.array(z.string()).default([]),
  /** 所属分集标题，须与已登记 episodes.title 一致 */
  episodeTitle: z.string().default(""),
});
export const ManjuAnalyzeResultSchema = z.object({
  overview: z.string().default(""),
  characters: z.array(ManjuAnalyzeAssetItemSchema).default([]),
  scenes: z.array(ManjuAnalyzeAssetItemSchema).default([]),
  props: z.array(ManjuAnalyzeAssetItemSchema).default([]),
  episodes: z.array(ManjuAnalyzeEpisodeSchema).default([]),
  shots: z.array(ManjuAnalyzeShotSchema).default([]),
});
export type ManjuAnalyzeResult = z.infer<typeof ManjuAnalyzeResultSchema>;

export const ManjuAuthorPromptSchema = z.object({
  shots: z
    .array(
      z.object({
        index: z.number().int().positive(),
        imagePrompt: z.string().min(1),
        videoPrompt: z.string().min(1),
      }),
    )
    .min(1),
});
export type ManjuAuthorPromptResult = z.infer<typeof ManjuAuthorPromptSchema>;

export const ManjuStepIdSchema = z.enum([
  "script",
  "video-settings",
  "assets",
  "storyboard-script",
  "storyboard-video",
  "preview",
]);

export const ManjuVideoSettingsSchema = z.object({
  ratio: z.enum(["9:16", "16:9", "1:1", "4:3", "3:4", "21:9"]).default("9:16"),
  mode: z.enum(["i2v", "ref", "grid"]).default("i2v"),
  style: z.string().default("电影感写实"),
  duration: z.number().positive().default(5),
  /** 渠道模型 id（管理后台启用的模型） */
  llmModelId: z.string().optional(),
  imageModelId: z.string().optional(),
  videoModelId: z.string().optional(),
});

export const ManjuJobStatusSchema = z.enum([
  "idle",
  "queued",
  "running",
  "polling",
  "succeeded",
  "failed",
]);

export const ManjuAssetDraftSchema = z.object({
  id: z.string(),
  kind: z.enum(["character", "scene", "prop"]),
  name: z.string(),
  description: z.string().default(""),
  imageUrl: z.string().nullable().default(null),
  assetId: z.string().nullable().default(null),
  jobId: z.string().nullable().default(null),
  status: ManjuJobStatusSchema.default("idle"),
});

export const ManjuShotDraftSchema = z.object({
  id: z.string(),
  index: z.number().int().positive(),
  visual: z.string().default(""),
  dialogue: z.string().default(""),
  imagePrompt: z.string().default(""),
  videoPrompt: z.string().default(""),
  assetRefs: z.array(z.string()).default([]),
  episodeId: z.string().nullable().default(null),
  /** 单镜时长秒；null/缺省则用项目 settings.duration */
  duration: z.number().positive().nullable().default(null),
  storyboardImageUrl: z.string().nullable().default(null),
  storyboardAssetId: z.string().nullable().default(null),
  storyboardJobId: z.string().nullable().default(null),
  storyboardStatus: ManjuJobStatusSchema.default("idle"),
  videoUrl: z.string().nullable().default(null),
  videoAssetId: z.string().nullable().default(null),
  videoJobId: z.string().nullable().default(null),
  videoStatus: ManjuJobStatusSchema.default("idle"),
});

export const ManjuEpisodeDraftSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string().default(""),
});

export const ManjuDraftSchema = z.object({
  version: z.literal(1).default(1),
  scriptText: z.string().default(""),
  overview: z.string().default(""),
  /** 脚本规划已确认后才允许写画面/视频提示词 */
  scriptConfirmed: z.boolean().default(false),
  settings: ManjuVideoSettingsSchema.default({}),
  assets: z.array(ManjuAssetDraftSchema).default([]),
  shots: z.array(ManjuShotDraftSchema).default([]),
  episodes: z.array(ManjuEpisodeDraftSchema).default([]),
  completedSteps: z.array(ManjuStepIdSchema).default([]),
  lastAnalyzeJobId: z.string().nullable().optional(),
});
export type ManjuDraft = z.infer<typeof ManjuDraftSchema>;

export function normalizeManjuDraft(raw: unknown): ManjuDraft {
  const parsed = ManjuDraftSchema.safeParse(raw ?? {});
  if (parsed.success) return parsed.data;
  return ManjuDraftSchema.parse({});
}

export const CreateJobSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("image"), input: ImageJobInputSchema }),
  z.object({ kind: z.literal("video"), input: VideoJobInputSchema }),
  z.object({ kind: z.literal("llm"), input: LlmJobInputSchema }),
]);
export type CreateJobInput = z.infer<typeof CreateJobSchema>;

export const QUEUE = {
  IMAGE: "image-generation",
  VIDEO_SUBMIT: "video-submit",
  VIDEO_POLL: "video-poll",
  ASSET_MIRROR: "asset-mirror",
  LLM: "llm-generation",
} as const;

export * from "./model-meta";
export * from "./adapters";
export * from "./protocol";
export * from "./model-catalog";
export * from "./pricing-format";
