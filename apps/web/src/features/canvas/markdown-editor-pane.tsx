"use client";

import MDEditor from "@uiw/react-md-editor";
import {
  getCommands,
  getExtraCommands,
} from "@uiw/react-md-editor/commands-cn";
import type { CSSProperties } from "react";
import { cn } from "@/shared/lib/utils";
import "@uiw/react-md-editor/markdown-editor.css";
import "./markdown-editor-pane.css";

export type MarkdownPreviewMode = "edit" | "live" | "preview";

type Props = {
  value: string;
  placeholder?: string;
  colorMode: "light" | "dark";
  onChange: (value: string) => void;
  /**
   * Default edit — toolbar + full-width write pane (弹框「编辑提示词」形态).
   * Toolbar 可切到 live / preview.
   */
  preview?: MarkdownPreviewMode;
  /** Fill parent (dialog). Ignore when `height` is set. */
  fill?: boolean;
  /** Fixed height in px for embedded form fields. */
  height?: number | string;
  hideToolbar?: boolean;
  className?: string;
};

export function MarkdownEditorPane({
  value,
  placeholder,
  colorMode,
  onChange,
  preview = "edit",
  fill = true,
  height,
  hideToolbar = false,
  className,
}: Props) {
  const resolvedPreview = hideToolbar ? "edit" : preview;
  const useFixedHeight = height != null;

  return (
    <div
      data-color-mode={colorMode}
      className={cn(
        "joy-md-editor",
        fill && !useFixedHeight && "joy-md-editor--fill",
        useFixedHeight && "joy-md-editor--fixed",
        hideToolbar && "joy-md-editor--compact",
        className,
      )}
      style={
        useFixedHeight
          ? ({
              "--joy-md-height":
                typeof height === "number" ? `${height}px` : height,
            } as CSSProperties)
          : undefined
      }
    >
      <MDEditor
        value={value}
        preview={resolvedPreview}
        height={useFixedHeight ? height : "100%"}
        visibleDragbar={false}
        highlightEnable={false}
        hideToolbar={hideToolbar}
        commands={getCommands()}
        extraCommands={getExtraCommands()}
        textareaProps={{
          placeholder: placeholder ?? "支持 Markdown",
        }}
        onChange={(next) => onChange(next ?? "")}
      />
    </div>
  );
}
