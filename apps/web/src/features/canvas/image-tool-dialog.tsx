"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Crop,
  FlipHorizontal2,
  FlipVertical2,
  Grid3x3,
  Link2,
  Ratio,
  RotateCcw,
  RotateCw,
  Ruler,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { toast } from "@/shared/lib/toast";
import { AspectRatioGlyph } from "@/features/studio/aspect-ratio-glyph";
import {
  cropImageToPiece,
  readImageSize,
  splitImageToPieces,
  type CropNorm,
  type RasterPiece,
} from "./lib/image-raster";
import { loadCanvasImage } from "./lib/load-canvas-image";
import {
  CanvasStudioShell,
  type StudioResultItem,
} from "./studio/canvas-studio-shell";
import { StudioImageStage } from "./studio/studio-image-stage";
import { StudioSidePanels } from "./studio/studio-side-panels";

export type ImageToolMode = "crop" | "split" | "view";

type ResizeHandle = "n" | "e" | "s" | "w" | "ne" | "nw" | "se" | "sw";
type GuideMode = "none" | "thirds" | "golden" | "cross";

const HANDLES: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const DEFAULT_CROP: CropNorm = { x: 0.12, y: 0.12, width: 0.76, height: 0.76 };
const MIN_CROP = 0.06;
const GOLDEN = 0.382;

const RATIOS: { id: string; label: string; value: number | null }[] = [
  { id: "free", label: "自由", value: null },
  { id: "original", label: "原图", value: -1 },
  { id: "1:1", label: "1:1", value: 1 },
  { id: "4:3", label: "4:3", value: 4 / 3 },
  { id: "3:4", label: "3:4", value: 3 / 4 },
  { id: "16:9", label: "16:9", value: 16 / 9 },
  { id: "9:16", label: "9:16", value: 9 / 16 },
  { id: "3:2", label: "3:2", value: 3 / 2 },
  { id: "2:3", label: "2:3", value: 2 / 3 },
  { id: "21:9", label: "21:9", value: 21 / 9 },
];

/** Common row×col grids for the split panel (max 6 per side). */
const SPLIT_PRESETS: { rows: number; cols: number; label: string }[] = [
  { rows: 1, cols: 2, label: "1×2" },
  { rows: 2, cols: 1, label: "2×1" },
  { rows: 2, cols: 2, label: "2×2" },
  { rows: 1, cols: 3, label: "1×3" },
  { rows: 3, cols: 1, label: "3×1" },
  { rows: 2, cols: 3, label: "2×3" },
  { rows: 3, cols: 2, label: "3×2" },
  { rows: 3, cols: 3, label: "3×3" },
  { rows: 2, cols: 4, label: "2×4" },
  { rows: 4, cols: 2, label: "4×2" },
  { rows: 4, cols: 4, label: "4×4" },
];

const GUIDES: { id: GuideMode; label: string }[] = [
  { id: "none", label: "无" },
  { id: "thirds", label: "三分线" },
  { id: "golden", label: "黄金分割" },
  { id: "cross", label: "中心十字" },
];

type Props = {
  mode: ImageToolMode | null;
  url: string;
  nodeTitle?: string;
  onClose: () => void;
  onCommit: (pieces: RasterPiece[]) => Promise<void>;
};

export function ImageToolDialog({
  mode,
  url,
  nodeTitle,
  onClose,
  onCommit,
}: Props) {
  const open = mode !== null && Boolean(url);
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [crop, setCrop] = useState<CropNorm>(DEFAULT_CROP);
  const [ratioId, setRatioId] = useState("free");
  const [ratio, setRatio] = useState<number | null>(null);
  const [customA, setCustomA] = useState(3);
  const [customB, setCustomB] = useState(2);
  const [lockRatio, setLockRatio] = useState(false);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [guide, setGuide] = useState<GuideMode>("none");
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(2);
  const [results, setResults] = useState<StudioResultItem[]>([]);
  const [activeResultId, setActiveResultId] = useState<string | null>(null);
  const [pendingPieces, setPendingPieces] = useState<RasterPiece[]>([]);
  const [stageSize, setStageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  /** Crop working image — rotate bakes into this URL (not a sticky mode). */
  const [editUrl, setEditUrl] = useState(url);
  const editBlobRef = useRef<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const cropRef = useRef(crop);
  cropRef.current = crop;

  function revokeEditBlob() {
    if (editBlobRef.current) {
      URL.revokeObjectURL(editBlobRef.current);
      editBlobRef.current = null;
    }
  }

  function replaceEditUrl(next: string) {
    revokeEditBlob();
    if (next.startsWith("blob:") && next !== url) {
      editBlobRef.current = next;
    }
    setEditUrl(next);
  }

  function stageBox(): { width: number; height: number } | null {
    const el = boxRef.current?.getBoundingClientRect();
    if (el && el.width > 0 && el.height > 0) {
      return { width: el.width, height: el.height };
    }
    if (stageSize && stageSize.width > 0 && stageSize.height > 0) {
      return stageSize;
    }
    return null;
  }

  useEffect(() => {
    if (!open) return;
    setBusy(false);
    setCrop(DEFAULT_CROP);
    setRatioId("free");
    setRatio(null);
    setCustomA(3);
    setCustomB(2);
    setLockRatio(false);
    setFlipH(false);
    setFlipV(false);
    setGuide("none");
    setRows(2);
    setCols(2);
    setMeta(null);
    setResults([]);
    setActiveResultId(null);
    setPendingPieces([]);
    setStageSize(null);
    revokeEditBlob();
    setEditUrl(url);
    let cancelled = false;
    void readImageSize(url).then(
      (size) => {
        if (cancelled) return;
        setMeta(size);
      },
      () => {
        if (!cancelled) setMeta(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open, url, mode]);

  useEffect(() => {
    return () => revokeEditBlob();
  }, []);

  const cropPx = meta
    ? {
        x: Math.max(0, Math.round(crop.x * meta.width)),
        y: Math.max(0, Math.round(crop.y * meta.height)),
        width: Math.max(1, Math.round(crop.width * meta.width)),
        height: Math.max(1, Math.round(crop.height * meta.height)),
      }
    : null;
  const outPx = cropPx
    ? { width: cropPx.width, height: cropPx.height }
    : null;

  const applyRatioValue = useCallback(
    (next: number | null, nextId: string) => {
      setRatio(next);
      setRatioId(nextId);
      if (next !== null && next > 0) {
        setLockRatio(true);
        const preset = RATIOS.find((item) => item.id === nextId);
        if (preset?.label.includes(":")) {
          const [a, b] = preset.label.split(":").map(Number);
          if (a && b) {
            setCustomA(a);
            setCustomB(b);
          }
        }
      }
      if (next === null) setLockRatio(false);
      const box = stageBox();
      if (next === null || next < 0 || !box || !meta || box.width <= 0) return;
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
    },
    [meta, stageSize],
  );

  async function run(task: () => Promise<RasterPiece[]>) {
    setBusy(true);
    try {
      const pieces = await task();
      const items: StudioResultItem[] = pieces.map((piece, index) => ({
        id: `piece-${index}-${piece.blob.size}`,
        url: URL.createObjectURL(piece.blob),
        label: pieces.length > 1 ? `切片 ${index + 1}` : "结果",
      }));
      setResults((prev) => {
        prev.forEach((item) => URL.revokeObjectURL(item.url));
        return items;
      });
      setPendingPieces(pieces);
      setActiveResultId(items[0]?.id ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "处理失败");
    } finally {
      setBusy(false);
    }
  }

  async function applyToCanvas() {
    if (!pendingPieces.length) return;
    setBusy(true);
    try {
      await onCommit(pendingPieces);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "应用失败");
      setBusy(false);
    }
  }

  function resetCrop() {
    setCrop(DEFAULT_CROP);
    setRatioId("free");
    setRatio(null);
    setLockRatio(false);
    setFlipH(false);
    setFlipV(false);
    replaceEditUrl(url);
  }

  function clearRatio() {
    applyRatioValue(null, "free");
    setLockRatio(false);
  }

  function clearTransform() {
    setFlipH(false);
    setFlipV(false);
  }

  const turnRotate = useCallback(
    async (delta: 90 | -90) => {
      if (busy || mode !== "crop" || activeResultId) return;
      const deg: 90 | 270 = delta === 90 ? 90 : 270;
      setBusy(true);
      try {
        const next = await rotateImageUrl(editUrl, deg);
        replaceEditUrl(next.url);
        setMeta({ width: next.width, height: next.height });
        setCrop((prev) => rotateCropNorm(prev, deg));
        if (lockRatio && ratio !== null && ratio > 0) {
          const swapped = 1 / ratio;
          const nextA = customB;
          const nextB = customA;
          setRatio(swapped);
          setCustomA(nextA);
          setCustomB(nextB);
          const match = RATIOS.find(
            (item) =>
              item.value !== null &&
              item.value > 0 &&
              Math.abs(item.value - swapped) < 0.01,
          );
          setRatioId(match?.id ?? "custom");
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "旋转失败");
      } finally {
        setBusy(false);
      }
    },
    [
      activeResultId,
      busy,
      customA,
      customB,
      editUrl,
      lockRatio,
      mode,
      ratio,
      url,
    ],
  );

  function transformBadge() {
    const parts: string[] = [];
    if (flipH) parts.push("左右镜像");
    if (flipV) parts.push("上下镜像");
    return parts.length ? parts.join(" · ") : undefined;
  }

  function swapRatio() {
    if (ratio !== null && ratio > 0) {
      const next = 1 / ratio;
      setCustomA(customB);
      setCustomB(customA);
      const match = RATIOS.find(
        (item) =>
          item.value !== null &&
          item.value > 0 &&
          Math.abs(item.value - next) < 0.01,
      );
      applyRatioValue(next, match?.id ?? "custom");
      return;
    }
    if (customA > 0 && customB > 0) {
      const nextA = customB;
      const nextB = customA;
      setCustomA(nextA);
      setCustomB(nextB);
      applyRatioValue(nextA / nextB, "custom");
    }
  }

  function setCropFromPixels(next: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }) {
    if (!meta) return;
    const cur = cropPx!;
    let x = next.x ?? cur.x;
    let y = next.y ?? cur.y;
    let width = next.width ?? cur.width;
    let height = next.height ?? cur.height;

    const locked =
      lockRatio && ratio !== null && ratio > 0
        ? ratio
        : lockRatio && cur.height > 0
          ? cur.width / cur.height
          : null;

    if (locked !== null) {
      if (next.width != null && next.height == null) {
        height = Math.max(1, Math.round(width / locked));
      } else if (next.height != null && next.width == null) {
        width = Math.max(1, Math.round(height * locked));
      }
    }

    width = clamp(width, 1, meta.width);
    height = clamp(height, 1, meta.height);
    x = clamp(x, 0, meta.width - width);
    y = clamp(y, 0, meta.height - height);

    setCrop({
      x: x / meta.width,
      y: y / meta.height,
      width: width / meta.width,
      height: height / meta.height,
    });
  }

  function startDrag(
    kind: "move" | "resize",
    event: ReactPointerEvent,
    handle: ResizeHandle = "se",
  ) {
    if (busy) return;
    const box = stageBox();
    if (!box || box.width <= 0 || box.height <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    const start = { x: event.clientX, y: event.clientY, crop };
    const aspect =
      ratio && ratio > 0
        ? ratio
        : lockRatio && crop.height > 0
          ? (crop.width * box.width) / (crop.height * box.height)
          : null;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.x) / box.width;
      const dy = (ev.clientY - start.y) / box.height;
      setCrop(
        kind === "move"
          ? moveCrop(start.crop, dx, dy)
          : resizeCrop(start.crop, dx, dy, handle, aspect, box),
      );
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const confirmCrop = useCallback(() => {
    if (busy || mode !== "crop") return;
    void run(async () => [
      await cropImageToPiece(editUrl, cropRef.current, { flipH, flipV }),
    ]);
  }, [busy, editUrl, flipH, flipV, mode]);

  useEffect(() => {
    if (!open || mode !== "crop") return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (pendingPieces.length) void applyToCanvas();
        else confirmCrop();
        return;
      }
      const step = (event.shiftKey ? 8 : 2) / Math.max(1, meta?.width ?? 1000);
      const cur = cropRef.current;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setCrop(moveCrop(cur, -step, 0));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setCrop(moveCrop(cur, step, 0));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setCrop(moveCrop(cur, 0, -step));
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setCrop(moveCrop(cur, 0, step));
      } else if (event.key.toLowerCase() === "h") {
        setFlipH((v) => !v);
      } else if (event.key.toLowerCase() === "v") {
        setFlipV((v) => !v);
      } else if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        void turnRotate(event.shiftKey ? -90 : 90);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [confirmCrop, meta?.width, mode, open, pendingPieces.length, turnRotate]);

  const title =
    mode === "crop" ? "裁切" : mode === "split" ? "宫格切图" : "查看大图";

  const previewUrl =
    (activeResultId && results.find((r) => r.id === activeResultId)?.url) ||
    (mode === "crop" ? editUrl : url);

  const transformHint = transformBadge();

  const footerHint =
    mode === "crop" && outPx
      ? [
          "拖动选框或在右侧输入精确数值",
          ratioId !== "free"
            ? (RATIOS.find((r) => r.id === ratioId)?.label ?? ratioId)
            : null,
          transformHint,
          "免积分",
          "原图保留",
        ]
          .filter(Boolean)
          .join(" · ")
      : mode === "split"
        ? `均分 ${rows} × ${cols}，共 ${rows * cols} 张`
        : meta
          ? `原图 · ${meta.width} × ${meta.height}`
          : "读取尺寸中…";

  if (!open || !mode) return null;

  return (
    <CanvasStudioShell
      open={open}
      title={title}
      titleIcon={mode === "crop" ? <Crop /> : undefined}
      subtitle={nodeTitle}
      sourceUrl={url}
      results={results}
      activeResultId={activeResultId}
      onSelectSource={() => setActiveResultId(null)}
      onSelectResult={setActiveResultId}
      onClose={() => {
        if (!busy) onClose();
      }}
      stageTools={
        mode === "crop" && !activeResultId ? (
          <div className="joy-studio-shell__center-head-row">
            <div className="joy-studio-shell__center-head-start">
              <span className="px-1 text-xs text-white/55">
                原图 · {meta ? `${meta.width} × ${meta.height}` : "…"}
              </span>
            </div>
            <div className="joy-studio-shell__center-head-end">
              <button
                type="button"
                className="joy-studio-shell__tool-btn"
                onClick={resetCrop}
              >
                <RotateCcw className="size-3.5 opacity-80" />
                重置选区
              </button>
            </div>
          </div>
        ) : null
      }
      center={
        <StudioImageStage
          url={previewUrl}
          onReady={setStageSize}
          imgStyle={
            mode === "crop" && !activeResultId
              ? {
                  transform: `scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
                }
              : undefined
          }
          overlay={() => {
            if (mode === "crop" && !activeResultId) {
              return (
                <div ref={boxRef} className="absolute inset-0">
                  <CropMask crop={crop} />
                  <div
                    className="joy-studio-crop-box"
                    style={cropStyle(crop)}
                    onPointerDown={(event) => startDrag("move", event)}
                  >
                    <CropGuides mode={guide} />
                    {HANDLES.map((handle) => {
                      const isCorner = handle.length === 2;
                      return (
                        <button
                          key={handle}
                          type="button"
                          aria-label="调整裁剪框"
                          className={cn(
                            "joy-studio-crop-handle",
                            isCorner ? `is-corner is-${handle}` : "is-edge",
                          )}
                          style={handleStyle(handle, isCorner)}
                          onPointerDown={(event) =>
                            startDrag("resize", event, handle)
                          }
                        />
                      );
                    })}
                  </div>
                </div>
              );
            }
            if (mode === "split" && !activeResultId) {
              return <SplitGrid rows={rows} cols={cols} />;
            }
            return null;
          }}
        />
      }
      sideTitle={
        mode === "crop"
          ? outPx
            ? (
                <span className="inline-flex items-center gap-1.5">
                  输出 {outPx.width} × {outPx.height} px
                  <Link2 className="size-3.5 opacity-45" />
                </span>
              )
            : "裁切"
          : mode === "split"
            ? "切图设置"
            : "图片信息"
      }
      sideMeta={
        mode === "crop"
          ? undefined
          : meta
            ? `${meta.width} × ${meta.height} px`
            : undefined
      }
      sideHeadAction={
        mode === "crop" ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-white/55 hover:text-white/85"
            onClick={resetCrop}
          >
            <RotateCcw className="size-3.5 opacity-70" />
            重置
          </button>
        ) : null
      }
      side={
        <>
          {mode === "crop" ? (
            <StudioSidePanels
              defaultOpen={["ratio"]}
              items={[
                {
                  id: "ratio",
                  title: "宽高比",
                  icon: <Ratio />,
                  badge:
                    ratioId !== "free"
                      ? (RATIOS.find((r) => r.id === ratioId)?.label ??
                        (ratioId === "custom"
                          ? `${customA}:${customB}`
                          : ratioId))
                      : undefined,
                  onClear: ratioId !== "free" ? clearRatio : undefined,
                  content: (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-white/45">常用</span>
                        <button
                          type="button"
                          className="joy-studio-shell__chip h-7 gap-1 px-2 text-xs"
                          title="横竖互换"
                          onClick={swapRatio}
                        >
                          横竖互换
                        </button>
                      </div>
                      <div className="joy-studio-shell__ratio-grid">
                        {RATIOS.map((item) => {
                          const on =
                            item.id === "free"
                              ? ratioId === "free"
                              : item.id === "original"
                                ? ratioId === "original"
                                : ratioId === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              className={cn(
                                "joy-studio-shell__ratio-btn",
                                on && "is-on",
                              )}
                              onClick={() => {
                                if (item.value === null) {
                                  applyRatioValue(null, "free");
                                } else if (item.value < 0 && meta) {
                                  applyRatioValue(
                                    meta.width / meta.height,
                                    "original",
                                  );
                                } else if (item.value !== null) {
                                  applyRatioValue(item.value, item.id);
                                }
                              }}
                            >
                              <span className="joy-studio-shell__ratio-glyph">
                                {item.value !== null && item.value > 0 ? (
                                  <AspectRatioGlyph ratio={item.label} />
                                ) : (
                                  <span
                                    className={cn(
                                      "joy-studio-shell__ratio-glyph-fallback",
                                      item.id === "free" && "is-free",
                                    )}
                                  />
                                )}
                              </span>
                              <span className="joy-studio-shell__ratio-label">
                                {item.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="joy-studio-shell__field">
                        <span className="joy-studio-shell__field-label">
                          <span>自定义比例</span>
                          {ratioId === "free" ? (
                            <span className="text-white/35">当前为自由裁切</span>
                          ) : null}
                        </span>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            max={99}
                            value={customA}
                            className="joy-studio-shell__input text-center"
                            onChange={(event) => {
                              const next = Number(event.target.value);
                              if (!Number.isFinite(next) || next <= 0) return;
                              setCustomA(next);
                              applyRatioValue(
                                next / Math.max(1, customB),
                                "custom",
                              );
                            }}
                          />
                          <span className="shrink-0 text-white/40">:</span>
                          <input
                            type="number"
                            min={1}
                            max={99}
                            value={customB}
                            className="joy-studio-shell__input text-center"
                            onChange={(event) => {
                              const next = Number(event.target.value);
                              if (!Number.isFinite(next) || next <= 0) return;
                              setCustomB(next);
                              applyRatioValue(
                                Math.max(1, customA) / next,
                                "custom",
                              );
                            }}
                          />
                        </div>
                      </div>
                    </>
                  ),
                },
                {
                  id: "flip",
                  title: "旋转与镜像",
                  icon: <RotateCw />,
                  badge: transformHint,
                  onClear:
                    flipH || flipV ? clearTransform : undefined,
                  content: (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/10 text-sm text-white/75 hover:bg-white/5 hover:text-white"
                          disabled={busy}
                          onClick={() => void turnRotate(-90)}
                        >
                          <RotateCcw className="size-4 opacity-80" />
                          逆时针 90°
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/10 text-sm text-white/75 hover:bg-white/5 hover:text-white"
                          disabled={busy}
                          onClick={() => void turnRotate(90)}
                        >
                          <RotateCw className="size-4 opacity-80" />
                          顺时针 90°
                        </button>
                        <button
                          type="button"
                          className={cn(
                            "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/10 text-sm text-white/75",
                            flipH &&
                              "border-[#1ec8e0] bg-[rgba(30,200,224,0.2)] text-white",
                          )}
                          onClick={() => setFlipH((v) => !v)}
                        >
                          <FlipHorizontal2 className="size-4 opacity-80" />
                          左右镜像
                        </button>
                        <button
                          type="button"
                          className={cn(
                            "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/10 text-sm text-white/75",
                            flipV &&
                              "border-[#1ec8e0] bg-[rgba(30,200,224,0.2)] text-white",
                          )}
                          onClick={() => setFlipV((v) => !v)}
                        >
                          <FlipVertical2 className="size-4 opacity-80" />
                          上下镜像
                        </button>
                      </div>
                      <p className="text-xs text-white/35">
                        旋转会立刻转图并适配选区 · 镜像为开关 · 快捷键 R / Shift+R · H / V
                      </p>
                    </>
                  ),
                },
                {
                  id: "guides",
                  title: "辅助线",
                  icon: <Grid3x3 />,
                  badge:
                    guide !== "none"
                      ? GUIDES.find((g) => g.id === guide)?.label
                      : undefined,
                  onClear:
                    guide !== "none" ? () => setGuide("none") : undefined,
                  content: (
                    <div className="flex flex-wrap gap-1.5">
                      {GUIDES.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={cn(
                            "h-8 rounded-md px-2.5 text-xs text-white/65",
                            guide === item.id
                              ? "bg-[rgba(30,200,224,0.35)] text-white"
                              : "bg-white/5 hover:bg-white/10",
                          )}
                          onClick={() => setGuide(item.id)}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  ),
                },
                {
                  id: "precise",
                  title: "精确数值",
                  icon: <Ruler />,
                  content: cropPx ? (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <PxField
                          label="X"
                          value={cropPx.x}
                          onChange={(value) => setCropFromPixels({ x: value })}
                        />
                        <PxField
                          label="Y"
                          value={cropPx.y}
                          onChange={(value) => setCropFromPixels({ y: value })}
                        />
                        <PxField
                          label="宽"
                          value={cropPx.width}
                          onChange={(value) =>
                            setCropFromPixels({ width: value })
                          }
                        />
                        <PxField
                          label="高"
                          value={cropPx.height}
                          onChange={(value) =>
                            setCropFromPixels({ height: value })
                          }
                        />
                      </div>
                      <button
                        type="button"
                        className={cn(
                          "inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs",
                          lockRatio
                            ? "bg-[rgba(30,200,224,0.25)] text-white"
                            : "text-white/50 hover:bg-white/5 hover:text-white/80",
                        )}
                        onClick={() => {
                          setLockRatio((v) => {
                            const next = !v;
                            if (next && cropPx.height > 0) {
                              setRatio(cropPx.width / cropPx.height);
                              setRatioId("custom");
                            }
                            return next;
                          });
                        }}
                      >
                        <Link2 className="size-3.5 opacity-80" />
                        {lockRatio ? "已锁定比例" : "锁定当前比例"}
                      </button>
                    </>
                  ) : (
                    <p className="text-xs text-white/40">读取尺寸中…</p>
                  ),
                },
              ]}
            />
          ) : null}

          {mode === "split" ? (
            <StudioSidePanels
              items={[
                {
                  id: "grid",
                  title: "切图设置",
                  icon: <Grid3x3 />,
                  badge: `${rows}×${cols}`,
                  content: (
                    <>
                      <div className="joy-studio-shell__field">
                        <span className="joy-studio-shell__field-label">
                          <span>常用网格</span>
                        </span>
                        <div className="joy-studio-shell__grid-btns">
                          {SPLIT_PRESETS.map((preset) => {
                            const on =
                              rows === preset.rows && cols === preset.cols;
                            return (
                              <button
                                key={preset.label}
                                type="button"
                                className={cn(
                                  "joy-studio-shell__grid-btn",
                                  on && "is-on",
                                )}
                                aria-pressed={on}
                                onClick={() => {
                                  setRows(preset.rows);
                                  setCols(preset.cols);
                                }}
                              >
                                {preset.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <CountField label="行" value={rows} onChange={setRows} />
                      <CountField label="列" value={cols} onChange={setCols} />
                    </>
                  ),
                },
              ]}
            />
          ) : null}

          {mode === "view" ? (
            <p className="text-sm text-white/50">只读预览，Esc 关闭。</p>
          ) : null}
        </>
      }
      sideFoot={
        mode === "crop"
          ? "Enter 确认裁切 · Esc 关闭 · 方向键微调选区（Shift 大步） · 一张图可连续裁等多张，结果在左侧陈列"
          : undefined
      }
      footerHint={footerHint}
      footerActions={
        mode === "view" ? null : pendingPieces.length ? (
          <>
            {mode === "crop" && cropPx ? (
              <span className="joy-studio-shell__chip tabular-nums">
                <Link2 className="size-3.5 opacity-60" />
                {pendingPieces[0]?.pixelWidth} × {pendingPieces[0]?.pixelHeight}{" "}
                px
              </span>
            ) : null}
            <button
              type="button"
              className="joy-studio-shell__primary"
              disabled={busy}
              onClick={() => void applyToCanvas()}
            >
              {busy ? "应用中…" : "应用到画布"}
            </button>
          </>
        ) : (
          <>
            {mode === "crop" && outPx ? (
              <span className="joy-studio-shell__chip tabular-nums">
                <Link2 className="size-3.5 opacity-60" />
                {outPx.width} × {outPx.height} px
              </span>
            ) : null}
            <button
              type="button"
              className="joy-studio-shell__primary"
              disabled={busy || (mode === "split" && rows * cols < 2)}
              onClick={() => {
                if (mode === "crop") confirmCrop();
                else if (mode === "split") {
                  void run(() => splitImageToPieces(url, rows, cols));
                }
              }}
            >
              {busy
                ? "处理中…"
                : mode === "crop"
                  ? "确认裁切"
                  : "生成切片"}
            </button>
          </>
        )
      }
    />
  );
}

function PxField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="joy-studio-shell__field mb-0 gap-1">
      <span className="text-xs text-white/45">{label}</span>
      <div className="relative">
        <input
          type="number"
          min={0}
          value={value}
          className="joy-studio-shell__input pr-8 tabular-nums"
          onChange={(event) => {
            const next = Number(event.target.value);
            if (!Number.isFinite(next)) return;
            onChange(Math.round(next));
          }}
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-white/35">
          px
        </span>
      </div>
    </label>
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
    <label className="joy-studio-shell__field">
      <span className="joy-studio-shell__field-label">
        <span>{label}</span>
        <span className="tabular-nums">{value}</span>
      </span>
      <input
        type="number"
        min={1}
        max={6}
        value={value}
        className="joy-studio-shell__input"
        onChange={(event) => {
          const next = Number(event.target.value);
          if (!Number.isFinite(next)) return;
          onChange(Math.min(6, Math.max(1, Math.round(next))));
        }}
      />
    </label>
  );
}

function CropGuides({ mode }: { mode: GuideMode }) {
  if (mode === "none") return null;
  const lines =
    mode === "thirds"
      ? [1 / 3, 2 / 3]
      : mode === "golden"
        ? [GOLDEN, 1 - GOLDEN]
        : [0.5];
  return (
    <div className="pointer-events-none absolute inset-0">
      {lines.map((p) => (
        <div
          key={`v-${p}`}
          className="absolute bottom-0 top-0 w-px bg-white/45"
          style={{ left: `${p * 100}%` }}
        />
      ))}
      {lines.map((p) => (
        <div
          key={`h-${p}`}
          className="absolute left-0 right-0 h-px bg-white/45"
          style={{ top: `${p * 100}%` }}
        />
      ))}
    </div>
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

function handleStyle(handle: ResizeHandle, isCorner: boolean) {
  const size = isCorner ? 14 : 6;
  const half = size / 2;
  const top = handle.includes("n")
    ? `-${half}px`
    : handle.includes("s")
      ? `calc(100% - ${half}px)`
      : `calc(50% - ${half}px)`;
  const left = handle.includes("w")
    ? `-${half}px`
    : handle.includes("e")
      ? `calc(100% - ${half}px)`
      : `calc(50% - ${half}px)`;
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
  box: { width: number; height: number },
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

function rotateCropNorm(crop: CropNorm, deg: 90 | 180 | 270): CropNorm {
  if (deg === 90) {
    return {
      x: crop.y,
      y: 1 - crop.x - crop.width,
      width: crop.height,
      height: crop.width,
    };
  }
  if (deg === 270) {
    return {
      x: 1 - crop.y - crop.height,
      y: crop.x,
      width: crop.height,
      height: crop.width,
    };
  }
  return {
    x: 1 - crop.x - crop.width,
    y: 1 - crop.y - crop.height,
    width: crop.width,
    height: crop.height,
  };
}

async function rotateImageUrl(
  src: string,
  deg: 90 | 180 | 270,
): Promise<{ url: string; width: number; height: number }> {
  const image = await loadCanvasImage(src);
  const swap = deg === 90 || deg === 270;
  const canvas = document.createElement("canvas");
  canvas.width = swap ? image.naturalHeight : image.naturalWidth;
  canvas.height = swap ? image.naturalWidth : image.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法旋转图片");
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (next) => (next ? resolve(next) : reject(new Error("旋转失败"))),
      "image/png",
    );
  });
  return {
    url: URL.createObjectURL(blob),
    width: canvas.width,
    height: canvas.height,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
