import { getAiTool } from "@/features/ai-tools/tool-catalog";

export type ImageFxMode = "lineart" | "colorize" | "character-sheet";

export type ImageFxDef = {
  mode: ImageFxMode;
  title: string;
  toolSlug: string;
  /** Default gen ratio for the spawned prompt node. */
  ratio: string;
  sideTitle: string;
  stageHint: string;
  noteHint: string;
  notePlaceholder: string;
  /** Show canvas style library picker. */
  styleLibrary: boolean;
  confirmLabel: string;
  basePrompt: string;
};

const FALLBACK_PROMPTS: Record<ImageFxMode, string> = {
  lineart:
    "Convert the reference image into clean black-and-white line art / anime lineart. Crisp ink outlines, minimal shading, pure white background, no color fills, no screentone, no gray wash. Preserve character proportions and key details. Suitable as a coloring base.",
  colorize:
    "Colorize the uploaded line art / sketch while keeping the original outlines. Cel-shading or soft anime coloring, coherent palette, clean flats with light shadows. Do not redraw anatomy drastically; fill colors inside the lines. White or simple studio background unless the sketch already defines a scene.",
  "character-sheet":
    "Create a character design sheet from the reference character. Clean model-sheet layout with front view emphasis, optional side/back suggestions in one image, turnaround vibe, neutral gray background, clear costume callouts, concept art presentation, preserve identity.",
};

function promptFromCatalog(slug: string, mode: ImageFxMode) {
  return getAiTool(slug)?.prompt?.trim() || FALLBACK_PROMPTS[mode];
}

export const IMAGE_FX_DEFS: Record<ImageFxMode, ImageFxDef> = {
  lineart: {
    mode: "lineart",
    title: "图片转线稿",
    toolSlug: "lineart",
    ratio: "1:1",
    sideTitle: "线稿设置",
    stageHint: "确认后新开提示词节点并连线原图 · 用图生图模型出线稿",
    noteHint: "可选补充线稿偏好",
    notePlaceholder: "例如：极细线 / 粗墨线 / 赛璐璐勾线",
    styleLibrary: false,
    confirmLabel: "生成线稿",
    basePrompt: promptFromCatalog("lineart", "lineart"),
  },
  colorize: {
    mode: "colorize",
    title: "线稿上色",
    toolSlug: "sketch-colorize",
    ratio: "1:1",
    sideTitle: "上色设置",
    stageHint: "可从风格库选配色风格 · 确认后新开提示词节点并连线原图",
    noteHint: "可选补充配色或材质偏好",
    notePlaceholder: "例如：莫兰迪马卡龙 / 赛博霓虹",
    styleLibrary: true,
    confirmLabel: "生成上色",
    basePrompt: promptFromCatalog("sketch-colorize", "colorize"),
  },
  "character-sheet": {
    mode: "character-sheet",
    title: "角色设定图",
    toolSlug: "character-sheet",
    ratio: "16:9",
    sideTitle: "设定图设置",
    stageHint: "确认后新开提示词节点并连线原图 · 生成角色设定向展示图",
    noteHint: "可选补充设定图版式",
    notePlaceholder: "例如：三视图 + 表情小样 / 服装细节标注",
    styleLibrary: false,
    confirmLabel: "生成设定图",
    basePrompt: promptFromCatalog("character-sheet", "character-sheet"),
  },
};

export function buildImageFxPrompt(
  mode: ImageFxMode,
  note: string,
  stylePrompt?: string | null,
) {
  const def = IMAGE_FX_DEFS[mode];
  const parts = [def.basePrompt];
  const extra = note.trim();
  if (extra) parts.push(extra);
  const style = stylePrompt?.trim();
  if (style) parts.push(style);
  return parts.join("\n\n");
}
