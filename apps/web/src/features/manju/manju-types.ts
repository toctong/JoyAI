import type { ManjuStepId } from "./config/manju-steps";
import {
  buildAssetImagePrompt,
  buildStoryboardImagePrompt,
  buildStoryboardVideoPrompt,
} from "./lib/prompt-builders";
import { assetRegistryName } from "./lib/asset-registry";
import { styleIdFromPrompt } from "./config/manju-style-templates";

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
  /** 宫格布局；mode=grid 时用 */
  gridLayout?: "2x2" | "3x3";
  style: string;
  /** 风格模板 id；选模板时同步写入 style */
  styleId?: string;
  duration: number;
  llmModelId?: string;
  imageModelId?: string;
  videoModelId?: string;
};

export type ManjuUtterance = {
  kind: "dialogue" | "voiceover";
  speaker?: string;
  text: string;
};

export type ManjuShotDraft = {
  id: string;
  index: number;
  /** 分镜标题（如「豪华全景」） */
  title: string;
  /** 画面 / 动作描述 */
  visual: string;
  dialogue: string;
  imagePrompt: string;
  videoPrompt: string;
  /** 景别：全景 / 中景 / 近景… */
  shotSize: string;
  /** 角度：平视 / 俯视… */
  cameraAngle: string;
  /** 运镜：固定 / 推 / 拉… */
  cameraMove: string;
  /** 结构化对白；空则回退 dialogue */
  utterances: ManjuUtterance[];
  /** 关联角色/场景/道具资产 id */
  assetRefs: string[];
  /** 所属分集；null 表示未归集 */
  episodeId: string | null;
  /** 本镜时长秒；null 则用项目默认 */
  duration: number | null;
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
  storyboardStale: boolean;
  videoStale: boolean;
  /** 宫格同批；null 表示非宫格镜头 */
  gridGroupId: string | null;
  /** 宫格格号 0-based */
  gridCellIndex: number | null;
  /** 手动尾帧（连续性，非服务端抽帧） */
  endFrameAssetId: string | null;
  endFrameImageUrl: string | null;
};

export type ManjuPhase =
  | "preparation"
  | "script"
  | "production"
  | "completed";

export type ManjuScriptReview = {
  status: "draft" | "confirmed";
  content: string;
};

export type ManjuAssetDetail = {
  age?: string;
  gender?: string;
  roleType?: string;
  story?: string;
  voiceNote?: string;
  /** 是否启用文本音色描述 */
  voiceUseText?: boolean;
  /** 是否启用音频参考音色 */
  voiceUseAudio?: boolean;
  voiceAudioUrl?: string;
  height?: string;
  weight?: string;
  bodyType?: string;
  hairstyle?: string;
  face?: string;
  gaze?: string;
  skin?: string;
  clothing?: string;
  headwear?: string;
  traits?: string;
  /** 场景：地点 */
  location?: string;
  /** 场景：时间（如 夜晚） */
  timeOfDay?: string;
  weather?: string;
  /** 室外 / 室内 … */
  sceneType?: string;
  architecture?: string;
  lighting?: string;
  atmosphere?: string;
  /** 场景关联道具标签 */
  sceneProps?: string[];
  /** 道具：质感 */
  propTexture?: string;
  propMaterial?: string;
  propSize?: string;
  propWear?: string;
  propSpecial?: string;
  /** 色泽与表面处理 */
  propFinish?: string;
};

export type ManjuAssetDraft = {
  id: string;
  kind: "character" | "scene" | "prop";
  name: string;
  description: string;
  aliases: string[];
  /** 衍生挂本体；本体为 null。提示词提及 @[本体名/衍生名] */
  parentId: string | null;
  imageUrl: string | null;
  assetId: string | null;
  jobId: string | null;
  status: ManjuJobStatus;
  /** 详情页扩展字段（角色信息 / 外观等） */
  detail?: ManjuAssetDetail;
};

export type ManjuEpisodeDraft = {
  id: string;
  title: string;
  summary: string;
  hook: string;
  sourceText: string;
};

export type ManjuSeries = {
  world: string;
  bios: Array<{ name: string; bio: string }>;
  hooks: Array<{ text: string; status: "open" | "paid" }>;
};

export const EMPTY_SERIES: ManjuSeries = {
  world: "",
  bios: [],
  hooks: [],
};

export type ManjuProjectDraft = {
  id: string;
  title: string;
  scriptText: string;
  overview: string;
  /** 素材标签 */
  tags: string[];
  scriptConfirmed: boolean;
  phase: ManjuPhase;
  scriptReview: ManjuScriptReview;
  settings: ManjuVideoSettings;
  /** @deprecated 兼容旧本地草稿 */
  settingsSummary?: string;
  assets: ManjuAssetDraft[];
  shots: ManjuShotDraft[];
  episodes: ManjuEpisodeDraft[];
  series: ManjuSeries;
  completedSteps: ManjuStepId[];
  /** 本地草稿版本快照（简化 time machine） */
  draftSnapshots?: Array<{
    id: string;
    label: string;
    createdAt: string;
    draft: unknown;
  }>;
  lastAnalyzeJobId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export const DEFAULT_SETTINGS: ManjuVideoSettings = {
  ratio: "9:16",
  mode: "i2v",
  gridLayout: "2x2",
  style: "真人写实摄影，自然皮肤质感，真实光影，电影级细节",
  styleId: "realistic",
  duration: 5,
};

/** @deprecated 历史字符串列表；风格目录已迁到 GET /styles */
export const STYLE_PRESETS = [
  "真人写实",
  "3D玄幻",
  "真人古装",
  "3D写实",
  "2D动画",
  "2D电影",
  "好莱坞大片",
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
  badge: string;
  detail: string;
  /** 悬停预览短片（静音循环） */
  previewVideo: string;
  /** false = 界面展示但不可选，避免假能力 */
  available: boolean;
}[] = [
  {
    id: "ref",
    title: "全能参考模式",
    desc: "多参考图直出视频，镜头连贯性更好",
    badge: "R2V",
    detail:
      "使用动态镜头组，配合多参考图直出视频，总体参数更少，空间连续更好。",
    previewVideo: "/manju/mode-tips/r2v.mp4",
    available: true,
  },
  {
    id: "i2v",
    title: "图生视频模式",
    desc: "先生分镜图，再生视频，精准掌控",
    badge: "I2V",
    detail:
      "先按提示词生成分镜静帧，再以图生视频推进运动。构图、景别可在出视频前细调。",
    previewVideo: "/manju/mode-tips/i2v.mp4",
    available: true,
  },
  {
    id: "grid",
    title: "多宫格生视频",
    desc: "连续帧宫格生分镜，画面更连贯",
    badge: "GRID",
    detail:
      "一次生成多宫格分镜图，按格切块后再逐格出视频，镜间节奏更顺。",
    previewVideo: "/manju/mode-tips/grid.mp4",
    available: true,
  },
];

/** 视频提交时：grid 按 i2v（单格静帧）处理 */
export function resolveManjuGenMode(mode: ManjuGenMode): "i2v" | "ref" {
  return mode === "ref" ? "ref" : "i2v";
}

export function gridLayoutDims(
  layout: "2x2" | "3x3" | undefined,
): { rows: number; cols: number; cells: number } {
  if (layout === "3x3") return { rows: 3, cols: 3, cells: 9 };
  return { rows: 2, cols: 2, cells: 4 };
}

export function createEmptyShot(index: number): ManjuShotDraft {
  return {
    id: crypto.randomUUID(),
    index,
    title: "",
    visual: "",
    dialogue: "",
    imagePrompt: "",
    videoPrompt: "",
    shotSize: "全景",
    cameraAngle: "平视",
    cameraMove: "固定",
    utterances: [],
    assetRefs: [],
    episodeId: null,
    duration: null,
    storyboardImageUrl: null,
    storyboardAssetId: null,
    storyboardJobId: null,
    storyboardStatus: "idle",
    videoUrl: null,
    videoAssetId: null,
    videoJobId: null,
    videoStatus: "idle",
    storyboardStale: false,
    videoStale: false,
    gridGroupId: null,
    gridCellIndex: null,
    endFrameAssetId: null,
    endFrameImageUrl: null,
  };
}

export function createEmptyAsset(
  kind: ManjuAssetDraft["kind"],
  name = "",
  parentId: string | null = null,
): ManjuAssetDraft {
  const rootLabel =
    kind === "character" ? "新角色" : kind === "scene" ? "新场景" : "新道具";
  return {
    id: crypto.randomUUID(),
    kind,
    name: name || (parentId ? "新衍生" : rootLabel),
    description: "",
    aliases: [],
    parentId,
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
    tags: [],
    scriptConfirmed: false,
    phase: "preparation",
    scriptReview: { status: "draft", content: "" },
    settings: { ...DEFAULT_SETTINGS },
    assets: [],
    shots: [],
    episodes: [],
    series: { ...EMPTY_SERIES, bios: [], hooks: [] },
    completedSteps: [],
    draftSnapshots: [],
    lastAnalyzeJobId: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** 将旧 persist 数据规范到当前结构 */
export function normalizeProject(raw: unknown): ManjuProjectDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;

  // Export shape: { title, draft } or nested draft with optional id
  let p: Record<string, unknown> = root;
  if (
    root.draft &&
    typeof root.draft === "object" &&
    typeof root.title === "string"
  ) {
    p = {
      ...(root.draft as Record<string, unknown>),
      id: typeof root.id === "string" ? root.id : "import",
      title: root.title,
    };
  }

  if (typeof p.title !== "string") return null;
  const title = p.title;
  const id = typeof p.id === "string" ? p.id : "import";

  const settingsRaw = p.settings as Partial<ManjuVideoSettings> | undefined;
  const summary =
    typeof p.settingsSummary === "string" ? p.settingsSummary : "";

  const settings: ManjuVideoSettings = {
    ratio: (settingsRaw?.ratio as ManjuAspectRatio) ?? DEFAULT_SETTINGS.ratio,
    mode: resolveManjuGenMode(
      (settingsRaw?.mode as ManjuGenMode) ?? DEFAULT_SETTINGS.mode,
    ),
    style:
      settingsRaw?.style ??
      (summary.trim() || DEFAULT_SETTINGS.style),
    styleId:
      settingsRaw?.styleId ??
      styleIdFromPrompt(
        settingsRaw?.style ?? (summary.trim() || DEFAULT_SETTINGS.style),
      ),
    gridLayout:
      settingsRaw?.gridLayout === "3x3" || settingsRaw?.gridLayout === "2x2"
        ? settingsRaw.gridLayout
        : DEFAULT_SETTINGS.gridLayout,
    duration: settingsRaw?.duration ?? DEFAULT_SETTINGS.duration,
    llmModelId: settingsRaw?.llmModelId ?? "",
    imageModelId: settingsRaw?.imageModelId ?? "",
    videoModelId: settingsRaw?.videoModelId ?? "",
  };

  const assets = Array.isArray(p.assets)
    ? (p.assets as ManjuAssetDraft[]).map((a) => ({
        ...createEmptyAsset(a.kind ?? "character", a.name, a.parentId ?? null),
        ...a,
        parentId: typeof a.parentId === "string" ? a.parentId : null,
        status: a.status ?? "idle",
        imageUrl: a.imageUrl ?? null,
        assetId: a.assetId ?? null,
        jobId: a.jobId ?? null,
        aliases: Array.isArray(a.aliases) ? a.aliases.filter(Boolean) : [],
        detail:
          a.detail && typeof a.detail === "object"
            ? (a.detail as ManjuAssetDetail)
            : undefined,
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
        episodeId: typeof s.episodeId === "string" ? s.episodeId : null,
        title: typeof s.title === "string" ? s.title : "",
        shotSize: typeof s.shotSize === "string" && s.shotSize ? s.shotSize : "全景",
        cameraAngle:
          typeof s.cameraAngle === "string" && s.cameraAngle
            ? s.cameraAngle
            : "平视",
        cameraMove:
          typeof s.cameraMove === "string" && s.cameraMove
            ? s.cameraMove
            : "固定",
        duration:
          typeof s.duration === "number" && s.duration > 0 ? s.duration : null,
        imagePrompt: typeof s.imagePrompt === "string" ? s.imagePrompt : "",
        videoPrompt: typeof s.videoPrompt === "string" ? s.videoPrompt : "",
        storyboardStale: s.storyboardStale === true,
        videoStale: s.videoStale === true,
        gridGroupId: typeof s.gridGroupId === "string" ? s.gridGroupId : null,
        gridCellIndex:
          typeof s.gridCellIndex === "number" && s.gridCellIndex >= 0
            ? s.gridCellIndex
            : null,
        utterances: Array.isArray(s.utterances)
          ? (s.utterances as ManjuUtterance[]).filter(
              (u) =>
                u &&
                (u.kind === "dialogue" || u.kind === "voiceover") &&
                typeof u.text === "string",
            )
          : [],
        endFrameAssetId:
          typeof s.endFrameAssetId === "string" ? s.endFrameAssetId : null,
        endFrameImageUrl:
          typeof s.endFrameImageUrl === "string" ? s.endFrameImageUrl : null,
      }))
    : [];

  const phaseRaw = p.phase;
  const phase: ManjuPhase =
    phaseRaw === "script" ||
    phaseRaw === "production" ||
    phaseRaw === "completed"
      ? phaseRaw
      : "preparation";
  const reviewRaw =
    p.scriptReview && typeof p.scriptReview === "object"
      ? (p.scriptReview as Record<string, unknown>)
      : null;

  return {
    id,
    title,
    scriptText: typeof p.scriptText === "string" ? p.scriptText : "",
    overview: typeof p.overview === "string" ? p.overview : "",
    tags: Array.isArray(p.tags)
      ? (p.tags as unknown[])
          .filter((t): t is string => typeof t === "string")
          .map((t) => t.trim())
          .filter(Boolean)
      : [],
    scriptConfirmed: p.scriptConfirmed === true,
    phase,
    scriptReview: {
      status: reviewRaw?.status === "confirmed" ? "confirmed" : "draft",
      content: typeof reviewRaw?.content === "string" ? reviewRaw.content : "",
    },
    settings,
    assets,
    shots,
    episodes: Array.isArray(p.episodes)
      ? (p.episodes as ManjuEpisodeDraft[]).map((e) => ({
          id: e.id,
          title: e.title,
          summary: e.summary ?? "",
          hook: e.hook ?? "",
          sourceText: e.sourceText ?? "",
        }))
      : [],
    series: readSeries(p.series),
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

function readSeries(raw: unknown): ManjuSeries {
  if (!raw || typeof raw !== "object") {
    return { world: "", bios: [], hooks: [] };
  }
  const s = raw as Record<string, unknown>;
  const bios = Array.isArray(s.bios)
    ? s.bios
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const b = item as Record<string, unknown>;
          const name = typeof b.name === "string" ? b.name.trim() : "";
          if (!name) return null;
          return {
            name,
            bio: typeof b.bio === "string" ? b.bio : "",
          };
        })
        .filter((b): b is ManjuSeries["bios"][number] => Boolean(b))
    : [];
  const hooks = Array.isArray(s.hooks)
    ? s.hooks
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const h = item as Record<string, unknown>;
          const text = typeof h.text === "string" ? h.text.trim() : "";
          if (!text) return null;
          return {
            text,
            status: h.status === "paid" ? ("paid" as const) : ("open" as const),
          };
        })
        .filter((h): h is ManjuSeries["hooks"][number] => Boolean(h))
    : [];
  return {
    world: typeof s.world === "string" ? s.world : "",
    bios,
    hooks,
  };
}

export function shotDurationSeconds(
  shot: ManjuShotDraft,
  project: ManjuProjectDraft,
): number {
  return shot.duration && shot.duration > 0
    ? shot.duration
    : project.settings.duration || 5;
}

export function buildAssetPrompt(
  asset: ManjuAssetDraft,
  settings: ManjuVideoSettings,
  allAssets: ManjuAssetDraft[] = [],
): string {
  return buildAssetImagePrompt(asset, settings, allAssets);
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
  options?: {
    continuityHint?: string | null;
    mode?: ManjuGenMode;
  },
): string {
  return buildStoryboardVideoPrompt(shot, project, options);
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
      if (project.assets.length === 0) {
        return { ok: false, reason: "请至少添加一个角色/场景/道具" };
      }
      if (!project.assets.some((a) => a.imageUrl)) {
        return {
          ok: false,
          reason: "请先为至少一个资产生成或上传参考图，再进分镜",
        };
      }
      return { ok: true };
    case "storyboard-script":
      if (!project.shots.some((s) => s.visual.trim())) {
        return { ok: false, reason: "请至少写好一个分镜画面描述" };
      }
      if (!project.scriptConfirmed) {
        return {
          ok: false,
          reason: "请先「确认脚本」，再进分镜视频",
        };
      }
      return { ok: true };
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
  | "plan_episodes"
  | "series_memory"
  | null;

function settingsLookUntouched(project: ManjuProjectDraft): boolean {
  if (project.completedSteps.includes("video-settings")) return false;
  const s = project.settings;
  const defaultStyle =
    DEFAULT_SETTINGS.style === s.style ||
    s.style === "真人写实" ||
    s.style === "电影感写实" ||
    s.styleId === "realistic" ||
    s.styleId === "cinematic" ||
    Boolean(s.styleId && s.styleId === DEFAULT_SETTINGS.styleId);
  const noModels = !s.llmModelId && !s.imageModelId && !s.videoModelId;
  return defaultStyle && noModels && s.mode === "i2v" && s.duration === 5;
}

/**
 * 主路径引导（侧栏「建议下一步」）：
 * 初始设定 → 剧本(+AI帮写) → 解析剧本 → 资产生图 → 剧集「制作视频」→ 分镜/视频
 * 题材标签、剧本梗概由 AI 帮写/解析写入，不手填。
 */
export function getWorkflowNextAction(project: ManjuProjectDraft): {
  stepId: ManjuStepId;
  panel: ManjuPanel;
  skill: ManjuSkill;
  label: string;
  detail: string;
} {
  if (settingsLookUntouched(project)) {
    return {
      stepId: "video-settings",
      panel: "overview",
      skill: null,
      label: "初始设定",
      detail: "先确认画幅、风格、时长与生成模型",
    };
  }
  if (project.scriptText.trim().length < 10) {
    return {
      stepId: "script",
      panel: "overview",
      skill: null,
      label: "填写剧本",
      detail: "粘贴原文，或用 AI 帮写生成剧本内容",
    };
  }
  if (project.assets.length === 0) {
    return {
      stepId: "script",
      panel: "overview",
      skill: "analyze_assets",
      label: "解析剧本",
      detail: "解析出角色、道具、场景与第一集，并生成题材标签与梗概",
    };
  }
  if (!project.assets.some((a) => a.imageUrl)) {
    return {
      stepId: "assets",
      panel: "characters",
      skill: null,
      label: "生成资产图",
      detail: "进入角色/场景/道具，支持单个或批量生成设定图",
    };
  }
  if (project.assets.some((a) => !a.imageUrl)) {
    return {
      stepId: "assets",
      panel: "characters",
      skill: null,
      label: "补全资产图",
      detail: "还有资产未出图，可单个或批量生成",
    };
  }
  if (project.episodes.length === 0) {
    return {
      stepId: "script",
      panel: "overview",
      skill: "analyze_assets",
      label: "解析剧本",
      detail: "再解析一次以登记剧集（第1集），然后即可制作视频",
    };
  }
  if (project.shots.length === 0) {
    return {
      stepId: "storyboard-script",
      panel: "timeline",
      skill: null,
      label: "制作视频",
      detail: "在剧集页点「制作视频」进入分镜与视频制作",
    };
  }
  if (!project.scriptConfirmed) {
    return {
      stepId: "storyboard-script",
      panel: "timeline",
      skill: null,
      label: "确认分镜脚本",
      detail: "检查镜头无误后确认脚本，再生成画面",
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
      detail: "为镜头补齐分镜图与视频提示词",
    };
  }
  if (!project.shots.some((s) => s.storyboardImageUrl)) {
    return {
      stepId: "storyboard-script",
      panel: "timeline",
      skill: null,
      label: "生成分镜图",
      detail: "在分镜页生成静帧画面",
    };
  }
  if (!project.shots.some((s) => s.videoUrl)) {
    return {
      stepId: "storyboard-video",
      panel: "timeline",
      skill: null,
      label: "生成分镜视频",
      detail: "把分镜图做成短视频",
    };
  }
  return {
    stepId: "preview",
    panel: "preview",
    skill: null,
    label: "预览成片",
    detail: "连播检查成片效果",
  };
}

/** 将资产名自动挂到含该名字的分镜上 */
export function autoLinkAssetsToShots(
  shots: ManjuShotDraft[],
  assets: ManjuAssetDraft[],
): ManjuShotDraft[] {
  return shots.map((shot) => {
    const hay = `${shot.visual}\n${shot.dialogue}\n${shot.imagePrompt}\n${shot.videoPrompt}`;
    const refs = new Set(shot.assetRefs);
    for (const a of assets) {
      const reg = assetRegistryName(a, assets);
      if (reg && hay.includes(reg)) refs.add(a.id);
      else if (a.name && hay.includes(a.name)) refs.add(a.id);
      for (const al of a.aliases ?? []) {
        if (al && hay.includes(al)) refs.add(a.id);
      }
    }
    return { ...shot, assetRefs: [...refs] };
  });
}
