import { submitManjuAnalyzeJob } from "../manju-api";
import type { ManjuProjectDraft, ManjuSkill } from "../manju-types";

type Skill = Exclude<ManjuSkill, null>;

export function buildSkillPrompt(
  project: ManjuProjectDraft,
  skill: Skill,
  episodeId?: string | null,
): string {
  if (skill === "analyze_assets") return project.scriptText;
  if (skill === "plan_episodes") {
    return buildEpisodePlanPrompt(project);
  }

  const names = project.assets.map((a) => a.name).filter(Boolean).join("、");
  const episodes = project.episodes.map((e) => e.title).filter(Boolean).join("、");
  const episode = episodeId
    ? project.episodes.find((e) => e.id === episodeId)
    : null;

  if (skill === "script_plan") {
    const source =
      episode?.sourceText?.trim() ||
      (episode ? "" : project.scriptText) ||
      project.scriptText;
    const epShots = episode
      ? project.shots.filter((s) => s.episodeId === episode.id)
      : project.shots;
    const existingIndexes = epShots.map((s) => `#${s.index}`).join("、");
    return [
      `可用资产：${names || "（暂无）"}`,
      `分集标题：${episodes || "（未分集）"}`,
      episode
        ? `当前只规划分集「${episode.title}」。每镜 episodeTitle 必须填「${episode.title}」。`
        : "说明：有分集时，每镜的 episodeTitle 必须与上面的分集标题完全一致。",
      existingIndexes
        ? `本范围内已有全局镜号：${existingIndexes}。能对应则沿用；分集内重规划也可按顺序输出，服务端会按顺序合并。`
        : episode
          ? "本集尚无镜头，按叙事顺序输出即可。"
          : "尚无镜头，可按叙事顺序输出，index 从 1 递增。",
      "",
      episode ? `本集原文：` : "原文：",
      source || project.scriptText,
    ].join("\n");
  }

  const shots = episodeId
    ? project.shots.filter((s) => s.episodeId === episodeId)
    : project.shots;
  const shotBrief = shots
    .map((s) => {
      const assetNames = project.assets
        .filter((a) => s.assetRefs.includes(a.id))
        .map((a) => a.name)
        .join("、");
      return `#${s.index} 画面:${s.visual} 对白:${s.dialogue || "无"} 资产:${assetNames || "无"}`;
    })
    .join("\n");
  const scope = episodeId ? "当前分集" : "全部镜头";
  return [
    `风格：${project.settings.style}`,
    `画幅：${project.settings.ratio}`,
    `范围：${scope}。下面的 #数字是项目全局镜号，不是分集内从 1 起的序号。`,
    "说明：输出 JSON 的 index 必须与下列全局 #index 完全一致，不要从 1 重新编号，也不要按数组位置猜测。",
    "",
    "已锁定镜头：",
    shotBrief || "（无镜头）",
  ].join("\n");
}

export async function submitWorkflowSkill(input: {
  project: ManjuProjectDraft;
  skill: Skill;
  episodeId?: string | null;
}) {
  if (input.skill === "plan_episodes") {
    return submitEpisodePlan(input.project);
  }
  return submitManjuAnalyzeJob({
    projectId: input.project.id,
    scriptText: buildSkillPrompt(
      input.project,
      input.skill,
      input.episodeId,
    ),
    purpose: input.skill,
    modelId: input.project.settings.llmModelId,
    episodeId:
      input.skill === "script_plan" || input.skill === "author_prompts"
        ? input.episodeId
        : undefined,
  });
}

export function buildSeriesMemoryPrompt(project: ManjuProjectDraft): string {
  const series = project.series ?? { world: "", bios: [], hooks: [] };
  const names = project.assets
    .filter((a) => a.kind === "character")
    .map((a) => a.name)
    .filter(Boolean)
    .join("、");
  const bios = series.bios
    .map((b) => `${b.name}：${b.bio || "（空）"}`)
    .join("\n");
  const paid = series.hooks
    .filter((h) => h.status === "paid")
    .map((h) => h.text)
    .join("；");
  const open = series.hooks
    .filter((h) => h.status !== "paid")
    .map((h) => h.text)
    .join("；");
  return [
    `已登记角色：${names || "（暂无）"}`,
    series.world.trim()
      ? `已有世界观：${series.world.trim()}`
      : "已有世界观：（空）",
    bios ? `已有小传：\n${bios}` : "已有小传：（空）",
    `已回收伏笔（不要再输出）：${paid || "（无）"}`,
    `未回收伏笔：${open || "（无）"}`,
    "",
    "原文：",
    project.scriptText,
  ].join("\n");
}

export async function submitSeriesMemory(project: ManjuProjectDraft) {
  return submitManjuAnalyzeJob({
    projectId: project.id,
    scriptText: buildSeriesMemoryPrompt(project),
    purpose: "series_memory",
    modelId: project.settings.llmModelId,
  });
}

export function buildEpisodePlanPrompt(project: ManjuProjectDraft): string {
  const existing = project.episodes
    .map((e) => e.title)
    .filter(Boolean)
    .join("、");
  return [
    existing
      ? `已有分集标题（优先沿用）：${existing}`
      : "尚无分集。",
    "请按叙事顺序切分。startQuote / endQuote 必须是下面原文的逐字片段。",
    "",
    "原文：",
    project.scriptText,
  ].join("\n");
}

export async function submitEpisodePlan(project: ManjuProjectDraft) {
  return submitManjuAnalyzeJob({
    projectId: project.id,
    scriptText: buildEpisodePlanPrompt(project),
    purpose: "plan_episodes",
    modelId: project.settings.llmModelId,
  });
}
