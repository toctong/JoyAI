import { submitManjuAnalyzeJob } from "../manju-api";
import type { ManjuProjectDraft, ManjuSkill } from "../manju-types";
import { assetRegistryName } from "./asset-registry";
import {
  buildManjuReviewFacts,
  formatManjuReviewFactsForPrompt,
} from "./manju-review-facts";

type Skill = Exclude<ManjuSkill, null>;

export function buildSkillPrompt(
  project: ManjuProjectDraft,
  skill: Skill,
  episodeId?: string | null,
  shotIndexes?: number[],
): string {
  if (skill === "analyze_assets") return project.scriptText;
  if (skill === "plan_episodes") {
    return buildEpisodePlanPrompt(project);
  }
  if (skill === "novel_analyze") {
    return buildNovelAnalyzePrompt(project);
  }
  if (skill === "manju_review") {
    return buildManjuReviewPrompt(project);
  }

  const names = project.assets
    .map((a) => assetRegistryName(a, project.assets))
    .filter(Boolean)
    .join("、");
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
  const scoped =
    shotIndexes && shotIndexes.length > 0
      ? shots.filter((s) => shotIndexes.includes(s.index))
      : shots;
  const shotBrief = scoped
    .map((s) => {
      const assetNames = project.assets
        .filter((a) => s.assetRefs.includes(a.id))
        .map((a) => assetRegistryName(a, project.assets))
        .filter(Boolean)
        .join("、");
      const cinema = [s.shotSize, s.cameraAngle, s.cameraMove]
        .filter(Boolean)
        .join("/");
      return `#${s.index} 画面:${s.visual} 对白:${s.dialogue || "无"} 资产:${assetNames || "无"}${cinema ? ` 镜头:${cinema}` : ""}`;
    })
    .join("\n");
  const registryHint = project.assets
    .map((a) => assetRegistryName(a, project.assets))
    .filter(Boolean)
    .slice(0, 40)
    .join("、");
  const scope = episodeId
    ? shotIndexes?.length === 1
      ? `仅当前分集的指定镜头 #${shotIndexes[0]}`
      : "当前分集"
    : shotIndexes?.length
      ? `指定镜头 ${shotIndexes.map((i) => `#${i}`).join("、")}`
      : "全部镜头";
  return [
    `风格：${project.settings.style}`,
    `画幅：${project.settings.ratio}`,
    `范围：${scope}。下面的 #数字是项目全局镜号，不是分集内从 1 起的序号。`,
    "说明：输出 JSON 的 index 必须与下列全局 #index 完全一致，不要从 1 重新编号，也不要按数组位置猜测。",
    "资产指认：提示词里用 @[登记名] 指认出场资产；衍生造型写 @[本体名/衍生名]。生成端会换成「图N」并挂参考图槽位。有参考图时不要在正文复述外貌服装细节。",
    `可用登记名：${registryHint || "（暂无）"}`,
    "imagePrompt=冻结关键帧；videoPrompt=起点→动作→终点与运镜；不要改对白与镜序。",
    "只为上面列出的镜头输出；不要发明其它 index。",
    "",
    "已锁定镜头：",
    shotBrief || "（无镜头）",
  ].join("\n");
}

export async function submitWorkflowSkill(input: {
  project: ManjuProjectDraft;
  skill: Skill;
  episodeId?: string | null;
  /** author_prompts：只为这些全局镜号写词；缺省则本集/全部 */
  shotIndexes?: number[];
}) {
  if (input.skill === "plan_episodes") {
    return submitEpisodePlan(input.project);
  }
  if (input.skill === "series_memory") {
    return submitSeriesMemory(input.project);
  }
  if (input.skill === "novel_analyze") {
    return submitNovelAnalyze(input.project);
  }
  if (input.skill === "manju_review") {
    return submitManjuReview(input.project);
  }
  return submitManjuAnalyzeJob({
    projectId: input.project.id,
    scriptText: buildSkillPrompt(
      input.project,
      input.skill,
      input.episodeId,
      input.shotIndexes,
    ),
    purpose: input.skill,
    modelId: input.project.settings.llmModelId,
    episodeId:
      input.skill === "script_plan" || input.skill === "author_prompts"
        ? input.episodeId
        : undefined,
  });
}

export function buildNovelAnalyzePrompt(project: ManjuProjectDraft): string {
  const existing = project.episodes
    .map((e) => e.title)
    .filter(Boolean)
    .join("、");
  const text = project.scriptText;
  const truncated =
    text.length > 24000
      ? `${text.slice(0, 12000)}\n\n……（中间省略）……\n\n${text.slice(-8000)}`
      : text;
  return [
    existing
      ? `已有分集标题（可沿用或调整）：${existing}`
      : "尚无分集。",
    project.overview.trim()
      ? `已有梗概（可改写）：${project.overview.trim()}`
      : "尚无梗概。",
    "请输出 overview、tags（2～5）与 episodes；startQuote/endQuote 必须是原文逐字片段。",
    "",
    "原文：",
    truncated,
  ].join("\n");
}

export async function submitNovelAnalyze(project: ManjuProjectDraft) {
  return submitManjuAnalyzeJob({
    projectId: project.id,
    scriptText: buildNovelAnalyzePrompt(project),
    purpose: "novel_analyze",
    modelId: project.settings.llmModelId,
  });
}

export function buildManjuReviewPrompt(project: ManjuProjectDraft): string {
  const facts = buildManjuReviewFacts(project);
  const assets = project.assets
    .map(
      (a) =>
        `${a.kind}:${a.name}${a.imageUrl ? "（已出图）" : "（未出图）"}`,
    )
    .join("、");
  const episodes = project.episodes
    .map(
      (e) =>
        `${e.title}${e.sourceText?.trim() ? "" : "·缺原文"}${e.hook?.trim() ? "" : "·缺钩子"}`,
    )
    .join("、");
  const shots = project.shots
    .slice(0, 60)
    .map((s) => {
      const dlg = s.dialogue?.trim().length ?? 0;
      return `#${s.index} 资产${s.assetRefs.length} 对白${dlg}字 图词${s.imagePrompt?.trim() ? "有" : "无"} 视频词${s.videoPrompt?.trim() ? "有" : "无"}`;
    })
    .join("\n");
  return [
    `项目：${project.title || "未命名"}`,
    `脚本确认：${project.scriptConfirmed ? "是" : "否"}`,
    `画幅 ${project.settings.ratio} · 风格 ${project.settings.style || "默认"}`,
    `梗概：${project.overview.trim() || "（空）"}`,
    `标签：${project.tags.join("、") || "（空）"}`,
    `资产：${assets || "（无）"}`,
    `分集：${episodes || "（无）"}`,
    `镜头数：${project.shots.length}`,
    "",
    formatManjuReviewFactsForPrompt(facts),
    "",
    "镜头摘要：",
    shots || "（无镜头）",
  ].join("\n");
}

export async function submitManjuReview(project: ManjuProjectDraft) {
  return submitManjuAnalyzeJob({
    projectId: project.id,
    scriptText: buildManjuReviewPrompt(project),
    purpose: "manju_review",
    modelId: project.settings.llmModelId,
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
