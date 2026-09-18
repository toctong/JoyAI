"use client";

import {
  CanvasIconBrush,
  CanvasIconEraser,
  CanvasIconRetry,
  CanvasIconWand,
} from "./icons/canvas-icons";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/shared/lib/utils";
import { buildMarkedImageBlob, canvasHasPaint } from "./lib/mark-image";

type Props = {
  url: string;
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: { prompt: string; blob: Blob }) => Promise<void>;
};

type DrawMode = "paint" | "erase";

const MASK_FILL = "rgba(37, 99, 235, 0.38)";
const MAX_EDGE = 1600;

export function MaskEditDialog({ url, open, onClose, onConfirm }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const maskRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<{ active: boolean; last: { x: number; y: number } | null }>({
    active: false,
    last: null,
  });
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [natural, setNatural] = useState("");
  const [prompt, setPrompt] = useState("");
  const [brush, setBrush] = useState(72);
  const [mode, setMode] = useState<DrawMode>("paint");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function applyImageSize(image: HTMLImageElement) {
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height) return;
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    setNatural(`${width} × ${height}`);
    setSize({
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    });
  }

  useEffect(() => {
    if (!open) return;
    setPrompt("");
    setBrush(72);
    setMode("paint");
    setError("");
    setBusy(false);
    const image = imgRef.current;
    if (image?.complete && image.naturalWidth > 0) {
      applyImageSize(image);
      return;
    }
    setSize(null);
    setNatural("");
  }, [open, url]);

  useEffect(() => {
    clearCanvas(maskRef.current);
    clearCanvas(previewRef.current);
  }, [size]);

  function paintPreview() {
    const mask = maskRef.current;
    const preview = previewRef.current;
    const context = preview?.getContext("2d");
    if (!mask || !preview || !context) return;
    context.clearRect(0, 0, preview.width, preview.height);
    context.fillStyle = MASK_FILL;
    context.fillRect(0, 0, preview.width, preview.height);
    context.globalCompositeOperation = "destination-in";
    context.drawImage(mask, 0, 0);
    context.globalCompositeOperation = "source-over";
  }

  function drawAt(event: ReactPointerEvent<HTMLCanvasElement>) {
    const mask = maskRef.current;
    const context = mask?.getContext("2d");
    if (!mask || !context) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const point = {
      x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * mask.width,
      y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * mask.height,
    };
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = brush;
    context.globalCompositeOperation =
      mode === "paint" ? "source-over" : "destination-out";
    context.strokeStyle = "#000";
    context.fillStyle = "#000";
    const last = drawing.current.last;
    if (!last || (last.x === point.x && last.y === point.y)) {
      context.beginPath();
      context.arc(point.x, point.y, brush / 2, 0, Math.PI * 2);
      context.fill();
    } else {
      context.beginPath();
      context.moveTo(last.x, last.y);
      context.lineTo(point.x, point.y);
      context.stroke();
    }
    drawing.current.last = point;
    paintPreview();
    if (mode === "paint") setError("");
  }

  async function submit() {
    const text = prompt.trim();
    const mask = maskRef.current;
    if (!text) {
      setError("请输入修改要求");
      return;
    }
    if (!mask || !canvasHasPaint(mask)) {
      setError("请先涂抹要修改的区域");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const blob = await buildMarkedImageBlob(url, mask);
      await onConfirm({ prompt: text, blob });
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "生成标记图失败");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent
        data-canvas-no-zoom
        data-canvas-shortcuts-ignore
        className="max-w-4xl"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>局部涂抹</DialogTitle>
          <DialogDescription>
            涂出要改的区域，再写修改要求。会生成标记参考图，并连到一个局部重绘提示词节点。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="flex min-h-[280px] items-center justify-center rounded-lg border bg-muted/30 p-3">
            <div className="relative inline-block max-w-full select-none">
              <img
                ref={imgRef}
                src={url}
                alt=""
                draggable={false}
                className="block max-h-[62vh] max-w-full"
                onLoad={(event) => applyImageSize(event.currentTarget)}
              />
              {size ? (
                <>
                  <canvas
                    ref={maskRef}
                    width={size.width}
                    height={size.height}
                    className="hidden"
                  />
                  <canvas
                    ref={previewRef}
                    width={size.width}
                    height={size.height}
                    className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      drawing.current = { active: true, last: null };
                      drawAt(event);
                    }}
                    onPointerMove={(event) => {
                      if (!drawing.current.active) return;
                      event.preventDefault();
                      drawAt(event);
                    }}
                    onPointerUp={() => {
                      drawing.current = { active: false, last: null };
                    }}
                    onPointerCancel={() => {
                      drawing.current = { active: false, last: null };
                    }}
                  />
                </>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              {natural || "读取图片中…"}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={mode === "paint" ? "default" : "outline"}
                onClick={() => setMode("paint")}
              >
                <CanvasIconBrush />
                画笔
              </Button>
              <Button
                type="button"
                variant={mode === "erase" ? "default" : "outline"}
                onClick={() => setMode("erase")}
              >
                <CanvasIconEraser />
                擦除
              </Button>
            </div>
            <label className="space-y-2 text-sm">
              <span className="flex justify-between text-muted-foreground">
                笔刷
                <span className="tabular-nums">{brush}px</span>
              </span>
              <Slider
                min={8}
                max={160}
                step={2}
                value={[brush]}
                onValueChange={([value]) => setBrush(value ?? 72)}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">修改要求</span>
              <textarea
                value={prompt}
                rows={5}
                placeholder="例如：把涂抹区域改成金属材质，保持原图光影"
                className={cn(
                  "w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  error && !prompt.trim() && "border-destructive",
                )}
                onChange={(event) => {
                  setPrompt(event.target.value);
                  setError("");
                }}
              />
            </label>
            {error ? (
              <p className="text-xs text-destructive">{error}</p>
            ) : null}
            <div className="mt-auto flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  clearCanvas(maskRef.current);
                  clearCanvas(previewRef.current);
                  setError("");
                }}
              >
                <CanvasIconRetry />
                重置
              </Button>
              <Button type="button" disabled={busy} onClick={() => void submit()}>
                <CanvasIconWand />
                {busy ? "处理中…" : "创建重绘"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function clearCanvas(canvas: HTMLCanvasElement | null) {
  const context = canvas?.getContext("2d");
  if (!canvas || !context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
}
