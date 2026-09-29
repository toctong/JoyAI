import { z } from "zod";

export const UserRoleSchema = z.enum(["admin", "creator"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const JobKindSchema = z.enum(["image", "video", "llm", "audio"]);
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
  /** 漫剧项目：创作台 scope=studio 会排除 */
  manjuProjectId: z.string().optional(),
  /** AI 工具 slug：scope=tools 只看该工具，创作台排除 */
  toolSlug: z.string().max(64).optional(),
  /**
   * Studio hover-tool marker (e.g. to-panorama) so the creation feed can
   * offer 720° sphere preview without canvas nodes.
   */
  studioTool: z.string().max(64).optional(),
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
  /** Whether the model should synthesize / keep audio track (provider-dependent). */
  generateAudio: z.boolean().optional(),
  modelId: z.string().optional(),
  canvasProjectId: z.string().optional(),
  canvasNodeId: z.string().optional(),
  manjuProjectId: z.string().optional(),
  toolSlug: z.string().max(64).optional(),
});
export type VideoJobInput = z.infer<typeof VideoJobInputSchema>;

/** TTS / speech synthesis */
export const AudioJobInputSchema = z.object({
  prompt: z.string().min(1).max(4000),
  voice: z.string().optional(),
  format: z.enum(["mp3", "wav", "opus", "aac", "flac", "pcm"]).optional(),
  speed: z.number().min(0.25).max(4).optional(),
  instructions: z.string().max(2000).optional(),
  modelId: z.string().optional(),
  canvasProjectId: z.string().optional(),
  canvasNodeId: z.string().optional(),
  manjuProjectId: z.string().optional(),
});
export type AudioJobInput = z.infer<typeof AudioJobInputSchema>;

/** 用户资产库来源。创作 / 画布 / 漫剧 / AI 工具各自查询；资产页可查全部或按来源分类。 */
export const AssetSourceSchema = z.enum([
  "studio",
  "canvas",
  "manju",
  "tools",
  "upload",
]);
export type AssetSource = z.infer<typeof AssetSourceSchema>;

export function resolveAssetSource(input: {
  source?: string | null;
  jobId?: string | null;
  canvasProjectId?: string | null;
  manjuProjectId?: string | null;
  toolSlug?: string | null;
}): AssetSource {
  if (
    input.source === "studio" ||
    input.source === "canvas" ||
    input.source === "manju" ||
    input.source === "tools" ||
    input.source === "upload"
  ) {
    return input.source;
  }
  if (!input.jobId) return "upload";
  if (input.canvasProjectId) return "canvas";
  if (input.manjuProjectId) return "manju";
  if (input.toolSlug) return "tools";
  return "studio";
}

/** LLM 任务用途：漫剧流水线 / 工具 / 画布 / 可扩展技能 purpose */
export const LlmJobPurposeSchema = z
  .string()
  .min(1)
  .max(64)
  .default("chat");
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
  /** 分集内规划：只合并该集镜头，保留其他集 */
  manjuEpisodeId: z.string().optional(),
  /**
   * analyze_assets 资产合并方式：
   * incremental=按名匹配仅新增；full_add=全部作为新资产；clear_reparse=先清空资产再写入
   */
  analyzeMode: z
    .enum(["incremental", "full_add", "clear_reparse"])
    .optional(),
  /** 画布回写 */
  canvasProjectId: z.string().optional(),
  canvasNodeId: z.string().optional(),
  /** 视觉参考（反推提示词等） */
  referenceAssetIds: z.array(z.string()).optional(),
  referenceUrls: z.array(z.string()).optional(),
  /** AI 工具页：按 slug 隔离历史 */
  toolSlug: z.string().max(64).optional(),
});
export type LlmJobInput = z.infer<typeof LlmJobInputSchema>;
export type ManjuAnalyzeMode = NonNullable<LlmJobInput["analyzeMode"]>;

export const ManjuAnalyzeAssetItemSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  aliases: z.array(z.string()).default([]),
});
export const ManjuAnalyzeEpisodeSchema = z.object({
  title: z.string().min(1),
  summary: z.string().default(""),
});
export const ManjuAnalyzeShotSchema = z.object({
  /** 全局镜号。缺省时服务端按数组顺序从 1 编号；已有镜头时乱编号会被拒绝 */
  index: z.number().int().positive().optional(),
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

/** 分集规划：只切集，不写镜头 */
export const ManjuEpisodePlanResultSchema = z.object({
  episodes: z
    .array(
      z.object({
        title: z.string().min(1),
        summary: z.string().default(""),
        hook: z.string().default(""),
        startQuote: z.string().default(""),
        endQuote: z.string().default(""),
      }),
    )
    .min(1),
});
export type ManjuEpisodePlanResult = z.infer<typeof ManjuEpisodePlanResultSchema>;

/** 连载记忆技能的 JSON。不写镜头、对白或提示词 */
export const ManjuSeriesMemoryResultSchema = z.object({
  world: z.string().default(""),
  bios: z
    .array(
      z.object({
        name: z.string().min(1),
        bio: z.string().default(""),
      }),
    )
    .default([]),
  hooks: z.array(z.string().min(1)).default([]),
});
export type ManjuSeriesMemoryResult = z.infer<
  typeof ManjuSeriesMemoryResultSchema
>;

/** 剧本 AI 帮写：不自动回写项目，由前端「应用」 */
export const ManjuScriptWriteResultSchema = z.object({
  intent: z.enum(["create", "revise", "qa"]).default("create"),
  reply: z.string().default(""),
  script: z.string().default(""),
  /** 本集钩子；只进分集字段，不进正文 */
  hook: z.string().default(""),
  /** 题材标签（应用剧本时写入草稿，不可手改） */
  tags: z.array(z.string()).default([]),
});
export type ManjuScriptWriteResult = z.infer<
  typeof ManjuScriptWriteResultSchema
>;

export const ManjuSeriesBioSchema = z.object({
  name: z.string(),
  bio: z.string().default(""),
});
export const ManjuSeriesHookSchema = z.object({
  text: z.string(),
  status: z.enum(["open", "paid"]).default("open"),
});
export const ManjuSeriesSchema = z.object({
  world: z.string().default(""),
  bios: z.array(ManjuSeriesBioSchema).default([]),
  hooks: z.array(ManjuSeriesHookSchema).default([]),
});
export type ManjuSeries = z.infer<typeof ManjuSeriesSchema>;

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
  /** 宫格布局；仅 mode=grid 时生效 */
  gridLayout: z.enum(["2x2", "3x3"]).default("2x2"),
  style: z.string().default(
    "电影感写实，自然光影，细腻皮肤质感，电影级构图",
  ),
  /** 风格模板 id；选模板时写入 style 文案，可再手工改 style */
  styleId: z.string().optional(),
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
  aliases: z.array(z.string()).default([]),
  /** 衍生资产挂在本体上；本体为 null。提及写作 @[本体/衍生] */
  parentId: z.string().nullable().default(null),
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
  /** 画面/对白改过、已有图需要重做 */
  storyboardStale: z.boolean().default(false),
  /** 画面/对白改过、已有视频需要重做 */
  videoStale: z.boolean().default(false),
  /** 宫格同批 id；同组镜头共享一次宫格生图 */
  gridGroupId: z.string().nullable().default(null),
  /** 宫格格号 0-based 行优先 */
  gridCellIndex: z.number().int().min(0).nullable().default(null),
  /** i2v 末帧（可选） */
  endFrameAssetId: z.string().nullable().default(null),
  endFrameImageUrl: z.string().nullable().default(null),
  /** 结构化对白/旁白；空则回退 dialogue 字符串 */
  utterances: z
    .array(
      z.object({
        kind: z.enum(["dialogue", "voiceover"]),
        speaker: z.string().optional(),
        text: z.string(),
      }),
    )
    .default([]),
});

export const ManjuEpisodeDraftSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string().default(""),
  hook: z.string().default(""),
  /** 从原文按首尾引文切出的本集片段，可空 */
  sourceText: z.string().default(""),
});

export const ManjuDraftSchema = z.object({
  version: z.literal(1).default(1),
  /** Studio 顶栏阶段：筹备 / 剧本 / 制作 / 完成 */
  phase: z
    .enum(["preparation", "script", "production", "completed"])
    .default("preparation"),
  scriptText: z.string().default(""),
  overview: z.string().default(""),
  /** 素材标签（题材/类型等） */
  tags: z.array(z.string()).default([]),
  /** 脚本规划已确认后才允许写画面/视频提示词 */
  scriptConfirmed: z.boolean().default(false),
  /** 剧本审阅区（可与 scriptConfirmed 同步） */
  scriptReview: z
    .object({
      status: z.enum(["draft", "confirmed"]).default("draft"),
      content: z.string().default(""),
    })
    .default({ status: "draft", content: "" }),
  settings: ManjuVideoSettingsSchema.default({}),
  assets: z.array(ManjuAssetDraftSchema).default([]),
  shots: z.array(ManjuShotDraftSchema).default([]),
  episodes: z.array(ManjuEpisodeDraftSchema).default([]),
  /** 连载记忆：不参与生图，也不改已确认对白 */
  series: ManjuSeriesSchema.default({}),
  completedSteps: z.array(ManjuStepIdSchema).default([]),
  lastAnalyzeJobId: z.string().nullable().optional(),
  /** 本地 time-machine 快照（嵌在 draft JSON 内） */
  draftSnapshots: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        createdAt: z.string(),
        draft: z.unknown(),
      }),
    )
    .default([]),
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
  z.object({ kind: z.literal("audio"), input: AudioJobInputSchema }),
]);
export type CreateJobInput = z.infer<typeof CreateJobSchema>;

export const QUEUE = {
  IMAGE: "image-generation",
  VIDEO_SUBMIT: "video-submit",
  VIDEO_POLL: "video-poll",
  ASSET_MIRROR: "asset-mirror",
  LLM: "llm-generation",
  AUDIO: "audio-generation",
} as const;

export * from "./model-meta";
export * from "./capability-dict";
export * from "./adapters";
export * from "./protocol";
export * from "./model-catalog";
export * from "./pricing-format";
export * from "./manju/script-write-genres";
export * from "./project-chat";
export * from "./media-url";
