import type { JSONContent } from "@tiptap/core";

export type PromptGeneratePayload = {
  prompt: string;
  imageUrls: string[];
  videoUrls: string[];
  assetIds: string[];
};

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
  const assetIds: string[] = [];

  const walk = (node: JSONContent): string => {
    if (node.type === "text") return String(node.text || "").replace(/\u200B/g, "");
    const children = (node.content || []).map(walk).join("");
    switch (node.type) {
      case "mentionTag": {
        const expand = String(node.attrs?.expandText || "").trim();
        if (expand) return expand;
        const url = String(node.attrs?.url || "").trim();
        const kind = String(node.attrs?.mediaKind || "").trim();
        const mentionId = String(node.attrs?.mentionId || "").trim();
        if (mentionId && !assetIds.includes(mentionId)) assetIds.push(mentionId);
        if (url && kind === "video") {
          if (!videoUrls.includes(url)) videoUrls.push(url);
          return `@视频${videoUrls.indexOf(url) + 1}`;
        }
        if (url) {
          if (!imageUrls.includes(url)) imageUrls.push(url);
          return `@图${imageUrls.indexOf(url) + 1}`;
        }
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
    assetIds,
  };
}

export function plainTextToDoc(text: string): JSONContent {
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
      content: line ? [{ type: "text", text: line }] : undefined,
    })),
  };
}

export function emptyDoc(): JSONContent {
  return { type: "doc", content: [{ type: "paragraph" }] };
}
