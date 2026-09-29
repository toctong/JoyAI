/** 漫剧 Job / purpose 中文名（toast、确认框共用） */

export const MANJU_PURPOSE_LABEL: Record<string, string> = {
  analyze_assets: "解析剧本",
  script_plan: "分镜规划",
  split_shots: "分镜规划",
  author_prompts: "编写提示词",
  plan_episodes: "分集规划",
  series_memory: "连载记忆",
  script_write: "AI 帮写",
  novel_analyze: "长文拆集",
  manju_review: "制作检查",
};

export const MANJU_KIND_LABEL: Record<string, string> = {
  image: "生图",
  video: "生视频",
  llm: "AI 任务",
  audio: "音频",
};

export function manjuPurposeLabel(purpose?: string | null): string {
  if (!purpose?.trim()) return "AI 任务";
  return MANJU_PURPOSE_LABEL[purpose] ?? purpose;
}

export function manjuJobKindLabel(kind?: string | null): string {
  if (!kind?.trim()) return "生成";
  return MANJU_KIND_LABEL[kind] ?? kind;
}

/** 统一「确认提交生成」文案 */
export function manjuConfirmGenerateCopy(input: {
  kind: "image" | "video";
  scope: "asset" | "shot";
  name?: string;
  ratio?: string;
  refCount?: number;
}): { title: string; description: string; confirmText: string } {
  const kindLabel = input.kind === "video" ? "生视频" : "生图";
  const target =
    input.scope === "asset"
      ? `资产「${input.name?.trim() || "未命名"}」`
      : `分镜「${input.name?.trim() || "当前镜"}」`;
  const bits = [
    `将为${target}提交${kindLabel}任务`,
    input.ratio ? `画幅 ${input.ratio}` : null,
    input.refCount && input.refCount > 0
      ? `参考图 ${input.refCount} 张`
      : null,
    "确认后开始计费（额度以渠道为准），可在任务进度中查看结果",
  ].filter(Boolean);
  return {
    title: `确认提交${kindLabel}？`,
    description: bits.join("。") + "。",
    confirmText: `确认${kindLabel}`,
  };
}
