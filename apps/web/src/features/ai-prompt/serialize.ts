import type { JSONContent } from "@tiptap/core";

export type PromptGeneratePayload = {
  prompt: string;
  imageUrls: string[];
  videoUrls: string[];
  audioUrls: string[];
  assetIds: string[];
};

export type MentionResolveItem = {
  id: string;
  label: string;
  url: string;
  mediaKind: "image" | "video" | "audio" | "text";
  expandText?: string;
};

/**
 * Wire / display: `@图片1` `@视频1` `@音频1`（兼容 `@图1` / 旧 `{{Image 1}}`）。
 * 与后文数字相邻时会插入空格，避免 `@图片3`+`3个人` 被吃成 `@图片33`。
 * Kling Omni 上游用的 `<<<video_1>>>` 仅在 provider 层转换，编辑器侧一律归一成 `@…`。
 */
const AT_PREFIX_RE = /@(图片|视频|音频|图)/y;
const BRACE_RE = /\{\{(Image|Video|Audio)\s+(\d+)\}\}/y;
const OMNI_WIRE_RE = /<<<(image|video|element)_(\d+)>>>/gi;

/** Normalize Kling Omni wire tokens → FrameRally @ mentions (for editor / history). */
export function normalizeOmniWireMentions(text: string): string {
  return String(text ?? "").replace(
    OMNI_WIRE_RE,
    (_m, kind: string, n: string) => {
      const k = kind.toLowerCase();
      if (k === "video") return `@视频${n}`;
      return `@图片${n}`;
    },
  );
}

export function mentionExpandText(
  mediaKind: "image" | "video" | "audio" | "text",
  index1: number,
): string {
  if (mediaKind === "video") return `@视频${index1}`;
  if (mediaKind === "audio") return `@音频${index1}`;
  if (mediaKind === "text") return `@文本${index1}`;
  return `@图片${index1}`;
}

export function mentionLabel(
  mediaKind: "image" | "video" | "audio" | "text",
  index1: number,
): string {
  return mentionExpandText(mediaKind, index1);
}

/** Detect whether wire text still contains raw mention tokens. */
export function hasMentionWireToken(text: string): boolean {
  return /@(?:图片|视频|音频|图)\d|\{\{(?:Image|Video|Audio)\s+\d+\}\}|<<<(?:image|video|element)_\d+>>>|@\[[^\]]+\]/i.test(
    String(text ?? ""),
  );
}

/**
 * Pick how many leading digits belong to the mention index.
 * With a known pool size, take the longest index that is still in range
 * (fixes `@图片33个人` → `@图片3` + `3个人` when only 3 refs exist).
 */
export function disambiguateMentionIndex(
  digitRun: string,
  maxIndex: number,
): { index: number; len: number } {
  const digits = digitRun.replace(/\D/g, "");
  if (!digits) return { index: 0, len: 0 };

  if (maxIndex > 0) {
    for (let len = Math.min(digits.length, String(maxIndex).length); len >= 1; len--) {
      const n = Number(digits.slice(0, len));
      if (n >= 1 && n <= maxIndex) return { index: n, len };
    }
    // Fallback: first digit if plausible
    const n = Number(digits[0]);
    return { index: n >= 1 ? n : 0, len: n >= 1 ? 1 : 0 };
  }

  // Unknown pool: take full run up to 2 digits (supports @图片10+)
  const len = Math.min(digits.length, 2);
  return { index: Number(digits.slice(0, len)), len };
}

function kindFromAt(atKind: string): "image" | "video" | "audio" {
  if (atKind === "视频") return "video";
  if (atKind === "音频") return "audio";
  return "image";
}

function kindFromBrace(braceKind: string): "image" | "video" | "audio" {
  const k = braceKind.toLowerCase();
  if (k === "video") return "video";
  if (k === "audio") return "audio";
  return "image";
}

function poolMax(
  items: MentionResolveItem[] | undefined,
  kind: "image" | "video" | "audio",
): number {
  if (!items?.length) return 0;
  return items.filter((i) => i.mediaKind === kind).length;
}

function resolveMention(
  items: MentionResolveItem[],
  kind: "image" | "video" | "audio",
  index1: number,
): MentionResolveItem | null {
  const pool = items.filter((i) => i.mediaKind === kind);
  return pool[index1 - 1] ?? null;
}

type ParsedMention = {
  start: number;
  end: number;
  kind: "image" | "video" | "audio";
  index1: number;
  token: string;
  /** 漫剧 @[登记名] */
  assetName?: string;
};

function scanBracketMentions(line: string): ParsedMention[] {
  const out: ParsedMention[] = [];
  const re = /@\[([^\]]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const name = String(m[1] ?? "").trim();
    if (!name) continue;
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      kind: "image",
      index1: 0,
      token: m[0],
      assetName: name,
    });
  }
  return out;
}

function resolveMentionByName(
  items: MentionResolveItem[],
  name: string,
): MentionResolveItem | null {
  const n = name.trim();
  if (!n) return null;
  return (
    items.find((item) => {
      const expand = String(item.expandText || "").trim();
      if (expand === `@[${n}]`) return true;
      const label = String(item.label || "")
        .trim()
        .replace(/^@/, "");
      return label === n || label.endsWith(`·${n}`);
    }) ?? null
  );
}

function scanMentions(
  line: string,
  maxByKind: { image: number; video: number; audio: number },
): ParsedMention[] {
  const out: ParsedMention[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === "{") {
      BRACE_RE.lastIndex = i;
      const bm = BRACE_RE.exec(line);
      if (bm && bm.index === i) {
        const kind = kindFromBrace(bm[1] || "");
        const index1 = Number(bm[2] || "0");
        out.push({
          start: i,
          end: i + bm[0].length,
          kind,
          index1,
          token: bm[0],
        });
        i += bm[0].length;
        continue;
      }
    }
    if (line[i] === "@") {
      AT_PREFIX_RE.lastIndex = i;
      const am = AT_PREFIX_RE.exec(line);
      if (am && am.index === i) {
        const atKind = am[1] || "图";
        const kind = kindFromAt(atKind);
        const after = i + am[0].length;
        let digitEnd = after;
        while (digitEnd < line.length && /\d/.test(line[digitEnd]!)) digitEnd += 1;
        if (digitEnd > after) {
          const digitRun = line.slice(after, digitEnd);
          const { index, len } = disambiguateMentionIndex(
            digitRun,
            maxByKind[kind],
          );
          if (index > 0 && len > 0) {
            const end = after + len;
            out.push({
              start: i,
              end,
              kind,
              index1: index,
              token: line.slice(i, end),
            });
            i = end;
            continue;
          }
        }
      }
    }
    i += 1;
  }
  return out;
}

function walkInlineNodes(nodes: JSONContent[]): string {
  let out = "";
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    const piece = walkPlainNode(node);
    out += piece;
    const next = nodes[i + 1];
    // Prevent `@图片3` + `3个人` → `@图片33`
    if (
      node.type === "mentionTag" &&
      next?.type === "text" &&
      /\d$/.test(piece) &&
      /^\d/.test(String(next.text || ""))
    ) {
      out += " ";
    }
  }
  return out;
}

function walkPlainNode(node: JSONContent): string {
  if (node.type === "text") return String(node.text || "").replace(/\u200B/g, "");

  switch (node.type) {
    case "mentionTag": {
      const expand = String(node.attrs?.expandText || "").trim();
      if (expand) return expand;
      return String(node.attrs?.label || "").trim();
    }
    case "paragraph":
      return walkInlineNodes(node.content || []);
    case "hardBreak":
      return "\n";
    case "doc":
      return (node.content || []).map(walkPlainNode).join("\n");
    default:
      return walkInlineNodes(node.content || []);
  }
}

export function serializeToPlainText(doc: JSONContent | null | undefined): string {
  if (!doc) return "";
  return walkPlainNode(doc).replace(/\n+$/, "").trimEnd();
}

export function serializeForGenerate(
  doc: JSONContent | null | undefined,
): PromptGeneratePayload {
  const imageUrls: string[] = [];
  const videoUrls: string[] = [];
  const audioUrls: string[] = [];
  const assetIds: string[] = [];

  const walkInline = (nodes: JSONContent[]): string => {
    let out = "";
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]!;
      const piece = walk(node);
      out += piece;
      const next = nodes[i + 1];
      if (
        node.type === "mentionTag" &&
        next?.type === "text" &&
        /\d$/.test(piece) &&
        /^\d/.test(String(next.text || "").replace(/\u200B/g, ""))
      ) {
        out += " ";
      }
    }
    return out;
  };

  const walk = (node: JSONContent): string => {
    if (node.type === "text") return String(node.text || "").replace(/\u200B/g, "");
    switch (node.type) {
      case "mentionTag": {
        const expand = String(node.attrs?.expandText || "").trim();
        const url = String(node.attrs?.url || "").trim();
        const kind = String(node.attrs?.mediaKind || "").trim();
        const mentionId = String(node.attrs?.mentionId || "").trim();
        if (mentionId && !assetIds.includes(mentionId)) assetIds.push(mentionId);

        if (url && kind === "video") {
          if (!videoUrls.includes(url)) videoUrls.push(url);
          return expand || mentionExpandText("video", videoUrls.indexOf(url) + 1);
        }
        if (url && kind === "audio") {
          if (!audioUrls.includes(url)) audioUrls.push(url);
          return expand || mentionExpandText("audio", audioUrls.indexOf(url) + 1);
        }
        if (url) {
          if (!imageUrls.includes(url)) imageUrls.push(url);
          return expand || mentionExpandText("image", imageUrls.indexOf(url) + 1);
        }
        if (expand) return expand;
        return String(node.attrs?.label || "").trim();
      }
      case "paragraph":
        return walkInline(node.content || []);
      case "hardBreak":
        return "\n";
      case "doc":
        return (node.content || []).map(walk).join("\n");
      default:
        return walkInline(node.content || []);
    }
  };

  return {
    prompt: walk(doc || { type: "doc", content: [] })
      .replace(/\n+$/, "")
      .trimEnd(),
    imageUrls,
    videoUrls,
    audioUrls,
    assetIds,
  };
}

function mentionNode(
  kind: "image" | "video" | "audio",
  index1: number,
  item: MentionResolveItem | null,
): JSONContent {
  if (item) {
    return {
      type: "mentionTag",
      attrs: {
        label: item.label.startsWith("@") ? item.label : `@${item.label}`,
        mentionId: item.id,
        expandText: item.expandText || mentionExpandText(kind, index1),
        url: item.url,
        mediaKind: item.mediaKind === "text" ? "image" : item.mediaKind,
      },
    };
  }
  return {
    type: "mentionTag",
    attrs: {
      label: mentionLabel(kind, index1),
      mentionId: "",
      expandText: mentionExpandText(kind, index1),
      url: "",
      mediaKind: kind,
    },
  };
}

function lineToInlineContent(
  line: string,
  mentionItems?: MentionResolveItem[],
): JSONContent[] | undefined {
  if (!line) return undefined;
  const maxByKind = {
    image: poolMax(mentionItems, "image"),
    video: poolMax(mentionItems, "video"),
    audio: poolMax(mentionItems, "audio"),
  };
  // When pool unknown, still try parse; disambiguate uses ≤2 digits
  if (!hasMentionWireToken(line)) {
    return [{ type: "text", text: line }];
  }

  const mentions = [
    ...scanMentions(line, maxByKind),
    ...scanBracketMentions(line),
  ].sort((a, b) => a.start - b.start);
  if (!mentions.length) return [{ type: "text", text: line }];

  const out: JSONContent[] = [];
  let last = 0;
  for (const m of mentions) {
    if (m.start < last) continue;
    if (m.start > last) {
      out.push({ type: "text", text: line.slice(last, m.start) });
    }
    if (m.assetName) {
      const item = mentionItems?.length
        ? resolveMentionByName(mentionItems, m.assetName)
        : null;
      if (item) {
        out.push({
          type: "mentionTag",
          attrs: {
            label: item.label.startsWith("@")
              ? item.label
              : `@${item.label}`,
            mentionId: item.id,
            expandText: item.expandText || `@[${m.assetName}]`,
            url: item.url,
            mediaKind:
              item.mediaKind === "text" ? "image" : item.mediaKind || "image",
          },
        });
      } else {
        out.push({
          type: "mentionTag",
          attrs: {
            label: `@${m.assetName}`,
            mentionId: "",
            expandText: `@[${m.assetName}]`,
            url: "",
            mediaKind: "image",
          },
        });
      }
    } else {
      const item =
        mentionItems?.length && m.index1 > 0
          ? resolveMention(mentionItems, m.kind, m.index1)
          : null;
      out.push(mentionNode(m.kind, m.index1, item));
    }
    last = m.end;
  }
  if (last < line.length) {
    out.push({ type: "text", text: line.slice(last) });
  }
  return out.length ? out : undefined;
}

export function plainTextToDoc(
  text: string,
  mentionItems?: MentionResolveItem[],
): JSONContent {
  const lines = normalizeOmniWireMentions(String(text ?? ""))
    .replace(/\r\n/g, "\n")
    .split("\n");
  if (!lines.length || (lines.length === 1 && !lines[0])) {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }
  return {
    type: "doc",
    content: lines.map((line) => ({
      type: "paragraph",
      content: lineToInlineContent(line, mentionItems),
    })),
  };
}

export function emptyDoc(): JSONContent {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

/** Split prompt for feed UI: plain runs + mention chips. */
export type PromptDisplayPart =
  | { type: "text"; text: string }
  | {
      type: "mention";
      token: string;
      kind: "image" | "video" | "audio";
      index1: number;
      url?: string;
      label: string;
    };

export function splitPromptForDisplay(
  text: string,
  referenceUrls: string[] = [],
): PromptDisplayPart[] {
  const src = normalizeOmniWireMentions(String(text ?? ""));
  if (!src) return [];

  const imageUrls = referenceUrls.filter(
    (u) =>
      !/\.(mp4|webm|mov)(\?|$)/i.test(u) &&
      !/\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/i.test(u),
  );
  // Extension-less uploads count as images for indexing
  const imagePool =
    imageUrls.length > 0
      ? imageUrls
      : referenceUrls.filter(
          (u) =>
            !/\.(mp4|webm|mov)(\?|$)/i.test(u) &&
            !/\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/i.test(u),
        );
  const videoUrls = referenceUrls.filter((u) =>
    /\.(mp4|webm|mov)(\?|$)/i.test(u),
  );
  const audioUrls = referenceUrls.filter((u) =>
    /\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/i.test(u),
  );
  // Prefer overall ref count for image when URLs lack extensions
  const imageMax = Math.max(imagePool.length, referenceUrls.length > 0 ? referenceUrls.length : 0);

  const mentions = scanMentions(src, {
    image: imageMax || imagePool.length,
    video: videoUrls.length,
    audio: audioUrls.length,
  });

  if (!mentions.length) {
    return [{ type: "text", text: src }];
  }

  const parts: PromptDisplayPart[] = [];
  let last = 0;
  for (const m of mentions) {
    if (m.start > last) {
      parts.push({ type: "text", text: src.slice(last, m.start) });
    }
    const pool =
      m.kind === "video"
        ? videoUrls
        : m.kind === "audio"
          ? audioUrls
          : imagePool.length
            ? imagePool
            : referenceUrls;
    parts.push({
      type: "mention",
      token: m.token,
      kind: m.kind,
      index1: m.index1,
      url: m.index1 > 0 ? pool[m.index1 - 1] : undefined,
      label: mentionLabel(m.kind, m.index1),
    });
    last = m.end;
  }
  if (last < src.length) {
    parts.push({ type: "text", text: src.slice(last) });
  }
  return parts;
}
