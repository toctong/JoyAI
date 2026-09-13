import type { CanvasNodeType } from "@joyai/shared";

/** Toolbar actions declared per node type (rendered by NodeFloatToolbar). */
export type NodeToolbarAction =
  | "edit-image"
  | "upload"
  | "download"
  | "spawn-prompt"
  | "outpaint"
  | "inpaint"
  | "text-to-prompt"
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
    defaultWidth: 240,
    defaultHeight: 80,
    defaultData: () => ({ text: "双击编辑文本" }),
    toolbar: ["text-to-prompt", "duplicate", "delete"],
  },
  image: {
    type: "image",
    label: "图像",
    defaultWidth: 240,
    defaultHeight: 180,
    defaultData: () => ({ url: "", assetId: "", status: "idle" }),
    toolbar: [
      "edit-image",
      "upload",
      "spawn-prompt",
      "outpaint",
      "inpaint",
      "download",
      "duplicate",
      "delete",
    ],
  },
  video: {
    type: "video",
    label: "视频",
    defaultWidth: 280,
    defaultHeight: 180,
    defaultData: () => ({ url: "", assetId: "", status: "idle" }),
    toolbar: ["upload", "download", "duplicate", "delete"],
  },
  prompt: {
    type: "prompt",
    label: "提示词",
    defaultWidth: 280,
    defaultHeight: 180,
    defaultData: () => ({
      prompt: "",
      status: "idle",
      jobId: "",
      error: "",
      operation: "generate",
    }),
    toolbar: ["clear-prompt", "retry", "duplicate", "delete"],
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
  return status === "queued" || status === "running";
}

export function isFailedStatus(status: string) {
  return status === "failed";
}
