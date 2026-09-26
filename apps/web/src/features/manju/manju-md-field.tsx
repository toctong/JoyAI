"use client";

import type { CSSProperties, MouseEvent } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { cn } from "@/shared/lib/utils";
import type { MarkdownPreviewMode } from "@/features/canvas/markdown-editor-pane";

const MarkdownEditorPane = dynamic(
  () =>
    import("@/features/canvas/markdown-editor-pane").then(
      (m) => m.MarkdownEditorPane,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="manju-md-field__skeleton rounded-md border border-border bg-muted/40" />
    ),
  },
);

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Fixed editor height in px */
  height?: number;
  /**
   * Default live（左写右预览），与画布「编辑文本」一致。
   * 显式 hideToolbar 或很矮的字段会自动退回 edit。
   */
  preview?: MarkdownPreviewMode;
  className?: string;
  hideToolbar?: boolean;
};

export function ManjuMdField({
  value,
  onChange,
  placeholder,
  height = 200,
  preview = "live",
  className,
  hideToolbar = false,
}: Props) {
  const { resolvedTheme } = useTheme();
  const colorMode = resolvedTheme === "dark" ? "dark" : "light";
  /** Too short for a useful live split — keep a single edit pane. */
  const tooShortForLive = height < 200;
  const resolvedPreview =
    hideToolbar || tooShortForLive ? "edit" : preview;

  return (
    <div
      className={cn("manju-md-field", className)}
      style={{ minHeight: height } as CSSProperties}
      onMouseDown={(event: MouseEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement;
        if (target.closest("button, a, .w-md-editor-toolbar")) return;
        const field = event.currentTarget.querySelector("textarea");
        if (field && target !== field) field.focus();
      }}
    >
      <MarkdownEditorPane
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        colorMode={colorMode}
        preview={resolvedPreview}
        height={height}
        fill={false}
        hideToolbar={hideToolbar}
        className="manju-md-field__pane"
      />
    </div>
  );
}
