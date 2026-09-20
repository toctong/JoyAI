"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/shared/lib/toast";
import { cn } from "@/shared/lib/utils";

const MAX_BYTES = 10 * 1024 * 1024;

type Props = {
  disabled?: boolean;
  onFile: (file: File) => void;
  className?: string;
};

/** 资产参考图上传（react-dropzone，限制图片类型与大小） */
export function AssetRefUpload({ disabled, onFile, className }: Props) {
  const onDrop = useCallback(
    (files: File[]) => {
      const file = files[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  const { getRootProps, getInputProps, open, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/webp": [".webp"],
      "image/gif": [".gif"],
    },
    maxSize: MAX_BYTES,
    multiple: false,
    noClick: true,
    noKeyboard: true,
    disabled,
    onDropRejected: (rejections) => {
      const code = rejections[0]?.errors[0]?.code;
      if (code === "file-too-large") {
        toast.error("图片需在 10MB 以内");
        return;
      }
      toast.error("请上传 png / jpg / webp / gif");
    },
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "flex min-w-0 flex-1 rounded-md",
        isDragActive && "ring-2 ring-primary/40",
      )}
    >
      <input {...getInputProps()} />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("manju-asset-card__action", className)}
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          open();
        }}
      >
        <Upload className="h-3.5 w-3.5" />
        {isDragActive ? "松开" : "上传"}
      </Button>
    </div>
  );
}
