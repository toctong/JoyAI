export const IMAGE_QUICK_TOOLS_KEY = "joyai-canvas-image-quick-tools-v1";
export const PANORAMA_QUICK_TOOLS_KEY = "joyai-canvas-panorama-quick-tools-v2";

export const QUICK_TOOL_IDS = [
  "edit-image",
  "spawn-prompt",
  "spawn-video",
  "outpaint",
  "inpaint",
  "crop",
  "split",
  "upscale",
  "angle",
  "view-image",
  "copy-prompt",
  "reverse-prompt",
  "upload",
  "toggle-resize",
  "to-panorama",
  "to-image",
  "gen",
  "save-asset",
  "download",
  "info",
  "duplicate",
  "delete",
] as const;

export type QuickToolId = (typeof QUICK_TOOL_IDS)[number];

export type QuickToolsConfig = {
  ids: QuickToolId[];
  showLabels: boolean;
};

const ALL = new Set<string>(QUICK_TOOL_IDS);

/** Matches infinite-canvas defaults, plus JoyAI 编辑 / 生图 / 生视频. */
export const DEFAULT_QUICK_TOOL_IDS: QuickToolId[] = [
  "edit-image",
  "spawn-prompt",
  "spawn-video",
  "inpaint",
  "crop",
  "split",
  "upscale",
  "reverse-prompt",
  "copy-prompt",
  "upload",
  "save-asset",
  "download",
  "info",
  "duplicate",
  "delete",
];

/** Always stay on the float toolbar — not parked under 更多. */
export const PINNED_BAR_TOOL_IDS: QuickToolId[] = [
  "info",
  "duplicate",
  "delete",
];

export const DEFAULT_PANORAMA_QUICK_TOOL_IDS: QuickToolId[] = [
  "spawn-prompt",
  "to-image",
  "upload",
  "crop",
  "split",
  "upscale",
  "reverse-prompt",
  "copy-prompt",
  "save-asset",
  "download",
  "info",
  "duplicate",
  "delete",
];

function normalizeIds(value: unknown, fallback: QuickToolId[]): QuickToolId[] {
  if (!Array.isArray(value)) return fallback;
  const picked = new Set(value.filter((id): id is QuickToolId => ALL.has(String(id))));
  return QUICK_TOOL_IDS.filter((id) => picked.has(id));
}

export function readQuickTools(
  key: string,
  fallbackIds: QuickToolId[],
): QuickToolsConfig {
  if (typeof window === "undefined") {
    return { ids: fallbackIds, showLabels: true };
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { ids: fallbackIds, showLabels: true };
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return { ids: normalizeIds(parsed, fallbackIds), showLabels: true };
    }
    if (!parsed || typeof parsed !== "object") {
      return { ids: fallbackIds, showLabels: true };
    }
    const data = parsed as Partial<QuickToolsConfig>;
    return {
      ids: Array.isArray(data.ids)
        ? normalizeIds(data.ids, fallbackIds)
        : fallbackIds,
      showLabels: data.showLabels !== false,
    };
  } catch {
    return { ids: fallbackIds, showLabels: true };
  }
}

export function writeQuickTools(key: string, config: QuickToolsConfig) {
  window.localStorage.setItem(key, JSON.stringify(config));
}
