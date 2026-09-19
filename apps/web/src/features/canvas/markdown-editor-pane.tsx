"use client";

import MDEditor from "@uiw/react-md-editor";
import {
  getCommands,
  getExtraCommands,
} from "@uiw/react-md-editor/commands-cn";
import "@uiw/react-md-editor/markdown-editor.css";
import "./markdown-editor-pane.css";

type Props = {
  value: string;
  placeholder?: string;
  colorMode: "light" | "dark";
  onChange: (value: string) => void;
};

export function MarkdownEditorPane({
  value,
  placeholder,
  colorMode,
  onChange,
}: Props) {
  return (
    <div
      data-color-mode={colorMode}
      className="joy-md-editor flex min-h-0 flex-1 flex-col"
    >
      <MDEditor
        value={value}
        preview="live"
        height="100%"
        visibleDragbar={false}
        highlightEnable={false}
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
