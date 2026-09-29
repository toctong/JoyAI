import type { ManjuProjectDraft, ManjuShotDraft } from "../manju-types";

export type ManjuReviewFact = {
  severity: "error" | "warn" | "info";
  code: string;
  message: string;
  target: string;
};

const DIALOGUE_LONG_CHARS = 80;

/** 机器预检事实，供 manju_review 用户提示与本地预览 */
export function buildManjuReviewFacts(
  project: ManjuProjectDraft,
): ManjuReviewFact[] {
  const facts: ManjuReviewFact[] = [];

  if (!project.scriptText.trim()) {
    facts.push({
      severity: "error",
      code: "no_script",
      message: "尚未录入剧本正文",
      target: "剧本",
    });
  }

  if (!project.scriptConfirmed) {
    facts.push({
      severity: "warn",
      code: "script_unconfirmed",
      message: "脚本尚未确认，批量写提示词/出视频可能被门禁拦住",
      target: "脚本审核",
    });
  }

  if (project.assets.length === 0) {
    facts.push({
      severity: "warn",
      code: "no_assets",
      message: "尚未登记角色/场景/道具",
      target: "资产",
    });
  }

  for (const asset of project.assets) {
    if (!asset.imageUrl) {
      facts.push({
        severity: "warn",
        code: "asset_no_image",
        message: `${asset.kind === "character" ? "角色" : asset.kind === "scene" ? "场景" : "道具"}「${asset.name}」尚未出图`,
        target: `资产:${asset.name}`,
      });
    }
  }

  if (project.episodes.length === 0) {
    facts.push({
      severity: "info",
      code: "no_episodes",
      message: "尚无分集，制作视频前建议先解析或长文拆集",
      target: "分集",
    });
  }

  for (const ep of project.episodes) {
    if (!ep.sourceText?.trim()) {
      facts.push({
        severity: "warn",
        code: "episode_no_source",
        message: `分集「${ep.title}」缺少原文片段`,
        target: ep.title || "分集",
      });
    }
    if (!ep.hook?.trim()) {
      facts.push({
        severity: "info",
        code: "episode_no_hook",
        message: `分集「${ep.title}」缺少钩子`,
        target: ep.title || "分集",
      });
    }
  }

  if (project.shots.length === 0) {
    facts.push({
      severity: "info",
      code: "no_shots",
      message: "尚无分镜镜头",
      target: "分镜",
    });
  }

  for (const shot of project.shots) {
    shotFacts(shot, facts);
  }

  return facts.slice(0, 40);
}

function shotFacts(shot: ManjuShotDraft, facts: ManjuReviewFact[]) {
  const label = `#${shot.index}`;
  if (!shot.assetRefs.length) {
    facts.push({
      severity: "warn",
      code: "shot_no_asset",
      message: `镜头 ${label} 未绑定资产`,
      target: label,
    });
  }
  const dialogue = shot.dialogue?.trim() || "";
  if (dialogue.length >= DIALOGUE_LONG_CHARS) {
    facts.push({
      severity: "warn",
      code: "dialogue_long",
      message: `镜头 ${label} 对白约 ${dialogue.length} 字，可能超单镜口播时长`,
      target: label,
    });
  }
  if (!shot.visual.trim()) {
    facts.push({
      severity: "warn",
      code: "shot_no_visual",
      message: `镜头 ${label} 缺少画面描述`,
      target: label,
    });
  }
  if (!shot.imagePrompt?.trim() || !shot.videoPrompt?.trim()) {
    facts.push({
      severity: "info",
      code: "shot_prompt_gap",
      message: `镜头 ${label} 提示词未齐（画面/视频）`,
      target: label,
    });
  }
}

export function formatManjuReviewFactsForPrompt(
  facts: ManjuReviewFact[],
): string {
  if (facts.length === 0) return "（机器预检：暂无条目）";
  return [
    "机器预检（请优先纳入 findings，可改写表述）：",
    ...facts.map(
      (f) =>
        `- [${f.severity}] ${f.code} ${f.target ? `(${f.target}) ` : ""}${f.message}`,
    ),
  ].join("\n");
}
