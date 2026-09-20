"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { CloudUpload, FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/shared/lib/toast";
import { cn } from "@/shared/lib/utils";

const MAX_BYTES = 8 * 1024 * 1024;

async function readScriptFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const buf = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    return result.value.trim();
  }
  return (await file.text()).trim();
}

type Props = {
  disabled?: boolean;
  onText: (text: string, meta: { fileName: string }) => void;
  className?: string;
  /** card = 大片入口卡；button = 工具条小按钮 */
  variant?: "button" | "card";
};

/** 剧本原文导入：txt / md / docx */
export function ScriptFileImport({
  disabled,
  onText,
  className,
  variant = "button",
}: Props) {
  const [busy, setBusy] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      setBusy(true);
      try {
        const text = await readScriptFile(file);
        if (!text) {
          toast.error("文件内容为空");
          return;
        }
        onText(text, { fileName: file.name });
        toast.success(`已导入 ${file.name}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "导入失败");
      } finally {
        setBusy(false);
      }
    },
    [onText],
  );

  const onDrop = useCallback(
    (files: File[]) => {
      const file = files[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  const { getRootProps, getInputProps, open, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/plain": [".txt"],
      "text/markdown": [".md", ".markdown"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        [".docx"],
    },
    maxSize: MAX_BYTES,
    multiple: false,
    noClick: true,
    noKeyboard: true,
    disabled: disabled || busy,
    onDropRejected: (rejections) => {
      const code = rejections[0]?.errors[0]?.code;
      if (code === "file-too-large") {
        toast.error("文件需在 8MB 以内");
        return;
      }
      toast.error("请上传 .txt / .md / .docx");
    },
  });

  if (variant === "card") {
    return (
      <div {...getRootProps()} className={cn(className)}>
        <input {...getInputProps()} />
        <button
          type="button"
          className={cn(
            "manju-entry-card",
            isDragActive && "manju-entry-card--active",
          )}
          disabled={disabled || busy}
          onClick={(e) => {
            e.preventDefault();
            open();
          }}
        >
          <span className="manju-entry-card__icon" aria-hidden>
            {busy ? (
              <Loader2 className="h-8 w-8 animate-spin" />
            ) : (
              <CloudUpload className="h-8 w-8" />
            )}
          </span>
          <strong>{busy ? "导入中…" : isDragActive ? "松开导入" : "上传剧本"}</strong>
        </button>
      </div>
    );
  }

  return (
    <div
      {...getRootProps()}
      className={cn(
        "inline-flex rounded-md",
        isDragActive && "ring-2 ring-ring/40",
        className,
      )}
    >
      <input {...getInputProps()} />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || busy}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          open();
        }}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileUp className="h-4 w-4" />
        )}
        {busy ? "导入中…" : isDragActive ? "松开导入" : "导入文件"}
      </Button>
    </div>
  );
}
