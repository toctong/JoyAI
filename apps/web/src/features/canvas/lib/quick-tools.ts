export const IMAGE_QUICK_TOOLS_KEY = "joyai-canvas-image-quick-tools-v10";
export const PANORAMA_QUICK_TOOLS_KEY = "joyai-canvas-panorama-quick-tools-v5";

export const QUICK_TOOL_IDS = [
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

/** Image float bar defaults — edit actions sit under the 编辑 menu. */
export const DEFAULT_QUICK_TOOL_IDS: QuickToolId[] = [
  "split",
  "to-panorama",
  "toggle-resize",
  "save-asset",
  "download",
  "info",
  "duplicate",
  "delete",
];

/** Tools that live under the 编辑 dropdown on the float bar (not as standalone chips). */
export const EDIT_MENU_TOOL_IDS: QuickToolId[] = [
  "upload",
  "inpaint",
  "outpaint",
  "crop",
  "upscale",
  "angle",
  "view-image",
];

/** Always shown as main-bar chips when available (not under 编辑 / 更多). */
export const BAR_ALWAYS_TOOL_IDS: QuickToolId[] = [
  "split",
  "to-panorama",
  "toggle-resize",
];

/** Prompt helpers stay under 更多 — never as main-bar chips. */
export const OVERFLOW_ONLY_TOOL_IDS: QuickToolId[] = [
  "reverse-prompt",
  "copy-prompt",
];

const EDIT_MENU_SET = new Set<string>(EDIT_MENU_TOOL_IDS);
const BAR_ALWAYS_SET = new Set<string>(BAR_ALWAYS_TOOL_IDS);
const OVERFLOW_ONLY_SET = new Set<string>(OVERFLOW_ONLY_TOOL_IDS);

export function isEditMenuToolId(id: string): boolean {
  return EDIT_MENU_SET.has(id);
}

export function isBarAlwaysToolId(id: string): boolean {
  return BAR_ALWAYS_SET.has(id);
}

export function isOverflowOnlyToolId(id: string): boolean {
  return OVERFLOW_ONLY_SET.has(id);
}

/** Always stay on the float toolbar — not parked under 更多. */
export const PINNED_BAR_TOOL_IDS: QuickToolId[] = [
  "info",
  "duplicate",
  "delete",
];

export const DEFAULT_PANORAMA_QUICK_TOOL_IDS: QuickToolId[] = [
  "to-image",
  "upload",
  "crop",
  "split",
  "upscale",
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
