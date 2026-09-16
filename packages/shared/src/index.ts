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

export const CreateJobSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("image"), input: ImageJobInputSchema }),
  z.object({ kind: z.literal("video"), input: VideoJobInputSchema }),
]);
export type CreateJobInput = z.infer<typeof CreateJobSchema>;

export const QUEUE = {
  IMAGE: "image-generation",
  VIDEO_SUBMIT: "video-submit",
  VIDEO_POLL: "video-poll",
  ASSET_MIRROR: "asset-mirror",
} as const;

export * from "./model-meta";
export * from "./model-catalog";
export * from "./pricing-format";
