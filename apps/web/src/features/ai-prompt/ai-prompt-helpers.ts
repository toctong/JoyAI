import type { Editor } from "@tiptap/core";
import {
  hasMentionWireToken,
  plainTextToDoc,
  serializeForGenerate,
  type MentionResolveItem,
  type PromptGeneratePayload,
} from "./serialize";

export function getGeneratePayload(
  editor: Editor | null,
): PromptGeneratePayload {
  if (!editor) {
    return { prompt: "", imageUrls: [], videoUrls: [], audioUrls: [], assetIds: [] };
  }
  return serializeForGenerate(editor.getJSON());
}

export function setEditorPlainText(
  editor: Editor | null,
  text: string,
  mentionItems?: MentionResolveItem[],
) {
  if (!editor) return;
  editor.commands.setContent(plainTextToDoc(text, mentionItems));
}

/** Re-parse current wire text into mention tags when refs become available. */
export function hydrateEditorMentions(
  editor: Editor | null,
  mentionItems: MentionResolveItem[],
) {
  if (!editor || !mentionItems.length) return;
  const payload = serializeForGenerate(editor.getJSON());
  const text = payload.prompt;
  if (!text || !hasMentionWireToken(text)) return;
  editor.commands.setContent(plainTextToDoc(text, mentionItems));
}
