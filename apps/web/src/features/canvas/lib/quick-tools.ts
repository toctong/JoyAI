export const QUICK_TOOL_IDS = [
  "spawn-prompt",
  "crop",
  "inpaint",
  "redraw",
  "outpaint",
  "scribble",
  "split",
  "rotate",
  "lineart",
  "colorize",
  "character-sheet",
  "node-history",
  "reverse-prompt",
  "angle",
  "to-panorama",
  "lighting",
  "view-image",
  "upload",
  "to-image",
  "save-asset",
  "download",
  "info",
  "duplicate",
  "delete",
] as const;

export type QuickToolId = (typeof QUICK_TOOL_IDS)[number];

/**
 * Reference float bar (image):
 * 参考 | 裁切 擦除 重绘 宫格 | 编辑▾ 效果▾ | 查看 …更多
 */
export const LEAD_BAR_TOOL_IDS: QuickToolId[] = ["spawn-prompt"];

export const PRIMARY_BAR_TOOL_IDS: QuickToolId[] = [
  "crop",
  "inpaint",
  "redraw",
  "split",
];

/** 编辑 dropdown */
export const EDIT_MENU_TOOL_IDS: QuickToolId[] = [
  "outpaint",
  "scribble",
  "lineart",
  "colorize",
  "character-sheet",
  "reverse-prompt",
];

/** 效果 dropdown */
export const EFFECT_MENU_TOOL_IDS: QuickToolId[] = [
  "angle",
  "to-panorama",
  "lighting",
];

/** After effect menus, before 更多 */
export const TRAIL_BAR_TOOL_IDS: QuickToolId[] = ["view-image"];

/** Always under 更多 — never as standalone chips */
export const OVERFLOW_ONLY_TOOL_IDS: QuickToolId[] = [
  "upload",
  "to-image",
];

/** Defaults for the image float toolbar (manage actions live on right-click). */
export const DEFAULT_QUICK_TOOL_IDS: QuickToolId[] = [
  "spawn-prompt",
  "crop",
  "inpaint",
  "redraw",
  "split",
  "outpaint",
  "scribble",
  "rotate",
  "lineart",
  "colorize",
  "character-sheet",
  "reverse-prompt",
  "node-history",
  "angle",
  "to-panorama",
  "lighting",
  "view-image",
  "upload",
];

export const DEFAULT_PANORAMA_QUICK_TOOL_IDS: QuickToolId[] = [
  "spawn-prompt",
  "crop",
  "split",
  "rotate",
  "node-history",
  "view-image",
  "to-image",
  "upload",
];

const EDIT_MENU_SET = new Set<string>(EDIT_MENU_TOOL_IDS);
const EFFECT_MENU_SET = new Set<string>(EFFECT_MENU_TOOL_IDS);

export function isEditMenuToolId(id: string): boolean {
  return EDIT_MENU_SET.has(id);
}

export function isEffectMenuToolId(id: string): boolean {
  return EFFECT_MENU_SET.has(id);
}
