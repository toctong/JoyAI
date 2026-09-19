import type { ManjuStepId } from "./config/manju-steps";
import {
  buildAssetImagePrompt,
  buildStoryboardImagePrompt,
  buildStoryboardVideoPrompt,
} from "./lib/prompt-builders";

export type ManjuAspectRatio = "9:16" | "16:9" | "1:1" | "4:3" | "3:4" | "21:9";

export type ManjuGenMode = "i2v" | "ref" | "grid";

export type ManjuJobStatus =
  | "idle"
  | "queued"
  | "running"
  | "polling"
  | "succeeded"
  | "failed";

export type ManjuVideoSettings = {
  ratio: ManjuAspectRatio;
  mode: ManjuGenMode;
  style: string;
  duration: number;
  llmModelId?: string;
  imageModelId?: string;
  videoModelId?: string;
};

export type ManjuShotDraft = {
  id: string;
  index: number;
  /** 画面 / 动作描述 */
  visual: string;
  dialogue: string;
  imagePrompt: string;
  videoPrompt: string;
  /** 关联角色/场景/道具资产 id */
  assetRefs: string[];
  /** 分镜静帧 */
  storyboardImageUrl: string | null;
  storyboardAssetId: string | null;
  storyboardJobId: string | null;
  storyboardStatus: ManjuJobStatus;
  /** 镜头视频 */
  videoUrl: string | null;
  videoAssetId: string | null;
  videoJobId: string | null;
  videoStatus: ManjuJobStatus;
};

export type ManjuAssetDraft = {
  id: string;
  kind: "character" | "scene" | "prop";
  name: string;
  description: string;
  imageUrl: string | null;
  assetId: string | null;
  jobId: string | null;
  status: ManjuJobStatus;
};

export type ManjuEpisodeDraft = {
  id: string;
  title: string;
  summary: string;
};

export type ManjuProjectDraft = {
  id: string;
  title: string;
  scriptText: string;
  overview: string;
  scriptConfirmed: boolean;
  settings: ManjuVideoSettings;
  /** @deprecated 兼容旧本地草稿 */
  settingsSummary?: string;
  assets: ManjuAssetDraft[];
  shots: ManjuShotDraft[];
  episodes: ManjuEpisodeDraft[];
  completedSteps: ManjuStepId[];
  lastAnalyzeJobId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export const DEFAULT_SETTINGS: ManjuVideoSettings = {
  ratio: "9:16",
  mode: "i2v",
  style: "电影感写实",
  duration: 5,
};

export const STYLE_PRESETS = [
  "电影感写实",
  "暗色水墨",
  "日系动漫",
  "赛博朋克",
  "国风工笔",
  "3D 渲染",
] as const;

export const RATIO_OPTIONS: { id: ManjuAspectRatio; label: string }[] = [
  { id: "9:16", label: "竖屏 9:16" },
  { id: "16:9", label: "横屏 16:9" },
  { id: "1:1", label: "方形 1:1" },
  { id: "4:3", label: "4:3" },
  { id: "3:4", label: "3:4" },
  { id: "21:9", label: "影院 21:9" },
];

export const MODE_OPTIONS: {
  id: ManjuGenMode;
  title: string;
  desc: string;
}[] = [
  {
    id: "i2v",
    title: "图生视频",
    desc: "以分镜图驱动，构图更可控",
  },
  {
    id: "ref",
    title: "全能参考",
    desc: "多参考图直出，连贯性更好",
  },
  {
    id: "grid",
    title: "多宫格",
    desc: "批量宫格出片，适合快剪",
  },
];

export function createEmptyShot(index: number): ManjuShotDraft {
  return {
    id: crypto.randomUUID(),
    index,
    visual: "",
    dialogue: "",
    imagePrompt: "",
    videoPrompt: "",
    assetRefs: [],
    storyboardImageUrl: null,
    storyboardAssetId: null,
    storyboardJobId: null,
    storyboardStatus: "idle",
    videoUrl: null,
    videoAssetId: null,
    videoJobId: null,
    videoStatus: "idle",
  };
}

export function createEmptyAsset(
  kind: ManjuAssetDraft["kind"],
  name = "",
): ManjuAssetDraft {
  return {
    id: crypto.randomUUID(),
    kind,
    name: name || (kind === "character" ? "新角色" : kind === "scene" ? "新场景" : "新道具"),
    description: "",
    imageUrl: null,
    assetId: null,
    jobId: null,
    status: "idle",
  };
}

export function createEmptyProject(title = "未命名漫剧"): ManjuProjectDraft {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title,
    scriptText: "",
    overview: "",
    scriptConfirmed: false,
    settings: { ...DEFAULT_SETTINGS },
    assets: [],
    shots: [],
    episodes: [],
    completedSteps: [],
    lastAnalyzeJobId: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** 将旧 persist 数据规范到当前结构 */
export function normalizeProject(raw: unknown): ManjuProjectDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.id !== "string" || typeof p.title !== "string") return null;

  const settingsRaw = p.settings as Partial<ManjuVideoSettings> | undefined;
  const summary =
    typeof p.settingsSummary === "string" ? p.settingsSummary : "";

  const settings: ManjuVideoSettings = {
    ratio: (settingsRaw?.ratio as ManjuAspectRatio) ?? DEFAULT_SETTINGS.ratio,
    mode: (settingsRaw?.mode as ManjuGenMode) ?? DEFAULT_SETTINGS.mode,
    style:
      settingsRaw?.style ??
      (summary.trim() || DEFAULT_SETTINGS.style),
    duration: settingsRaw?.duration ?? DEFAULT_SETTINGS.duration,
    llmModelId: settingsRaw?.llmModelId ?? "",
    imageModelId: settingsRaw?.imageModelId ?? "",
    videoModelId: settingsRaw?.videoModelId ?? "",
  };

  const assets = Array.isArray(p.assets)
    ? (p.assets as ManjuAssetDraft[]).map((a) => ({
        ...createEmptyAsset(a.kind ?? "character", a.name),
        ...a,
        status: a.status ?? "idle",
        imageUrl: a.imageUrl ?? null,
        assetId: a.assetId ?? null,
        jobId: a.jobId ?? null,
      }))
    : [];

  const shots = Array.isArray(p.shots)
    ? (p.shots as ManjuShotDraft[]).map((s, i) => ({
        ...createEmptyShot(typeof s.index === "number" ? s.index : i + 1),
        ...s,
        storyboardStatus: s.storyboardStatus ?? "idle",
        videoStatus: s.videoStatus ?? "idle",
        storyboardImageUrl: s.storyboardImageUrl ?? null,
        storyboardAssetId: s.storyboardAssetId ?? null,
        storyboardJobId: s.storyboardJobId ?? null,
        videoUrl: s.videoUrl ?? null,
        videoAssetId: s.videoAssetId ?? null,
        videoJobId: s.videoJobId ?? null,
        assetRefs: Array.isArray(s.assetRefs) ? s.assetRefs : [],
        imagePrompt: typeof s.imagePrompt === "string" ? s.imagePrompt : "",
        videoPrompt: typeof s.videoPrompt === "string" ? s.videoPrompt : "",
      }))
    : [];

  return {
    id: p.id,
    title: p.title,
    scriptText: typeof p.scriptText === "string" ? p.scriptText : "",
    overview: typeof p.overview === "string" ? p.overview : "",
    scriptConfirmed: p.scriptConfirmed === true,
    settings,
    assets,
    shots,
    episodes: Array.isArray(p.episodes)
      ? (p.episodes as ManjuEpisodeDraft[])
      : [],
    completedSteps: Array.isArray(p.completedSteps)
      ? (p.completedSteps as ManjuStepId[])
      : [],
    lastAnalyzeJobId:
      typeof p.lastAnalyzeJobId === "string" ? p.lastAnalyzeJobId : null,
    createdAt:
      typeof p.createdAt === "string" ? p.createdAt : new Date().toISOString(),
    updatedAt:
      typeof p.updatedAt === "string" ? p.updatedAt : new Date().toISOString(),
  };
}

/** 简单从剧本拆分镜：按空行或「镜头N」切块 */
export function parseScriptToShots(script: string): ManjuShotDraft[] {
  const text = script.trim();
  if (!text) return [];

  const blocks = text
    .split(/\n{2,}|(?=^\s*镜头\s*\d+)/m)
    .map((b) => b.trim())
    .filter(Boolean);

  return blocks.slice(0, 40).map((block, i) => {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const dialogueLine = lines.find((l) => /[「『"]/.test(l) || /^对白[:：]/.test(l));
    const visual = lines
      .filter((l) => l !== dialogueLine)
      .join("\n")
      .replace(/^镜头\s*\d+[:：]?\s*/m, "");
    const dialogue = dialogueLine
      ? dialogueLine.replace(/^对白[:：]\s*/, "")
      : "";
    return {
      ...createEmptyShot(i + 1),
      visual: visual || block,
      dialogue,
    };
  });
}

export function buildAssetPrompt(
  asset: ManjuAssetDraft,
  settings: ManjuVideoSettings,
): string {
  return buildAssetImagePrompt(asset, settings);
}

export function buildShotImagePrompt(
  shot: ManjuShotDraft,
  project: ManjuProjectDraft,
): string {
  return buildStoryboardImagePrompt(shot, project);
}

export function buildShotVideoPrompt(
  shot: ManjuShotDraft,
  project: ManjuProjectDraft,
): string {
  return buildStoryboardVideoPrompt(shot, project);
}

export function isBusyStatus(status: ManjuJobStatus): boolean {
  return status === "queued" || status === "running" || status === "polling";
}

export function stepCanAdvance(
  step: ManjuStepId,
  project: ManjuProjectDraft,
): { ok: boolean; reason?: string } {
  switch (step) {
    case "script":
      return project.scriptText.trim().length >= 10
        ? { ok: true }
        : { ok: false, reason: "请先粘贴至少一段剧本内容" };
    case "video-settings":
      return project.settings.style.trim()
        ? { ok: true }
        : { ok: false, reason: "请选择或填写视觉风格" };
    case "assets":
      return project.assets.length > 0
        ? { ok: true }
        : { ok: false, reason: "请至少添加一个角色/场景/道具" };
    case "storyboard-script":
      return project.shots.some((s) => s.visual.trim())
        ? { ok: true }
        : { ok: false, reason: "请至少写好一个分镜画面描述" };
    case "storyboard-video":
      return project.shots.some((s) => s.videoUrl)
        ? { ok: true }
        : { ok: false, reason: "请至少生成一个镜头视频后再预览" };
    case "preview":
      return { ok: true };
    default:
      return { ok: true };
  }
}

const STOP_NAMES = new Set([
  "然后",
  "突然",
  "这时",
  "此时",
  "镜头",
  "画面",
  "旁白",
  "对白",
  "场景",
  "室内",
  "室外",
  "白天",
  "夜晚",
  "上午",
  "下午",
]);

/**
 * 启发式抽取角色 / 场景 / 道具（ArcReel analyze_assets 的轻量本地版；后续可换 LLM job）
 */
export function extractAssetsFromScript(script: string): ManjuAssetDraft[] {
  const text = script.trim();
  if (!text) return [];

  const characters = new Map<string, string>();
  const scenes = new Map<string, string>();
  const props = new Map<string, string>();

  // 「角色名：对白」或 【角色名】
  for (const m of text.matchAll(
    /(?:^|\n)\s*[【\[]?\s*([\u4e00-\u9fff·]{2,6})\s*[】\]]?\s*[：:]\s*(.+)/g,
  )) {
    const name = m[1]!;
    if (STOP_NAMES.has(name)) continue;
    if (!characters.has(name)) {
      characters.set(name, `剧本出场角色：${name}`);
    }
  }

  // 「XX说 / XX道 / XX问」
  for (const m of text.matchAll(
    /([\u4e00-\u9fff·]{2,4})(?:说|道|问|喊|答|笑道|怒道)/g,
  )) {
    const name = m[1]!;
    if (STOP_NAMES.has(name)) continue;
    if (!characters.has(name)) characters.set(name, `对话角色：${name}`);
  }

  // 场景提示：场景：/地点：/室内·室外
  for (const m of text.matchAll(
    /(?:场景|地点|场景名)\s*[:：]\s*([^\n，。；]{2,20})/g,
  )) {
    const name = m[1]!.trim();
    if (name) scenes.set(name, `剧本场景：${name}`);
  }
  for (const m of text.matchAll(
    /((?:室内|室外|城内|巷口|客栈|宫殿|街道|山巅|海边|雨夜)[^\n，。；]{0,10})/g,
  )) {
    const name = m[1]!.trim();
    if (name.length >= 2 && !scenes.has(name)) {
      scenes.set(name, `氛围场景：${name}`);
    }
  }

  // 道具：手持/拿出/佩戴
  for (const m of text.matchAll(
    /(?:手持|拿出|佩戴|握着|举起)\s*([\u4e00-\u9fff]{1,8})/g,
  )) {
    const name = m[1]!;
    if (!props.has(name)) props.set(name, `出场道具：${name}`);
  }

  const out: ManjuAssetDraft[] = [];
  for (const [name, description] of characters) {
    out.push({ ...createEmptyAsset("character", name), description });
  }
  for (const [name, description] of scenes) {
    out.push({ ...createEmptyAsset("scene", name), description });
  }
  for (const [name, description] of props) {
    out.push({ ...createEmptyAsset("prop", name), description });
  }
  return out;
}

export type ManjuPanel =
  | "overview"
  | "characters"
  | "scenes"
  | "props"
  | "timeline"
  | "prompts"
  | "preview";

export type ManjuSkill =
  | "analyze_assets"
  | "script_plan"
  | "author_prompts"
  | null;

/** ArcReel 式「下一步该做什么」 */
export function getWorkflowNextAction(project: ManjuProjectDraft): {
  stepId: ManjuStepId;
  panel: ManjuPanel;
  skill: ManjuSkill;
  label: string;
  detail: string;
} {
  if (project.scriptText.trim().length < 10) {
    return {
      stepId: "script",
      panel: "overview",
      skill: null,
      label: "完善原文",
      detail: "粘贴小说或成品剧本，作为后续技能的输入",
    };
  }
  if (project.assets.length === 0) {
    return {
      stepId: "assets",
      panel: "overview",
      skill: "analyze_assets",
      label: "分析资产",
      detail: "技能 analyze_assets：抽取角色、场景、道具和分集",
    };
  }
  if (project.shots.length === 0) {
    return {
      stepId: "storyboard-script",
      panel: "timeline",
      skill: "script_plan",
      label: "规划分镜",
      detail: "技能 script_plan：锁定镜头、对白和出场资产",
    };
  }
  if (!project.scriptConfirmed) {
    return {
      stepId: "storyboard-script",
      panel: "timeline",
      skill: null,
      label: "确认脚本",
      detail: "确认后才会写画面/视频提示词，避免改写对白",
    };
  }
  if (
    project.shots.some(
      (s) => !s.imagePrompt?.trim() || !s.videoPrompt?.trim(),
    )
  ) {
    return {
      stepId: "storyboard-script",
      panel: "prompts",
      skill: "author_prompts",
      label: "编写提示词",
      detail: "技能 author_prompts：只补画面/视频提示词，不改镜序与对白",
    };
  }
  if (!project.assets.some((a) => a.imageUrl)) {
    return {
      stepId: "assets",
      panel: "characters",
      skill: null,
      label: "生成设定图",
      detail: "用渠道图像模型出角色/场景/道具参考图",
    };
  }
  if (!project.shots.some((s) => s.storyboardImageUrl)) {
    return {
      stepId: "storyboard-script",
      panel: "timeline",
      skill: null,
      label: "生成分镜图",
      detail: "按提示词提交图像任务",
    };
  }
  if (!project.shots.some((s) => s.videoUrl)) {
    return {
      stepId: "storyboard-video",
      panel: "timeline",
      skill: null,
      label: "生成分镜视频",
      detail: "用渠道视频模型做图生视频",
    };
  }
  return {
    stepId: "preview",
    panel: "preview",
    skill: null,
    label: "预览",
    detail: "连续播放已生成镜头",
  };
}

/** 将资产名自动挂到含该名字的分镜上 */
export function autoLinkAssetsToShots(
  shots: ManjuShotDraft[],
  assets: ManjuAssetDraft[],
): ManjuShotDraft[] {
  return shots.map((shot) => {
    const hay = `${shot.visual}\n${shot.dialogue}`;
    const refs = new Set(shot.assetRefs);
    for (const a of assets) {
      if (a.name && hay.includes(a.name)) refs.add(a.id);
    }
    return { ...shot, assetRefs: [...refs] };
  });
}
