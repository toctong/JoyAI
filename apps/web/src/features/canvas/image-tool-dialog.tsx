"use client";

import {
  CanvasIconCheck,
  CanvasIconClose,
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
import { cn } from "@/shared/lib/utils";
import { toast } from "@/shared/lib/toast";
import {
  cropImageToPiece,
  readImageSize,
  resolveUpscaleSize,
  splitImageToPieces,
  UPSCALE_TARGETS,
  upscaleImageToPiece,
  type CropNorm,
  type RasterPiece,
  type UpscaleAlgo,
} from "./lib/image-raster";

export type ImageToolMode = "crop" | "split" | "upscale" | "view";

type ResizeHandle = "n" | "e" | "s" | "w" | "ne" | "nw" | "se" | "sw";

const HANDLES: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const DEFAULT_CROP: CropNorm = { x: 0.12, y: 0.12, width: 0.76, height: 0.76 };
const MIN_CROP = 0.06;

const RATIOS: { id: string; label: string; value: number | null }[] = [
  { id: "free", label: "自由", value: null },
  { id: "1:1", label: "1:1", value: 1 },
  { id: "4:3", label: "4:3", value: 4 / 3 },
  { id: "16:9", label: "16:9", value: 16 / 9 },
  { id: "3:4", label: "3:4", value: 3 / 4 },
  { id: "9:16", label: "9:16", value: 9 / 16 },
];

const ALGOS: { id: UpscaleAlgo; label: string; hint: string }[] = [
  { id: "high", label: "高清插值", hint: "分步放大，细节更稳" },
  { id: "bilinear", label: "双线性", hint: "更平滑" },
  { id: "nearest", label: "最近邻", hint: "适合像素图" },
];

type Props = {
  mode: ImageToolMode | null;
  url: string;
  onClose: () => void;
  onCommit: (pieces: RasterPiece[]) => Promise<void>;
};

export function ImageToolDialog({ mode, url, onClose, onCommit }: Props) {
  const open = mode !== null && Boolean(url);
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [crop, setCrop] = useState<CropNorm>(DEFAULT_CROP);
  const [ratio, setRatio] = useState<number | null>(null);
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(2);
  const [target, setTarget] = useState<number>(2048);
  const [algo, setAlgo] = useState<UpscaleAlgo>("high");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setBusy(false);
    setCrop(DEFAULT_CROP);
    setRatio(null);
    setRows(2);
    setCols(2);
    setAlgo("high");
    setMeta(null);
    let cancelled = false;
    void readImageSize(url).then(
      (size) => {
        if (cancelled) return;
        setMeta(size);
        const long = Math.max(size.width, size.height);
        const next =
          UPSCALE_TARGETS.find((edge) => long < edge) ??
          UPSCALE_TARGETS[UPSCALE_TARGETS.length - 1];
        setTarget(next);
      },
      () => {
        if (!cancelled) setMeta(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open, url, mode]);

  const cropPx = meta
    ? {
        width: Math.max(1, Math.round(crop.width * meta.width)),
        height: Math.max(1, Math.round(crop.height * meta.height)),
      }
    : null;
  const output = meta
    ? resolveUpscaleSize(meta.width, meta.height, target)
    : null;
  const canUpscale = Boolean(
    meta && Math.max(meta.width, meta.height) < target,
  );

  async function run(task: () => Promise<RasterPiece[]>) {
    setBusy(true);
    try {
      const pieces = await task();
      await onCommit(pieces);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "处理失败");
    } finally {
      setBusy(false);
    }
  }

  function applyRatio(next: number | null) {
    setRatio(next);
    const box = boxRef.current?.getBoundingClientRect();
    if (next === null || !box || !meta || box.width <= 0 || box.height <= 0) {
      return;
    }
    let width = 0.78;
    let height = (width * box.width) / (next * box.height);
    if (height > 0.78) {
      height = 0.78;
      width = (height * next * box.height) / box.width;
    }
    setCrop({
      x: (1 - width) / 2,
      y: (1 - height) / 2,
      width,
      height,
    });
  }

  function startDrag(
    kind: "move" | "resize",
    event: ReactPointerEvent,
    handle: ResizeHandle = "se",
  ) {
    if (busy) return;
    const box = boxRef.current?.getBoundingClientRect();
    if (!box || box.width <= 0 || box.height <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    const start = { x: event.clientX, y: event.clientY, crop };
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.x) / box.width;
      const dy = (ev.clientY - start.y) / box.height;
      setCrop(
        kind === "move"
          ? moveCrop(start.crop, dx, dy)
          : resizeCrop(start.crop, dx, dy, handle, ratio, box),
      );
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const title =
    mode === "crop"
      ? "裁剪"
      : mode === "split"
        ? "切图"
        : mode === "upscale"
          ? "放大"
          : "查看大图";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent
        data-canvas-shortcuts-ignore
        className="max-w-3xl"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {mode === "upscale"
              ? "本地插值放大（1K / 2K / 4K），结果上传为新图像节点。不是模型 AI 超分。"
              : mode === "view"
                ? meta
                  ? `${meta.width} × ${meta.height} px`
                  : "读取尺寸中"
                : "结果会上传为新的图像节点，并连回当前节点。"}
          </DialogDescription>
        </DialogHeader>

        {mode === "view" ? (
          <img
            src={url}
            alt=""
            className="max-h-[68vh] w-full rounded-lg object-contain"
            draggable={false}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
            <div className="grid place-items-center rounded-xl bg-muted/40 p-3">
              <div
                ref={boxRef}
                className="relative inline-block max-w-full select-none overflow-hidden rounded-lg bg-black"
              >
                <img
                  src={url}
                  alt=""
                  className="block max-h-[48vh] max-w-full"
                  draggable={false}
                />
                {mode === "crop" ? (
                  <>
                    <CropMask crop={crop} />
                    <div
                      className="absolute cursor-move border-2 border-white"
                      style={cropStyle(crop)}
                      onPointerDown={(event) => startDrag("move", event)}
                    >
                      <div className="pointer-events-none absolute inset-x-0 top-1/3 border-t border-white/45" />
                      <div className="pointer-events-none absolute inset-x-0 top-2/3 border-t border-white/45" />
                      <div className="pointer-events-none absolute inset-y-0 left-1/3 border-l border-white/45" />
                      <div className="pointer-events-none absolute inset-y-0 left-2/3 border-l border-white/45" />
                      {HANDLES.map((handle) => (
                        <button
                          key={handle}
                          type="button"
                          aria-label="调整裁剪框"
                          className="absolute size-3 rounded-full border border-black bg-white"
                          style={handleStyle(handle)}
                          onPointerDown={(event) =>
                            startDrag("resize", event, handle)
                          }
                        />
                      ))}
                    </div>
                  </>
                ) : null}
                {mode === "split" ? <SplitGrid rows={rows} cols={cols} /> : null}
              </div>
            </div>

            <div className="flex flex-col gap-3 text-sm">
              {mode === "crop" ? (
                <>
                  <p className="text-muted-foreground">
                    {cropPx
                      ? `裁剪 ${cropPx.width} × ${cropPx.height} px`
                      : "读取尺寸中"}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {RATIOS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={cn(
                          "rounded-md border px-2 py-1 text-xs",
                          (item.value === null
                            ? ratio === null
                            : ratio !== null &&
                              Math.abs(ratio - item.value) < 0.01) &&
                            "border-primary bg-primary/10 text-primary",
                        )}
                        onClick={() => applyRatio(item.value)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-auto flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setCrop(DEFAULT_CROP);
                        setRatio(null);
                      }}
                    >
                      重置
                    </Button>
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => [await cropImageToPiece(url, crop)])
                      }
                    >
                      <CanvasIconCheck className="size-4" />
                      {busy ? "处理中…" : "生成裁剪"}
                    </Button>
                  </div>
                </>
              ) : null}

              {mode === "split" ? (
                <>
                  <p className="text-muted-foreground">
                    均分为 {rows} 行 × {cols} 列，共 {rows * cols} 张
                  </p>
                  <CountField label="行" value={rows} onChange={setRows} />
                  <CountField label="列" value={cols} onChange={setCols} />
                  <div className="mt-auto flex justify-end">
                    <Button
                      type="button"
                      disabled={busy || rows * cols < 2}
                      onClick={() =>
                        void run(() => splitImageToPieces(url, rows, cols))
                      }
                    >
                      {busy ? "处理中…" : "生成切片"}
                    </Button>
                  </div>
                </>
              ) : null}

              {mode === "upscale" ? (
                <>
                  <p className="text-muted-foreground">
                    源图{" "}
                    {meta ? `${meta.width} × ${meta.height}` : "读取中"}
                    {output ? ` → ${output.width} × ${output.height}` : ""}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {UPSCALE_TARGETS.map((edge) => {
                      const disabled = Boolean(
                        meta && Math.max(meta.width, meta.height) >= edge,
                      );
                      const label =
                        edge >= 4096 ? "4K" : edge >= 2048 ? "2K" : "1K";
                      return (
                        <button
                          key={edge}
                          type="button"
                          disabled={disabled}
                          className={cn(
                            "rounded-md border px-2 py-1 text-xs disabled:opacity-40",
                            target === edge &&
                              "border-primary bg-primary/10 text-primary",
                          )}
                          onClick={() => setTarget(edge)}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {ALGOS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={cn(
                          "rounded-lg border px-3 py-2 text-left",
                          algo === item.id && "border-primary bg-primary/10",
                        )}
                        onClick={() => setAlgo(item.id)}
                      >
                        <span className="block font-medium">{item.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {item.hint}
                        </span>
                      </button>
                    ))}
                  </div>
                  {!canUpscale && meta ? (
                    <p className="text-xs text-destructive">
                      已经达到当前目标，无需放大
                    </p>
                  ) : null}
                  <div className="mt-auto flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={onClose}
                    >
                      <CanvasIconClose className="size-4" />
                      取消
                    </Button>
                    <Button
                      type="button"
                      disabled={busy || !canUpscale}
                      onClick={() =>
                        void run(async () => [
                          await upscaleImageToPiece(url, target, algo),
                        ])
                      }
                    >
                      {busy ? "处理中…" : "生成放大图"}
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CountField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <input
        type="number"
        min={1}
        max={6}
        value={value}
        className="h-8 w-16 rounded-md border bg-background px-2 text-sm"
        onChange={(event) => {
          const next = Number(event.target.value);
          if (!Number.isFinite(next)) return;
          onChange(Math.min(6, Math.max(1, Math.round(next))));
        }}
      />
    </label>
  );
}

function CropMask({ crop }: { crop: CropNorm }) {
  return (
    <>
      <div
        className="pointer-events-none absolute inset-x-0 top-0 bg-black/55"
        style={{ height: `${crop.y * 100}%` }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/55"
        style={{ height: `${(1 - crop.y - crop.height) * 100}%` }}
      />
      <div
        className="pointer-events-none absolute bg-black/55"
        style={{
          left: 0,
          top: `${crop.y * 100}%`,
          width: `${crop.x * 100}%`,
          height: `${crop.height * 100}%`,
        }}
      />
      <div
        className="pointer-events-none absolute bg-black/55"
        style={{
          right: 0,
          top: `${crop.y * 100}%`,
          width: `${(1 - crop.x - crop.width) * 100}%`,
          height: `${crop.height * 100}%`,
        }}
      />
    </>
  );
}

function SplitGrid({ rows, cols }: { rows: number; cols: number }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {Array.from({ length: Math.max(0, cols - 1) }, (_, index) => (
        <div
          key={`c-${index}`}
          className="absolute bottom-0 top-0 w-px bg-white/80"
          style={{ left: `${((index + 1) / cols) * 100}%` }}
        />
      ))}
      {Array.from({ length: Math.max(0, rows - 1) }, (_, index) => (
        <div
          key={`r-${index}`}
          className="absolute left-0 right-0 h-px bg-white/80"
          style={{ top: `${((index + 1) / rows) * 100}%` }}
        />
      ))}
    </div>
  );
}

function cropStyle(crop: CropNorm) {
  return {
    left: `${crop.x * 100}%`,
    top: `${crop.y * 100}%`,
    width: `${crop.width * 100}%`,
    height: `${crop.height * 100}%`,
  };
}

function handleStyle(handle: ResizeHandle) {
  const top = handle.includes("n")
    ? "-6px"
    : handle.includes("s")
      ? "calc(100% - 6px)"
      : "calc(50% - 6px)";
  const left = handle.includes("w")
    ? "-6px"
    : handle.includes("e")
      ? "calc(100% - 6px)"
      : "calc(50% - 6px)";
  return { top, left, cursor: `${handle}-resize` };
}

function moveCrop(crop: CropNorm, dx: number, dy: number): CropNorm {
  return {
    ...crop,
    x: clamp(crop.x + dx, 0, 1 - crop.width),
    y: clamp(crop.y + dy, 0, 1 - crop.height),
  };
}

function resizeCrop(
  crop: CropNorm,
  dx: number,
  dy: number,
  handle: ResizeHandle,
  aspectRatio: number | null,
  box: DOMRect,
): CropNorm {
  const next = { ...crop };
  if (handle.includes("e")) next.width = crop.width + dx;
  if (handle.includes("s")) next.height = crop.height + dy;
  if (handle.includes("w")) {
    next.x = crop.x + dx;
    next.width = crop.width - dx;
  }
  if (handle.includes("n")) {
    next.y = crop.y + dy;
    next.height = crop.height - dy;
  }

  if (aspectRatio !== null) {
    if (handle === "n" || handle === "s") {
      next.width = (next.height * box.height * aspectRatio) / box.width;
      next.x = crop.x + (crop.width - next.width) / 2;
    } else if (handle === "e" || handle === "w") {
      next.height = (next.width * box.width) / (aspectRatio * box.height);
      next.y = crop.y + (crop.height - next.height) / 2;
    } else {
      next.height = (next.width * box.width) / (aspectRatio * box.height);
      if (handle.includes("n")) next.y = crop.y + crop.height - next.height;
    }
  }

  next.width = clamp(next.width, MIN_CROP, 1);
  next.height = clamp(next.height, MIN_CROP, 1);
  next.x = clamp(next.x, 0, 1 - next.width);
  next.y = clamp(next.y, 0, 1 - next.height);
  return next;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
