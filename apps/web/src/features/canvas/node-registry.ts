import type { CanvasNodeType } from "@joyai/shared";
import { CANVAS_NODE_SIZE } from "@/shared/theme";

/** Toolbar actions declared per node type (rendered by NodeFloatToolbar). */
export type NodeToolbarAction =
  | "upload"
  | "download"
  | "save-asset"
  | "spawn-prompt"
  | "spawn-video"
  | "outpaint"
  | "inpaint"
  | "redraw"
  | "scribble"
  | "lighting"
  | "capture-frame"
  | "extract-audio"
  | "crop"
  | "split"
  | "rotate"
  | "lineart"
  | "colorize"
  | "character-sheet"
  | "node-history"
  | "angle"
  | "view-image"
  | "reverse-prompt"
  | "to-panorama"
  | "to-image"
  | "autorotate"
  | "open-director"
  | "text-to-prompt"
  | "font-down"
  | "font-up"
  | "trim-audio"
  | "clear-prompt"
  | "retry"
  | "duplicate"
  | "delete";

export type NodeRegistryEntry = {
  type: CanvasNodeType;
  label: string;
  defaultWidth: number;
  defaultHeight: number;
  defaultData: () => Record<string, unknown>;
  toolbar: NodeToolbarAction[];
};

export const NODE_REGISTRY: Record<CanvasNodeType, NodeRegistryEntry> = {
  text: {
    type: "text",
    label: "文本",
    defaultWidth: CANVAS_NODE_SIZE.text.width,
    defaultHeight: CANVAS_NODE_SIZE.text.height,
    defaultData: () => ({ text: "双击编辑文本" }),
    toolbar: [
      "font-down",
      "font-up",
      "text-to-prompt",
      "save-asset",
      "duplicate",
      "delete",
    ],
  },
  image: {
    type: "image",
    label: "图像",
    defaultWidth: CANVAS_NODE_SIZE.image.width,
    defaultHeight: CANVAS_NODE_SIZE.image.height,
    defaultData: () => ({ url: "", assetId: "", status: "idle" }),
    toolbar: [
      "upload",
      "spawn-prompt",
      "spawn-video",
      "to-panorama",
      "outpaint",
      "inpaint",
      "redraw",
      "scribble",
      "lighting",
      "crop",
      "split",
      "rotate",
      "lineart",
      "colorize",
      "character-sheet",
      "node-history",
      "angle",
      "view-image",
      "reverse-prompt",
      "save-asset",
      "download",
      "duplicate",
      "delete",
    ],
  },
  video: {
    type: "video",
    label: "视频",
    defaultWidth: CANVAS_NODE_SIZE.video.width,
    defaultHeight: CANVAS_NODE_SIZE.video.height,
    defaultData: () => ({ url: "", assetId: "", status: "idle" }),
    toolbar: [
      "spawn-prompt",
      "upload",
      "capture-frame",
      "extract-audio",
      "trim-audio",
      "node-history",
      "save-asset",
      "download",
      "duplicate",
      "delete",
    ],
  },
  prompt: {
    type: "prompt",
    label: "提示词",
    defaultWidth: CANVAS_NODE_SIZE.prompt.width,
    defaultHeight: CANVAS_NODE_SIZE.prompt.height,
    defaultData: () => ({
      prompt: "",
      status: "idle",
      jobId: "",
      error: "",
      operation: "generate",
      outputKind: "image",
    }),
    toolbar: ["clear-prompt", "retry", "duplicate", "delete"],
  },
  panorama: {
    type: "panorama",
    label: "环视图",
    defaultWidth: CANVAS_NODE_SIZE.panorama.width,
    defaultHeight: CANVAS_NODE_SIZE.panorama.height,
    defaultData: () => ({
      url: "",
      assetId: "",
      status: "idle",
      projection: "equirectangular",
    }),
    toolbar: [
      "autorotate",
      "upload",
      "spawn-prompt",
      "crop",
      "split",
      "rotate",
      "node-history",
      "angle",
      "view-image",
      "reverse-prompt",
      "to-image",
      "save-asset",
      "download",
      "duplicate",
      "delete",
    ],
  },
  audio: {
    type: "audio",
    label: "音频",
    defaultWidth: CANVAS_NODE_SIZE.audio.width,
    defaultHeight: CANVAS_NODE_SIZE.audio.height,
    defaultData: () => ({ url: "", assetId: "", status: "idle" }),
    toolbar: [
      "spawn-prompt",
      "upload",
      "trim-audio",
      "node-history",
      "save-asset",
      "download",
      "duplicate",
      "delete",
    ],
  },
  director: {
    type: "director",
    label: "导演台",
    defaultWidth: CANVAS_NODE_SIZE.director.width,
    defaultHeight: CANVAS_NODE_SIZE.director.height,
    defaultData: () => ({ directorProject: { version: 1, shots: [] } }),
    toolbar: ["open-director", "duplicate", "delete"],
  },
};

export const NODE_TYPE_LIST = Object.values(NODE_REGISTRY).map((e) => ({
  type: e.type,
  label: e.label,
}));

export function createNodeData(type: CanvasNodeType) {
  return NODE_REGISTRY[type].defaultData();
}

export function nodeDefaultSize(type: CanvasNodeType) {
  const e = NODE_REGISTRY[type];
  return { width: e.defaultWidth, height: e.defaultHeight };
}

export function isBusyStatus(status: string) {
  return (
    status === "queued" || status === "running" || status === "polling"
  );
}

export function isFailedStatus(status: string) {
  return status === "failed";
}
