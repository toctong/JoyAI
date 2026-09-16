import type { Editor } from "@tiptap/core";
import {
  plainTextToDoc,
  serializeForGenerate,
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

export function setEditorPlainText(editor: Editor | null, text: string) {
  if (!editor) return;
  editor.commands.setContent(plainTextToDoc(text));
}
