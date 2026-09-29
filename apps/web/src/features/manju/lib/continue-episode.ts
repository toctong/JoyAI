import { sanitizeScriptBody } from "./sanitize-script-text";
import type { ManjuEpisodeDraft, ManjuProjectDraft } from "../manju-types";

export type ContinueEpisodeSeed = {
  fromEpisodeId: string;
  fromTitle: string;
  fromIndex: number;
  nextIndex: number;
  hook: string;
  summary: string;
  /** 上一集原文末段，作承接 */
  sourceTail: string;
};

export function buildContinueEpisodeSeed(
  project: ManjuProjectDraft,
  fromEpisodeId: string,
): ContinueEpisodeSeed | null {
  const idx = project.episodes.findIndex((e) => e.id === fromEpisodeId);
  if (idx < 0) return null;
  const ep = project.episodes[idx]!;
  const source = (ep.sourceText || "").trim();
  const tail =
    source.length > 800 ? source.slice(-800) : source;
  return {
    fromEpisodeId: ep.id,
    fromTitle: ep.title.trim() || `第${idx + 1}集`,
    fromIndex: idx + 1,
    nextIndex: project.episodes.length + 1,
    hook: (ep.hook || "").trim(),
    summary: (ep.summary || "").trim(),
    sourceTail: tail,
  };
}

/** 拼进 script_write 用户消息的续写块 */
export function formatContinueSeedForPrompt(seed: ContinueEpisodeSeed): string {
  return [
    "【续写下一集】",
    `目标：创作「第${seed.nextIndex}集」完整可拍剧本（不是润色上一集全文）。`,
    `上一集标题：${seed.fromTitle}`,
    seed.hook
      ? `上一集钩子（本集开篇必须承接）：${seed.hook}`
      : "上一集钩子：（空——请自行设计承接点，并在结尾给出新 hook）",
    seed.summary ? `上一集摘要：${seed.summary}` : null,
    seed.sourceTail
      ? `上一集末段原文（仅作承接参考，不要整段复述）：\n${seed.sourceTail}`
      : null,
    "要求：开篇接住钩子；本集独立可拍；结尾 hook 留给再下一集；script 不要写「本集钩子」元标注。",
  ]
    .filter(Boolean)
    .join("\n");
}

export function defaultContinueUserPrompt(seed: ContinueEpisodeSeed): string {
  if (seed.hook) {
    return `请根据上一集钩子「${seed.hook}」写第${seed.nextIndex}集，约 3～5 场，保留爽点并在结尾留下新钩子。`;
  }
  return `请续写第${seed.nextIndex}集，承接上一集情绪与人物关系，约 3～5 场，结尾留下新钩子。`;
}

/** 续写落集标题：第N集：短名，避免把整段摘要塞进标题 */
export function shortContinueEpisodeTitle(
  nextIndex: number,
  summary?: string,
  hook?: string,
): string {
  const base = `第${nextIndex}集`;
  const raw = (summary || hook || "").trim();
  if (!raw) return base;
  const short = raw
    .replace(/[「」""《》]/g, "")
    .split(/[，,。！？；;：:\n]/)[0]
    ?.trim()
    .slice(0, 8);
  return short && short.length >= 2 ? `${base}：${short}` : base;
}

/**
 * 应用续写结果：新建一集写入 sourceText/hook/summary；
 * 不覆盖 project.scriptText；tags 有则合并进草稿标签。
 */
export function applyContinueEpisodeResult(input: {
  project: ManjuProjectDraft;
  seed: ContinueEpisodeSeed;
  rawScript: string;
  hook?: string;
  summary?: string;
  tags?: string[];
  title?: string;
}): {
  episodes: ManjuEpisodeDraft[];
  tags?: string[];
  newEpisode: ManjuEpisodeDraft;
} {
  const { script, hook: extracted } = sanitizeScriptBody(input.rawScript);
  const hook = (input.hook?.trim() || extracted || "").trim();
  const summary = (input.summary || "").trim();
  const title =
    input.title?.trim() ||
    shortContinueEpisodeTitle(input.seed.nextIndex, summary, hook);

  const newEpisode: ManjuEpisodeDraft = {
    id: crypto.randomUUID(),
    title,
    summary,
    hook,
    sourceText: script,
  };

  const episodes = [...input.project.episodes, newEpisode];
  const nextTags = Array.isArray(input.tags)
    ? input.tags
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];

  let tags: string[] | undefined;
  if (nextTags.length > 0) {
    const merged = new Set([...(input.project.tags ?? []), ...nextTags]);
    tags = [...merged].slice(0, 8);
  }

  return { episodes, tags, newEpisode };
}
