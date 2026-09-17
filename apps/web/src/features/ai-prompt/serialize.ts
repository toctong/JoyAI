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
 * Wire / display tokens: `@图片1` `@视频1` `@音频1`（兼容 `@图1`）。
 * 旧数据 `{{Image 1}}` 仍可解析成 tag，新写入只用 @。
 */
export const MENTION_TOKEN_RE =
  /\{\{(Image|Video|Audio)\s+(\d+)\}\}|@(图片|视频|音频|图)(\d+)/gi;

export function mentionExpandText(
  mediaKind: "image" | "video" | "audio" | "text",
  index1: number,
): string {
  if (mediaKind === "video") return `@视频${index1}`;
  if (mediaKind === "audio") return `@音频${index1}`;
  return `@图片${index1}`;
}

export function mentionLabel(
  mediaKind: "image" | "video" | "audio" | "text",
  index1: number,
): string {
  return mentionExpandText(mediaKind, index1);
}

function kindFromMatch(
  braceKind: string | undefined,
  atKind: string | undefined,
): "image" | "video" | "audio" {
  const b = (braceKind || "").toLowerCase();
  if (b === "video") return "video";
  if (b === "audio") return "audio";
  if (b === "image") return "image";
  if (atKind === "视频") return "video";
  if (atKind === "音频") return "audio";
  return "image";
}

function indexFromMatch(m: RegExpExecArray): number {
  // groups: 1 braceKind, 2 braceIndex, 3 atKind, 4 atIndex
  return Number(m[2] || m[4] || "0");
}

function walkPlain(node: JSONContent): string {
  if (node.type === "text") return String(node.text || "").replace(/\u200B/g, "");

  const children = (node.content || []).map(walkPlain).join("");

  switch (node.type) {
    case "mentionTag": {
      const expand = String(node.attrs?.expandText || "").trim();
      if (expand) return expand;
      return String(node.attrs?.label || "").trim();
    }
    case "paragraph":
      return children;
    case "hardBreak":
      return "\n";
    case "doc":
      return (node.content || []).map(walkPlain).join("\n");
    default:
      return children;
  }
}

export function serializeToPlainText(doc: JSONContent | null | undefined): string {
  if (!doc) return "";
  return walkPlain(doc).replace(/\n+$/, "").trimEnd();
}

export function serializeForGenerate(
  doc: JSONContent | null | undefined,
): PromptGeneratePayload {
  const imageUrls: string[] = [];
  const videoUrls: string[] = [];
  const audioUrls: string[] = [];
  const assetIds: string[] = [];

  const walk = (node: JSONContent): string => {
    if (node.type === "text") return String(node.text || "").replace(/\u200B/g, "");
    const children = (node.content || []).map(walk).join("");
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
        return children;
      case "hardBreak":
        return "\n";
      case "doc":
        return (node.content || []).map(walk).join("\n");
      default:
        return children;
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

function resolveMention(
  items: MentionResolveItem[],
  kind: "image" | "video" | "audio",
  index1: number,
): MentionResolveItem | null {
  const pool = items.filter((i) =>
    kind === "image"
      ? i.mediaKind === "image" || i.mediaKind === "text"
      : i.mediaKind === kind,
  );
  return pool[index1 - 1] ?? null;
}

function lineToInlineContent(
  line: string,
  mentionItems?: MentionResolveItem[],
): JSONContent[] | undefined {
  if (!line) return undefined;
  if (!mentionItems?.length) {
    // Still parse tokens so bare @图片1 can become tags once refs arrive
    const hasToken = MENTION_TOKEN_RE.test(line);
    MENTION_TOKEN_RE.lastIndex = 0;
    if (!hasToken) return [{ type: "text", text: line }];
  }

  const out: JSONContent[] = [];
  let last = 0;
  const re = new RegExp(MENTION_TOKEN_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) {
      out.push({ type: "text", text: line.slice(last, m.index) });
    }
    const full = m[0];
    const index1 = indexFromMatch(m);
    const kind = kindFromMatch(m[1], m[3]);
    const item =
      mentionItems?.length && index1 > 0
        ? resolveMention(mentionItems, kind, index1)
        : null;
    if (item) {
      out.push({
        type: "mentionTag",
        attrs: {
          label: item.label.startsWith("@") ? item.label : `@${item.label}`,
          mentionId: item.id,
          expandText: item.expandText || mentionExpandText(kind, index1),
          url: item.url,
          mediaKind: item.mediaKind === "text" ? "image" : item.mediaKind,
        },
      });
    } else if (index1 > 0) {
      // Token without resolved ref yet — keep as tag shell if we can show label
      out.push({
        type: "mentionTag",
        attrs: {
          label: mentionLabel(kind, index1),
          mentionId: "",
          expandText: mentionExpandText(kind, index1),
          url: "",
          mediaKind: kind,
        },
      });
    } else {
      out.push({ type: "text", text: full });
    }
    last = m.index + full.length;
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
  const lines = String(text ?? "")
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
  const src = String(text ?? "");
  if (!src) return [];
  const parts: PromptDisplayPart[] = [];
  let last = 0;
  const re = new RegExp(MENTION_TOKEN_RE.source, "gi");
  let m: RegExpExecArray | null;
  const imageUrls = referenceUrls.filter(
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

  while ((m = re.exec(src)) !== null) {
    if (m.index > last) {
      parts.push({ type: "text", text: src.slice(last, m.index) });
    }
    const full = m[0];
    const index1 = indexFromMatch(m);
    const kind = kindFromMatch(m[1], m[3]);
    const pool =
      kind === "video" ? videoUrls : kind === "audio" ? audioUrls : imageUrls;
    const url =
      (index1 > 0 ? pool[index1 - 1] : undefined) ||
      (kind === "image" && index1 > 0 ? referenceUrls[index1 - 1] : undefined);
    parts.push({
      type: "mention",
      token: full,
      kind,
      index1,
      url,
      label: mentionLabel(kind, index1),
    });
    last = m.index + full.length;
  }
  if (last < src.length) {
    parts.push({ type: "text", text: src.slice(last) });
  }
  return parts;
}

export function hasMentionWireToken(text: string): boolean {
  const re = new RegExp(MENTION_TOKEN_RE.source, "gi");
  return re.test(String(text ?? ""));
}
