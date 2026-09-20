/** 漫剧流水线步骤 —— 布局对照 namistory / ai-video；能力对照 ArcReel drama 链路 */

export type ManjuStepId =
  | "script"
  | "video-settings"
  | "assets"
  | "storyboard-script"
  | "storyboard-video"
  | "preview";

export type ManjuStep = {
  id: ManjuStepId;
  index: number;
  label: string;
  nextLabel: string;
  /** ArcReel 对齐说明，仅 UI 提示用 */
  hint: string;
};

export const MANJU_STEPS: ManjuStep[] = [
  {
    id: "script",
    index: 1,
    label: "剧本编辑",
    nextLabel: "视频设定",
    hint: "导入小说/剧本，整理分集与结构化台词",
  },
  {
    id: "video-settings",
    index: 2,
    label: "视频设定",
    nextLabel: "场景角色道具",
    hint: "画幅、风格、时长与生成模式",
  },
  {
    id: "assets",
    index: 3,
    label: "场景角色道具",
    nextLabel: "分镜脚本",
    hint: "角色 / 场景 / 道具资产与参考图",
  },
  {
    id: "storyboard-script",
    index: 4,
    label: "分镜脚本",
    nextLabel: "分镜视频",
    hint: "镜头卡：画面描述、对白、运镜",
  },
  {
    id: "storyboard-video",
    index: 5,
    label: "分镜视频",
    nextLabel: "视频预览",
    hint: "分镜图 → 镜头视频，支持单镜重生成",
  },
  {
    id: "preview",
    index: 6,
    label: "视频预览",
    nextLabel: "导出",
    hint: "顺序连播；ZIP / 成片 MP4；可单向推送到新画布",
  },
];

export function getStepById(id: ManjuStepId): ManjuStep {
  return MANJU_STEPS.find((s) => s.id === id)!;
}

export function getNextStep(id: ManjuStepId): ManjuStep | null {
  const i = MANJU_STEPS.findIndex((s) => s.id === id);
  return i >= 0 && i < MANJU_STEPS.length - 1 ? MANJU_STEPS[i + 1]! : null;
}

export function stepIdFromIndex(index: number): ManjuStepId | null {
  return MANJU_STEPS.find((s) => s.index === index)?.id ?? null;
}

export function clampStepIndex(raw: number | null | undefined): number {
  if (raw == null || Number.isNaN(raw)) return 1;
  return Math.min(MANJU_STEPS.length, Math.max(1, Math.floor(raw)));
}
