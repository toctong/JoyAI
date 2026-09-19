/**
 * 漫剧生图 / 生视频提示词拼装（唯一出口）。
 * 概念对齐 ArcReel drama 管线，文案与模板自行重写，不照搬上游。
 */

import type {
  ManjuAssetDraft,
  ManjuGenMode,
  ManjuProjectDraft,
  ManjuShotDraft,
  ManjuVideoSettings,
} from "../manju-types";

export type ReferenceSlot = {
  /** 1-based 「图N」 */
  index: number;
  asset: ManjuAssetDraft;
  label: string;
};

const IMAGE_AVOID =
  "文字、字幕、水印、logo、对话框、二维码、畸形手指、重复肢体、崩坏五官";

const VIDEO_AVOID =
  "BGM、配乐说明、文字字幕、水印、logo、UI 界面、分屏、拼贴";

const KIND_LABEL: Record<ManjuAssetDraft["kind"], string> = {
  character: "角色",
  scene: "场景",
  prop: "道具",
};

function trimJoin(parts: Array<string | null | undefined | false>): string {
  return parts
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
    .join("\n");
}

function styleLine(settings: ManjuVideoSettings): string {
  const style = settings.style?.trim();
  return style ? `风格：${style}` : "";
}

function hasMedia(asset: ManjuAssetDraft): boolean {
  return Boolean(asset.assetId || asset.imageUrl);
}

/** 出场资产中「已有参考图」的稳定顺序：角色 → 场景 → 道具 */
export function resolveShotReferenceSlots(
  shot: ManjuShotDraft,
  project: ManjuProjectDraft,
): ReferenceSlot[] {
  const kindOrder: ManjuAssetDraft["kind"][] = [
    "character",
    "scene",
    "prop",
  ];
  const linked = project.assets.filter(
    (a) => shot.assetRefs.includes(a.id) && hasMedia(a),
  );
  const ordered = kindOrder.flatMap((kind) =>
    linked.filter((a) => a.kind === kind),
  );
  return ordered.map((asset, i) => ({
    index: i + 1,
    asset,
    label: `${KIND_LABEL[asset.kind]}「${asset.name}」`,
  }));
}

export function referenceDeclaration(slots: ReferenceSlot[]): string {
  if (slots.length === 0) return "";
  return `参考图：${slots
    .map((s) => `图${s.index}=${s.label}`)
    .join("；")}。画面中上述主体须与对应参考图外观一致，不要另起炉灶改造型。`;
}

/** 把 @[登记名] 换成「图N」；对不上的保留原 mention */
export function renderReferenceMentions(
  text: string,
  slots: ReferenceSlot[],
): string {
  if (!text) return text;
  const byName = new Map(
    slots.map((s) => [s.asset.name.trim(), s.index] as const),
  );
  return text.replace(/@\[([^\]]+)\]/g, (full, name: string) => {
    const idx = byName.get(String(name).trim());
    return idx != null ? `图${idx}` : full;
  });
}

// ---------------------------------------------------------------------------
// 资产生图
// ---------------------------------------------------------------------------

function assetLayout(kind: ManjuAssetDraft["kind"]): string {
  switch (kind) {
    case "character":
      return "布局：横版三视图，纯白干净背景；从左到右依次为正面全身、正侧（90°）全身、背面全身；三视图面部发型服装配饰必须完全一致，同一人物同一造型。";
    case "scene":
      return "布局：单张环境建立镜头，宽景全貌，画面中不要出现人物。";
    case "prop":
      return "布局：单张道具特写，浅灰或纯净背景，产品级展示，居中清晰。";
  }
}

function assetGuard(kind: ManjuAssetDraft["kind"]): string {
  switch (kind) {
    case "character":
      return "要求：角色设定参考图，细节清晰，适合作为后续分镜一致性参考；不要故事情节画面，不要多人物拼贴。";
    case "scene":
      return "要求：场景概念设定图，空间关系清楚，适合作为分镜场景参考。";
    case "prop":
      return "要求：道具设定图，材质与轮廓清楚，适合作为分镜道具参考。";
  }
}

function assetAvoid(kind: ManjuAssetDraft["kind"]): string {
  const extra =
    kind === "character"
      ? "多角色同框、分镜叙事构图、复杂背景杂物"
      : kind === "scene"
        ? "人物、人脸、文字招牌乱码"
        : "人物手部遮挡主体、复杂生活场景喧宾夺主";
  return `Avoid: ${extra}、${IMAGE_AVOID}`;
}

/** 资产生图最终提示词 */
export function buildAssetImagePrompt(
  asset: ManjuAssetDraft,
  settings: ManjuVideoSettings,
): string {
  const title = `${KIND_LABEL[asset.kind]}设定图：${asset.name.trim() || "未命名"}`;
  const desc =
    asset.description.trim() ||
    "（请补充外貌 / 服饰 / 材质 / 氛围的叙事描述）";
  return trimJoin([
    title,
    styleLine(settings),
    `描述：${desc}`,
    assetLayout(asset.kind),
    assetGuard(asset.kind),
    assetAvoid(asset.kind),
  ]);
}

/** 角色三视图用 16:9，其余按品类默认 */
export function preferredAssetRatio(
  kind: ManjuAssetDraft["kind"],
): ManjuVideoSettings["ratio"] {
  if (kind === "character") return "16:9";
  if (kind === "scene") return "16:9";
  return "1:1";
}

// ---------------------------------------------------------------------------
// 分镜生图
// ---------------------------------------------------------------------------

function fallbackShotScene(shot: ManjuShotDraft): string {
  const parts = [
    shot.visual.trim(),
    shot.dialogue?.trim()
      ? `口型与情绪氛围呼应：「${shot.dialogue.trim()}」`
      : "",
  ].filter(Boolean);
  return parts.join("。") || "（空镜头，请补充画面）";
}

/** 分镜静帧最终提示词 */
export function buildStoryboardImagePrompt(
  shot: ManjuShotDraft,
  project: ManjuProjectDraft,
  slots?: ReferenceSlot[],
): string {
  const refs = slots ?? resolveShotReferenceSlots(shot, project);
  const rawBody = shot.imagePrompt?.trim() || fallbackShotScene(shot);
  const body = renderReferenceMentions(rawBody, refs);
  const ratio = project.settings.ratio;

  return trimJoin([
    `分镜静帧，画幅 ${ratio}`,
    styleLine(project.settings),
    referenceDeclaration(refs),
    `画面：${body}`,
    "电影构图，单帧关键画面，叙事清楚，人物动作可读。",
    `Avoid: ${IMAGE_AVOID}`,
  ]);
}

// ---------------------------------------------------------------------------
// 分镜生视频
// ---------------------------------------------------------------------------

function fallbackVideoBody(shot: ManjuShotDraft): string {
  return (
    shot.visual.trim() ||
    shot.imagePrompt?.trim() ||
    "镜头内动作自然推进"
  );
}

/** 分镜视频最终提示词 */
export function buildStoryboardVideoPrompt(
  shot: ManjuShotDraft,
  project: ManjuProjectDraft,
  options?: {
    slots?: ReferenceSlot[];
    mode?: ManjuGenMode;
    continuityHint?: string | null;
  },
): string {
  const mode = options?.mode ?? project.settings.mode;
  const refs = options?.slots ?? resolveShotReferenceSlots(shot, project);
  const raw = shot.videoPrompt?.trim() || fallbackVideoBody(shot);
  const body = renderReferenceMentions(raw, refs);
  const duration =
    shot.duration && shot.duration > 0
      ? shot.duration
      : project.settings.duration;
  const continuity = options?.continuityHint;

  const modeHint =
    mode === "ref"
      ? "全能参考：外观以参考图为准，正文不要复述外貌服装，专注动作、运镜与气氛。"
      : mode === "grid"
        ? "多宫格分镜延续：保持相邻格人物造型与光影连续。"
        : continuity
          ? "图生视频：以首帧分镜为起点，末帧参考上一镜/本镜收束姿态，镜头过渡自然连贯。"
          : "图生视频：以首帧分镜图为起点，自然演绎镜头内动作，保持人物造型与场景一致。";

  return trimJoin([
    `镜头时长约 ${duration} 秒，画幅 ${project.settings.ratio}`,
    styleLine(project.settings),
    modeHint,
    continuity ?? null,
    mode === "ref" ? referenceDeclaration(refs) : null,
    `动态：${body}`,
    shot.dialogue?.trim()
      ? `可配合对白口型氛围，不要烧录字幕：${shot.dialogue.trim()}`
      : null,
    `Avoid: ${VIDEO_AVOID}`,
  ]);
}

/** 提交 image/video job 时的参考媒体（顺序与「图N」一致） */
export function referenceMediaFromSlots(slots: ReferenceSlot[]): {
  referenceAssetIds: string[];
  referenceUrls: string[];
} {
  const referenceAssetIds = slots
    .map((s) => s.asset.assetId)
    .filter((id): id is string => Boolean(id));
  const referenceUrls = slots
    .map((s) => s.asset.imageUrl)
    .filter((u): u is string => Boolean(u));
  return { referenceAssetIds, referenceUrls };
}
