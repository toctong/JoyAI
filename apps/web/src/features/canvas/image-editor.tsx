"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";

type Props = {
  url: string;
  busy?: boolean;
  onClose: () => void;
  onApply: (dataUrl: string) => void;
};

type FabricCanvasLike = {
  dispose?: () => void;
  toDataURL: (opts: { format: string; multiplier: number }) => string;
};

export function ImageEditor({ url, busy = false, onClose, onApply }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<FabricCanvasLike | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    let disposed = false;

    void import("fabric").then(({ fabric }) => {
      if (disposed || !canvasRef.current) return;
      const canvas = new fabric.Canvas(canvasRef.current, {
        width: 640,
        height: 400,
        backgroundColor: "#111",
        selection: true,
      });
      fabricRef.current = canvas;

      fabric.Image.fromURL(
        url,
        (img) => {
          const maxW = 600;
          const maxH = 360;
          const scale = Math.min(
            maxW / (img.width || 1),
            maxH / (img.height || 1),
            1,
          );
          img.scale(scale);
          img.set({
            left: (640 - (img.width || 0) * scale) / 2,
            top: (400 - (img.height || 0) * scale) / 2,
          });
          canvas.add(img);
          canvas.setActiveObject(img);
          canvas.renderAll();
        },
        { crossOrigin: "anonymous" },
      );
    });

    return () => {
      disposed = true;
      fabricRef.current?.dispose?.();
      fabricRef.current = null;
    };
  }, [url]);

  function applyCrop() {
    const canvas = fabricRef.current;
    if (!canvas || busy) return;
    const dataUrl = canvas.toDataURL({ format: "png", multiplier: 1 });
    onApply(dataUrl);
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-3xl rounded-lg border border-border bg-card p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-medium">图像编辑</h3>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={onClose}>
              取消
            </Button>
            <Button size="sm" disabled={busy} onClick={applyCrop}>
              {busy ? "上传中…" : "应用并上传"}
            </Button>
          </div>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          拖动缩放选中对象；应用后上传为 Asset，画布快照只保存 assetId / URL。
        </p>
        <canvas ref={canvasRef} className="mx-auto rounded border border-border" />
      </div>
    </div>,
    document.body,
  );
}
