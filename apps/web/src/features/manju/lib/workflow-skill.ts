import { submitManjuAnalyzeJob } from "../manju-api";
import type { ManjuProjectDraft, ManjuSkill } from "../manju-types";

type Skill = Exclude<ManjuSkill, null>;

export function buildSkillPrompt(
  project: ManjuProjectDraft,
  skill: Skill,
  episodeId?: string | null,
): string {
  if (skill === "analyze_assets") return project.scriptText;

  const names = project.assets.map((a) => a.name).filter(Boolean).join("、");
  const episodes = project.episodes.map((e) => e.title).filter(Boolean).join("、");
  if (skill === "script_plan") {
    return [
      `可用资产：${names || "（暂无）"}`,
      `分集标题：${episodes || "（未分集）"}`,
      "说明：有分集时，每镜的 episodeTitle 必须与上面的分集标题完全一致。",
      "",
      "原文：",
      project.scriptText,
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
  return [
    `风格：${project.settings.style}`,
    `画幅：${project.settings.ratio}`,
    "说明：每条镜头的序号必须使用下列全局 #index，不要从 1 重新编号。",
    "",
    "已锁定镜头：",
    shotBrief,
  ].join("\n");
}

export async function submitWorkflowSkill(input: {
  project: ManjuProjectDraft;
  skill: Skill;
  episodeId?: string | null;
}) {
  return submitManjuAnalyzeJob({
    projectId: input.project.id,
    scriptText: buildSkillPrompt(
      input.project,
      input.skill,
      input.episodeId,
    ),
    purpose: input.skill,
    modelId: input.project.settings.llmModelId,
  });
}
