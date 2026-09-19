"use client";

import type { CSSProperties, MouseEvent } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { cn } from "@/shared/lib/utils";
import "@uiw/react-md-editor/markdown-editor.css";
import "./manju-md-field.css";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), {
  ssr: false,
  loading: () => (
    <div className="manju-md-field__skeleton rounded-md border border-border bg-muted/40" />
  ),
});

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Fixed editor height in px */
  height?: number;
  /** edit | live | preview — default edit for dense forms */
  preview?: "edit" | "live" | "preview";
  className?: string;
  hideToolbar?: boolean;
};

export function ManjuMdField({
  value,
  onChange,
  placeholder,
  height = 160,
  preview = "edit",
  className,
  hideToolbar = false,
}: Props) {
  const { resolvedTheme } = useTheme();
  const colorMode = resolvedTheme === "dark" ? "dark" : "light";

  return (
    <div
      data-color-mode={colorMode}
      className={cn(
        "manju-md-field",
        hideToolbar && "manju-md-field--compact",
        className,
      )}
      style={
        {
          minHeight: height,
          "--manju-md-height": `${height}px`,
        } as CSSProperties
      }
      onMouseDown={(event: MouseEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement;
        if (target.closest("button, a, .w-md-editor-toolbar")) return;
        const field = event.currentTarget.querySelector("textarea");
        if (field && target !== field) field.focus();
      }}
    >
      <MDEditor
        value={value}
        preview={preview}
        height={height}
        visibleDragbar={false}
        highlightEnable={false}
        hideToolbar={hideToolbar}
        textareaProps={{
          placeholder: placeholder ?? "支持 Markdown",
        }}
        onChange={(next) => onChange(next ?? "")}
      />
    </div>
  );
}
