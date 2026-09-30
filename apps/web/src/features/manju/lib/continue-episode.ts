import { sanitizeScriptBody } from "./sanitize-script-text";
import type { ManjuAssetDraft, ManjuEpisodeDraft, ManjuProjectDraft } from "../manju-types";

export type ContinueEpisodeSeed = {
  fromEpisodeId: string;
  fromTitle: string;
  fromIndex: number;
  nextIndex: number;
  hook: string;
  summary: string;
  /** 上一集原文末段，作承接 */
  sourceTail: string;
  /** 本集为全剧收束，勿留新钩子 */
  finale?: boolean;
};

const SCENE_OR_SHOT_HEAD =
  /^(场景|全景|中景|近景|特写|大特写|远景|镜头|VO|OS|SFX|画面文字)[：:]/i;

/** 从正文末段推导钩子（无 ep.hook 时），避免续写幻觉外挂钩子 */
export function deriveHookFromSource(source: string): string {
  const text = source.trim();
  if (!text) return "";

  const frameMarks = [
    ...text.matchAll(/\[画面文字[：:]([^\]]+)\]/g),
  ].map((m) => m[1]!.trim());
  if (frameMarks.length > 0) {
    return frameMarks[frameMarks.length - 1]!.slice(0, 80);
  }

  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    if (SCENE_OR_SHOT_HEAD.test(line)) continue;
    if (line.length < 4) continue;
    const stripped = line.replace(/^[^\s：:]{1,12}[：:]/, "").trim();
    const pick = (stripped.length >= 4 ? stripped : line).slice(0, 80);
    if (pick) return pick;
  }
  return text.slice(-80);
}

export function buildContinueEpisodeSeed(
  project: ManjuProjectDraft,
  fromEpisodeId: string,
  opts?: { finale?: boolean },
): ContinueEpisodeSeed | null {
  const idx = project.episodes.findIndex((e) => e.id === fromEpisodeId);
  if (idx < 0) return null;
  const ep = project.episodes[idx]!;
  const source = (ep.sourceText || "").trim();
  const tail = source.length > 800 ? source.slice(-800) : source;
  const hook = (ep.hook || "").trim() || deriveHookFromSource(source);
  return {
    fromEpisodeId: ep.id,
    fromTitle: ep.title.trim() || `第${idx + 1}集`,
    fromIndex: idx + 1,
    nextIndex: project.episodes.length + 1,
    hook,
    summary: (ep.summary || "").trim(),
    sourceTail: tail,
    finale: Boolean(opts?.finale),
  };
}

/** 拼进 script_write 用户消息的续写块 */
export function formatContinueSeedForPrompt(seed: ContinueEpisodeSeed): string {
  const finaleBlock = seed.finale
    ? [
        "【完结本剧】",
        "要求：本集为全剧收束结局，兑现主题与人物弧光；hook 字段必须为空字符串；不要留下新悬念或下集预告。",
      ]
    : [
        "要求：开篇接住钩子；本集独立可拍；结尾 hook 留给再下一集；script 不要写「本集钩子」元标注。",
      ];

  return [
    "【续写下一集】",
    `目标：创作「第${seed.nextIndex}集」完整可拍剧本（不是润色上一集全文）。`,
    `上一集标题：${seed.fromTitle}`,
    seed.hook
      ? `上一集钩子（本集开篇必须承接）：${seed.hook}`
      : "上一集钩子：（空——请用上一集末段关系/风险自然接住，并在结尾给出新 hook；若【完结本剧】则 hook 为空）",
    seed.summary ? `上一集摘要：${seed.summary}` : null,
    seed.sourceTail
      ? `上一集末段原文（仅作承接参考，不要整段复述；钩子须与此一致，禁止另编无关钩子）：\n${seed.sourceTail}`
      : null,
    ...finaleBlock,
  ]
    .filter(Boolean)
    .join("\n");
}

export function defaultContinueUserPrompt(seed: ContinueEpisodeSeed): string {
  if (seed.finale) {
    return `写第${seed.nextIndex}集大结局：承接上一集，兑现主题并收束人物弧光。约 3～5 场，完结勿留新钩子。`;
  }
  if (seed.hook) {
    return `请根据上一集钩子「${seed.hook}」写第${seed.nextIndex}集，约 3～5 场，保留爽点并在结尾留下新钩子。`;
  }
  return `请续写第${seed.nextIndex}集，承接上一集情绪与人物关系，约 3～5 场，结尾留下新钩子。`;
}

/**
 * 续写落集标题：只用短名，勿加「第N集：」前缀（列表/制作台已显示序号）。
 */
export function shortContinueEpisodeTitle(
  summary?: string,
  hook?: string,
): string {
  const raw = (summary || hook || "").trim();
  if (!raw) return "未命名";
  const short = raw
    .replace(/^第\d+集[：:\s]*/u, "")
    .replace(/[「」""《》]/g, "")
    .split(/[，,。！？；;：:\n]/)[0]
    ?.trim()
    .slice(0, 16);
  return short && short.length >= 2 ? short : "未命名";
}

const DIALOGUE_NAME_SKIP = new Set([
  "场景",
  "全景",
  "中景",
  "近景",
  "特写",
  "大特写",
  "远景",
  "镜头",
  "旁白",
  "画外",
  "字幕",
  "画面",
  "VO",
  "OS",
  "SFX",
]);

/** 从剧本文本粗提取对白角色名（用于续写后提示入库） */
export function extractCharacterNamesFromScript(script: string): string[] {
  const names = new Set<string>();
  const re = /^[\t ]*([^\s：:\n\[\]【】]{1,8})[：:]/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(script)) !== null) {
    const name = m[1]!.trim();
    if (!name || DIALOGUE_NAME_SKIP.has(name)) continue;
    if (/^\d+$/.test(name)) continue;
    if (SCENE_OR_SHOT_HEAD.test(`${name}：`)) continue;
    names.add(name);
  }
  return [...names];
}

export function newCharacterNamesNotInAssets(
  script: string,
  assets: ManjuAssetDraft[],
): string[] {
  const existing = new Set(
    assets
      .filter((a) => a.kind === "character")
      .flatMap((a) => [a.name.trim(), ...(a.aliases ?? [])].filter(Boolean)),
  );
  return extractCharacterNamesFromScript(script).filter((n) => !existing.has(n));
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
  let hook = (input.hook?.trim() || extracted || "").trim();
  if (input.seed.finale) hook = "";
  const summary = (input.summary || "").trim();
  const title =
    input.title?.trim() || shortContinueEpisodeTitle(summary, hook);

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
