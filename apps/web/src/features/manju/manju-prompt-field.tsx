"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import {
  AiPromptEditor,
  serializeToPlainText,
  setEditorPlainText,
  type MentionCandidate,
} from "@/features/ai-prompt";
import { cn } from "@/shared/lib/utils";
import type { ManjuAssetDraft } from "./manju-types";
import "./manju-prompt-field.css";

type Props = {
  value: string;
  onChange: (next: string) => void;
  assets: ManjuAssetDraft[];
  /** 本镜关联资产优先出现在 @ 菜单 */
  preferredAssetIds?: string[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

const KIND_LABEL: Record<ManjuAssetDraft["kind"], string> = {
  character: "角色",
  scene: "场景",
  prop: "道具",
};

function toMentionItems(assets: ManjuAssetDraft[]): MentionCandidate[] {
  return assets
    .filter((a) => a.name.trim())
    .map((a) => {
      const name = a.name.trim();
      return {
        id: a.id,
        label: `${KIND_LABEL[a.kind]}·${name}`,
        url: a.imageUrl || "",
        mediaKind: "image" as const,
        expandText: `@[${name}]`,
      };
    });
}

/** 漫剧画面/视频提示词：@ 补全登记资产，存盘为 @[登记名] */
export function ManjuPromptField({
  value,
  onChange,
  assets,
  preferredAssetIds,
  placeholder = "输入提示词，键入 @ 引用资产",
  disabled,
  className,
}: Props) {
  const editorRef = useRef<Editor | null>(null);
  const [focused, setFocused] = useState(false);
  const preferred = useMemo(
    () => new Set(preferredAssetIds ?? []),
    [preferredAssetIds],
  );

  const mentionItems = useMemo(() => {
    const items = toMentionItems(assets);
    return [...items].sort((a, b) => {
      const ap = preferred.has(a.id) ? 0 : 1;
      const bp = preferred.has(b.id) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return a.label.localeCompare(b.label, "zh-CN");
    });
  }, [assets, preferred]);

  useEffect(() => {
    const ed = editorRef.current;
    if (!ed || focused) return;
    const current = serializeToPlainText(ed.getJSON());
    if (current === value) return;
    setEditorPlainText(ed, value, mentionItems);
  }, [value, mentionItems, focused]);

  return (
    <div
      className={cn("manju-prompt-field", className)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setFocused(false);
        }
      }}
    >
      <AiPromptEditor
        editorRef={editorRef}
        initialText={value}
        mentionItems={mentionItems}
        placeholder={placeholder}
        disabled={disabled}
        onPlainChange={onChange}
      />
    </div>
  );
}
