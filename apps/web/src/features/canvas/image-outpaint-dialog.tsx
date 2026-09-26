"use client";

/**
 * Outpaint expand — studio shell + DOM frame (image-extender style).
 * Reference UX: 8 handles, side pad labels, ratio / range panels, model footer.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ChevronDown,
  Lightbulb,
  Maximize2,
  Ratio,
  RectangleHorizontal,
  RotateCcw,
} from "lucide-react";
import type { ModelCapabilities } from "@joyai/shared";
import { BrandAvatar } from "@/components/admin/brand-avatar";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AspectRatioGlyph } from "@/features/studio/aspect-ratio-glyph";
import { ComposerModelMenu } from "@/features/studio/composer-model-menu";
import {
  formatQualityLabel,
  layoutControlsFromCapabilities,
} from "@/features/studio/model-options";
import "@/features/studio/creation-composer.css";
import { api } from "@/shared/lib/api";
import { modelIconSrc } from "@/shared/lib/brand-icons";
import { cn } from "@/shared/lib/utils";
import { toast } from "@/shared/lib/toast";
import { readImageSize } from "./lib/image-raster";
import { filterInpaintModels, pickDefaultModelId, rememberImageModelId } from "./lib/inpaint-models";
import {
  buildOutpaintCanvasBlob,
  buildOutpaintPrompt,
  type OutpaintPadding,
} from "./lib/outpaint-canvas";
import { CanvasStudioShell } from "./studio/canvas-studio-shell";
import { StudioSidePanels } from "./studio/studio-side-panels";

type Props = {
  open: boolean;
  url: string;
  nodeTitle?: string;
  onClose: () => void;
  onConfirm: (payload: {
    prompt: string;
    blob: Blob;
    width: number;
    height: number;
    modelId: string;
    resolution?: string;
    ratio?: string;
  }) => Promise<void>;
};

type PublicModel = {
  id: string;
  name: string;
  kind: string;
  remoteId?: string;
  capabilities?: ModelCapabilities | null;
  channel?: { platform?: string; name?: string };
};

type Edge = keyof OutpaintPadding;
type Handle =
  | Edge
  | "nw"
  | "ne"
  | "sw"
  | "se";

const RATIOS: { id: string; label: string; value: number | null }[] = [
  { id: "original", label: "原比例", value: null },
  { id: "free", label: "自由", value: -1 },
  { id: "1:1", label: "1:1", value: 1 },
  { id: "4:3", label: "4:3", value: 4 / 3 },
  { id: "3:4", label: "3:4", value: 3 / 4 },
  { id: "16:9", label: "16:9", value: 16 / 9 },
  { id: "9:16", label: "9:16", value: 9 / 16 },
  { id: "3:2", label: "3:2", value: 3 / 2 },
  { id: "2:3", label: "2:3", value: 2 / 3 },
  { id: "21:9", label: "21:9", value: 21 / 9 },
];

const SCALES = [1.25, 1.5, 2, 3];
const ZERO: OutpaintPadding = { top: 0, right: 0, bottom: 0, left: 0 };
const PREVIEW_MAX = 520;
const DEFAULT_SCALE = 3;

const HANDLES: { id: Handle; className: string }[] = [
  {
    id: "nw",
    className:
      "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize",
  },
  {
    id: "top",
    className:
      "top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize",
  },
  {
    id: "ne",
    className:
      "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize",
  },
  {
    id: "right",
    className:
      "right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
  },
  {
    id: "se",
    className:
      "right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize",
  },
  {
    id: "bottom",
    className:
      "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 cursor-ns-resize",
  },
  {
    id: "sw",
    className:
      "left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize",
  },
  {
    id: "left",
    className:
      "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
  },
];

function padFromScale(
  size: { width: number; height: number },
  mult: number,
): OutpaintPadding {
  const extraW = Math.max(0, Math.round(size.width * (mult - 1)));
  const extraH = Math.max(0, Math.round(size.height * (mult - 1)));
  return {
    top: Math.round(extraH / 2),
    bottom: Math.ceil(extraH / 2),
    left: Math.round(extraW / 2),
    right: Math.ceil(extraW / 2),
  };
}

function applySymmetric(
  next: OutpaintPadding,
  edges: Edge[],
  force: boolean,
): OutpaintPadding {
  if (!force) return next;
  const result = { ...next };
  if (edges.includes("left") || edges.includes("right")) {
    const v = Math.max(result.left, result.right);
    result.left = v;
    result.right = v;
  }
  if (edges.includes("top") || edges.includes("bottom")) {
    const v = Math.max(result.top, result.bottom);
    result.top = v;
    result.bottom = v;
  }
  return result;
}

export function ImageOutpaintDialog({
  open,
  url,
  nodeTitle,
  onClose,
  onConfirm,
}: Props) {
  const [meta, setMeta] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [pad, setPad] = useState<OutpaintPadding>(ZERO);
  const [ratioId, setRatioId] = useState("original");
  const [busy, setBusy] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [symmetric, setSymmetric] = useState(false);
  const [error, setError] = useState("");

  const [models, setModels] = useState<PublicModel[]>([]);
  const [modelId, setModelId] = useState("");
  const [resolution, setResolution] = useState("");
  const [genRatio, setGenRatio] = useState("");
  const [paramsOpen, setParamsOpen] = useState(false);
  const [modelsError, setModelsError] = useState("");

  const padRef = useRef(pad);
  const offsetRef = useRef(offset);
  const symmetricRef = useRef(symmetric);
  padRef.current = pad;
  offsetRef.current = offset;
  symmetricRef.current = symmetric;

  const drag = useRef<{
    x: number;
    y: number;
    ox: number;
    oy: number;
  } | null>(null);

  const outW = meta ? meta.width + pad.left + pad.right : 0;
  const outH = meta ? meta.height + pad.top + pad.bottom : 0;
  const outRatioLabel =
    outW > 0 && outH > 0
      ? Math.abs(outW / outH - 1) < 0.02
        ? "1:1"
        : `${outW}:${outH}`
      : "";

  const preview = useMemo(() => {
    if (!meta || !outW || !outH) return null;
    const scale = Math.min(PREVIEW_MAX / outW, PREVIEW_MAX / outH, 1);
    return {
      scale,
      frameW: Math.round(outW * scale),
      frameH: Math.round(outH * scale),
      imgW: Math.round(meta.width * scale),
      imgH: Math.round(meta.height * scale),
      left: Math.round(pad.left * scale) + offset.x,
      top: Math.round(pad.top * scale) + offset.y,
    };
  }, [meta, outW, outH, pad, offset]);

  const outpaintModels = useMemo(() => filterInpaintModels(models), [models]);
  const selectedModel = outpaintModels.find((m) => m.id === modelId);
  const layout = useMemo(
    () =>
      layoutControlsFromCapabilities(
        selectedModel?.capabilities ?? null,
        "image",
      ),
    [selectedModel],
  );
  const showParams = layout.showRatio || layout.showResolution;
  const ratioLabel =
    layout.aspects.find((item) => item.id === genRatio)?.label ?? genRatio;
  const resolutionOption = layout.resolutions.find((r) => r.id === resolution);
  const resolutionLabel = resolutionOption
    ? formatQualityLabel(resolutionOption, "image")
    : resolution;

  useEffect(() => {
    if (!open) return;
    setBusy(false);
    setOffset({ x: 0, y: 0 });
    setRatioId("original");
    setPad(ZERO);
    setSymmetric(false);
    setError("");
    setMeta(null);
    let cancelled = false;
    void readImageSize(url).then(
      (size) => {
        if (cancelled) return;
        setMeta(size);
        setPad(padFromScale(size, DEFAULT_SCALE));
        setRatioId("original");
      },
      () => {
        if (!cancelled) toast.error("图片尺寸读取失败");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open, url]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void api<PublicModel[]>("/models")
      .then((list) => {
        if (cancelled) return;
        const image = (list ?? []).filter((m) => m.kind === "image");
        setModels(image);
        const filtered = filterInpaintModels(image);
        setModelId(pickDefaultModelId(filtered));
        setModelsError(filtered.length ? "" : "暂无支持扩图的模型");
      })
      .catch((err) => {
        if (cancelled) return;
        setModels([]);
        setModelId("");
        setModelsError(err instanceof Error ? err.message : "模型加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!layout.showResolution || !layout.resolutions.length) {
      setResolution("");
      return;
    }
    setResolution((prev) =>
      layout.resolutions.some((r) => r.id === prev)
        ? prev
        : layout.resolutions[0]!.id,
    );
  }, [layout]);

  useEffect(() => {
    if (!layout.showRatio || !layout.aspects.length) {
      setGenRatio("");
      return;
    }
    setGenRatio((prev) => {
      if (layout.aspects.some((a) => a.id === prev)) return prev;
      const auto = layout.aspects.find(
        (a) => a.id === "auto" || a.flexible,
      );
      return auto?.id ?? layout.aspects[0]!.id;
    });
  }, [layout]);

  function resetAll() {
    if (!meta) {
      setPad(ZERO);
      setOffset({ x: 0, y: 0 });
      setRatioId("original");
      return;
    }
    setPad(padFromScale(meta, DEFAULT_SCALE));
    setOffset({ x: 0, y: 0 });
    setRatioId("original");
    setError("");
  }

  function clearRatio() {
    if (!meta) return;
    setPad(padFromScale(meta, DEFAULT_SCALE));
    setOffset({ x: 0, y: 0 });
    setRatioId("original");
  }

  function clearPad() {
    setPad(ZERO);
    setOffset({ x: 0, y: 0 });
    setRatioId("free");
  }

  function applyRatioToSize(
    size: { width: number; height: number },
    id: string,
    value: number | null,
  ) {
    setRatioId(id);
    setOffset({ x: 0, y: 0 });
    if (value === null) {
      setPad(padFromScale(size, DEFAULT_SCALE));
      return;
    }
    if (value < 0) return;
    const srcR = size.width / size.height;
    let targetW = size.width;
    let targetH = size.height;
    if (value >= srcR) {
      targetW = Math.round(size.height * value);
      targetH = size.height;
    } else {
      targetH = Math.round(size.width / value);
      targetW = size.width;
    }
    const grow = DEFAULT_SCALE;
    targetW = Math.round(targetW * grow);
    targetH = Math.round(targetH * grow);
    const extraW = Math.max(0, targetW - size.width);
    const extraH = Math.max(0, targetH - size.height);
    setPad({
      left: Math.round(extraW / 2),
      right: Math.ceil(extraW / 2),
      top: Math.round(extraH / 2),
      bottom: Math.ceil(extraH / 2),
    });
  }

  function setUniformScale(mult: number) {
    if (!meta) return;
    setOffset({ x: 0, y: 0 });
    setPad(padFromScale(meta, mult));
    setRatioId("original");
  }

  function applyRatio(id: string, value: number | null) {
    if (!meta) return;
    applyRatioToSize(meta, id, value);
  }

  function setPadEdge(key: Edge, value: number) {
    const next = Math.max(0, Math.round(value));
    setPad((current) => {
      const draft = { ...current, [key]: next };
      return applySymmetric(
        draft,
        [key],
        symmetricRef.current,
      );
    });
    setOffset({ x: 0, y: 0 });
    setRatioId("free");
  }

  function startHandleDrag(handle: Handle, event: ReactPointerEvent) {
    if (!meta || !preview || busy) return;
    event.preventDefault();
    event.stopPropagation();
    const start = { x: event.clientX, y: event.clientY, pad: { ...pad } };
    const edges: Edge[] =
      handle === "top" ||
      handle === "bottom" ||
      handle === "left" ||
      handle === "right"
        ? [handle]
        : handle === "nw"
          ? ["top", "left"]
          : handle === "ne"
            ? ["top", "right"]
            : handle === "sw"
              ? ["bottom", "left"]
              : ["bottom", "right"];

    const move = (ev: PointerEvent) => {
      const dx = Math.round((ev.clientX - start.x) / preview.scale);
      const dy = Math.round((ev.clientY - start.y) / preview.scale);
      const next = { ...start.pad };
      if (edges.includes("right")) next.right = Math.max(0, start.pad.right + dx);
      if (edges.includes("left")) next.left = Math.max(0, start.pad.left - dx);
      if (edges.includes("bottom"))
        next.bottom = Math.max(0, start.pad.bottom + dy);
      if (edges.includes("top")) next.top = Math.max(0, start.pad.top - dy);
      const force = symmetricRef.current || ev.altKey || ev.shiftKey;
      setPad(applySymmetric(next, edges, force));
      setRatioId("free");
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function startImageDrag(event: ReactPointerEvent) {
    if (!preview || busy) return;
    event.preventDefault();
    event.stopPropagation();
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      ox: offset.x,
      oy: offset.y,
    };
    const move = (ev: PointerEvent) => {
      if (!drag.current || !preview || !meta) return;
      const dx = ev.clientX - drag.current.x;
      const dy = ev.clientY - drag.current.y;
      const maxX = Math.max(0, preview.frameW - preview.imgW);
      const maxY = Math.max(0, preview.frameH - preview.imgH);
      const baseLeft = Math.round(padRef.current.left * preview.scale);
      const baseTop = Math.round(padRef.current.top * preview.scale);
      const nextX = Math.min(
        Math.max(-baseLeft, drag.current.ox + dx),
        maxX - baseLeft,
      );
      const nextY = Math.min(
        Math.max(-baseTop, drag.current.oy + dy),
        maxY - baseTop,
      );
      setOffset({ x: nextX, y: nextY });
    };
    const up = () => {
      const livePad = padRef.current;
      const liveOffset = offsetRef.current;
      if (preview && meta) {
        const leftPx = Math.max(
          0,
          Math.round(
            (livePad.left * preview.scale + liveOffset.x) / preview.scale,
          ),
        );
        const topPx = Math.max(
          0,
          Math.round(
            (livePad.top * preview.scale + liveOffset.y) / preview.scale,
          ),
        );
        const width = meta.width + livePad.left + livePad.right;
        const height = meta.height + livePad.top + livePad.bottom;
        const rightPx = Math.max(0, width - leftPx - meta.width);
        const bottomPx = Math.max(0, height - topPx - meta.height);
        setPad({
          left: leftPx,
          top: topPx,
          right: rightPx,
          bottom: bottomPx,
        });
        setOffset({ x: 0, y: 0 });
        setRatioId("free");
      }
      drag.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const nudgeAll = useCallback((delta: number) => {
    setPad((current) => ({
      top: Math.max(0, current.top + delta),
      right: Math.max(0, current.right + delta),
      bottom: Math.max(0, current.bottom + delta),
      left: Math.max(0, current.left + delta),
    }));
    setOffset({ x: 0, y: 0 });
    setRatioId("free");
  }, []);

  const submit = useCallback(async () => {
    if (!meta) return;
    if (!modelId) {
      setError(modelsError || "请选择支持图生图的模型");
      return;
    }
    if (pad.top + pad.right + pad.bottom + pad.left <= 0) {
      setError("请先扩展画幅");
      toast.message("请先扩展画幅");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { blob, width, height } = await buildOutpaintCanvasBlob(url, pad);
      await onConfirm({
        prompt: buildOutpaintPrompt(pad),
        blob,
        width,
        height,
        modelId,
        resolution: layout.showResolution ? resolution || undefined : undefined,
        ratio: layout.showRatio ? genRatio || undefined : undefined,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "扩图准备失败");
      setBusy(false);
    }
  }, [
    genRatio,
    layout.showRatio,
    layout.showResolution,
    meta,
    modelId,
    modelsError,
    onConfirm,
    pad,
    resolution,
    url,
  ]);

  useEffect(() => {
    if (!open) return;
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
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey || !event.shiftKey)) {
        event.preventDefault();
        void submit();
        return;
      }
      if (event.key === "0" || event.key.toLowerCase() === "q") {
        event.preventDefault();
        resetAll();
        return;
      }
      if (event.key === "]") {
        event.preventDefault();
        nudgeAll(32);
        return;
      }
      if (event.key === "[") {
        event.preventDefault();
        nudgeAll(-32);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nudgeAll, open, submit]);

  if (!open || !url) return null;

  const ratioDirty = ratioId !== "original";
  const padDirty = pad.top + pad.right + pad.bottom + pad.left > 0;
  const sideMeta = meta
    ? `${meta.width} × ${meta.height} → ${outW} × ${outH}${
        outRatioLabel ? ` · ${ratioId === "1:1" || outRatioLabel === "1:1" ? "1:1" : RATIOS.find((r) => r.id === ratioId)?.label ?? ""}` : ""
      }`
    : undefined;

  return (
    <CanvasStudioShell
      open={open}
      title="扩图"
      subtitle={nodeTitle}
      sourceUrl={url}
      onClose={() => {
        if (!busy) onClose();
      }}
      stageTools={
        meta ? (
          <div className="joy-studio-shell__center-head-row">
            <div className="joy-studio-shell__center-head-start">
              <span className="joy-studio-shell__chip">原图</span>
              <span className="px-1 text-xs text-white/55">
                输出 {outW} × {outH}
                {outW === outH ? " · 1:1" : ""}
              </span>
            </div>
          </div>
        ) : null
      }
      stageHint="拖外框把手扩展画幅 · 按住 Alt 对称扩展 · 框内拖动移动原图位置"
      center={
        preview && meta ? (
          <div
            className="relative rounded-md border border-dashed border-white/35"
            style={{
              width: preview.frameW,
              height: preview.frameH,
              backgroundImage:
                "linear-gradient(45deg,#2a2a2a 25%,transparent 25%),linear-gradient(-45deg,#2a2a2a 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#2a2a2a 75%),linear-gradient(-45deg,transparent 75%,#2a2a2a 75%)",
              backgroundSize: "16px 16px",
              backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
              backgroundColor: "#1c1c1c",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt=""
              draggable={false}
              className="absolute cursor-move object-cover shadow-lg"
              style={{
                left: preview.left,
                top: preview.top,
                width: preview.imgW,
                height: preview.imgH,
              }}
              onPointerDown={startImageDrag}
            />
            {HANDLES.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-label={`扩展${item.id}`}
                className={cn(
                  "absolute z-10 size-3 rounded-full border border-black bg-white",
                  item.className,
                )}
                onPointerDown={(event) => startHandleDrag(item.id, event)}
              />
            ))}
            {pad.top > 0 ? (
              <span className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded bg-black/65 px-1.5 text-[11px] tabular-nums text-white/90">
                +{pad.top}
              </span>
            ) : null}
            {pad.bottom > 0 ? (
              <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded bg-black/65 px-1.5 text-[11px] tabular-nums text-white/90">
                +{pad.bottom}
              </span>
            ) : null}
            {pad.left > 0 ? (
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 rounded bg-black/65 px-1.5 text-[11px] tabular-nums text-white/90">
                +{pad.left}
              </span>
            ) : null}
            {pad.right > 0 ? (
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded bg-black/65 px-1.5 text-[11px] tabular-nums text-white/90">
                +{pad.right}
              </span>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-white/40">读取图片中…</p>
        )
      }
      sideTitle="扩展画幅"
      sideMeta={sideMeta}
      sideHeadAction={
        <button
          type="button"
          className="text-xs text-white/55 hover:text-white/85"
          onClick={resetAll}
        >
          <span className="inline-flex items-center gap-1">
            <RotateCcw className="size-3.5" />
            重置
          </span>
        </button>
      }
      side={
        <StudioSidePanels
          defaultOpen={["ratio", "pad"]}
          items={[
            {
              id: "ratio",
              title: "目标比例",
              icon: <Ratio />,
              badge: RATIOS.find((r) => r.id === ratioId)?.label,
              onClear: ratioDirty ? clearRatio : undefined,
              content: (
                <div className="joy-studio-shell__ratio-grid">
                  {RATIOS.map((item) => {
                    const on = ratioId === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={cn(
                          "joy-studio-shell__ratio-btn",
                          on && "is-on",
                        )}
                        onClick={() => applyRatio(item.id, item.value)}
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
              ),
            },
            {
              id: "pad",
              title: "扩展范围",
              icon: <Maximize2 />,
              badge: outW && outH ? `${outW} × ${outH}` : undefined,
              onClear: padDirty ? clearPad : undefined,
              content: (
                <>
                  <div>
                    <p className="mb-2 text-xs text-white/45">四周等比外扩</p>
                    <div className="joy-studio-shell__grid-btns">
                      {SCALES.map((mult) => (
                        <button
                          key={mult}
                          type="button"
                          className="joy-studio-shell__grid-btn"
                          onClick={() => setUniformScale(mult)}
                        >
                          {mult}×
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs text-white/45">各边扩展</p>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          ["top", "上"],
                          ["bottom", "下"],
                          ["left", "左"],
                          ["right", "右"],
                        ] as const
                      ).map(([key, label]) => (
                        <label key={key} className="joy-studio-shell__field">
                          <span className="joy-studio-shell__field-label">
                            <span>{label}</span>
                            <span className="tabular-nums text-white/45">
                              {pad[key]} px
                            </span>
                          </span>
                          <input
                            type="number"
                            min={0}
                            max={8192}
                            value={pad[key]}
                            className="joy-studio-shell__input"
                            onChange={(event) =>
                              setPadEdge(
                                key,
                                Number(event.target.value) || 0,
                              )
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="joy-studio-shell__field">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-white/85">对称扩展</p>
                        <p className="mt-1 text-xs text-white/40">
                          拖动一边时同步对边；也可按住 Alt
                        </p>
                      </div>
                      <Switch
                        checked={symmetric}
                        onCheckedChange={setSymmetric}
                      />
                    </div>
                  </div>
                </>
              ),
            },
            {
              id: "tips",
              title: "使用建议",
              icon: <Lightbulb />,
              content: (
                <ul className="list-disc space-y-1.5 pl-4 text-xs text-white/50">
                  <li>一次扩太多容易糊边，建议分步外扩</li>
                  <li>单边扩展不超过原图边长约一半，观感更自然</li>
                  <li>接缝不顺时可再用「重绘」局部修一下</li>
                  <li>主体贴边时，优先向另一侧扩展并拖动原图位置</li>
                </ul>
              ),
            },
          ]}
        />
      }
      sideFoot="拖把手 扩展 · Alt+拖 对称 · [ ] 四周收放 · Q 重置 · ⌘↵ 确认扩图"
      footerHint={
        error ||
        `扩展上 ${pad.top} · 右 ${pad.right} · 下 ${pad.bottom} · 左 ${pad.left} px → ${outW} × ${outH}`
      }
      footerActions={
        <>
          <ComposerModelMenu
            models={outpaintModels}
            selectedId={modelId}
            onSelect={(id) => {
              rememberImageModelId(id);
              setModelId(id);
            }}
            emptyLabel="暂无支持扩图的模型"
            align="end"
            contentClassName="joy-studio-popover"
            contentProps={{ "data-canvas-shortcuts-ignore": true }}
          >
            <button
              type="button"
              className="joy-studio-shell__chip gap-2"
              disabled={!outpaintModels.length}
            >
              {selectedModel ? (
                <BrandAvatar
                  src={modelIconSrc(selectedModel)}
                  label={selectedModel.name}
                  size={16}
                  rounded="md"
                />
              ) : null}
              <span className="max-w-[160px] truncate">
                {selectedModel?.name ?? "选择模型"}
              </span>
              <ChevronDown className="size-3.5 opacity-60" />
            </button>
          </ComposerModelMenu>

          {showParams ? (
            <DropdownMenu open={paramsOpen} onOpenChange={setParamsOpen}>
              <DropdownMenuTrigger asChild>
                <button type="button" className="joy-studio-shell__chip gap-1.5">
                  {layout.showRatio ? (
                    <span className="inline-flex items-center gap-1">
                      <RectangleHorizontal className="size-3.5 opacity-70" />
                      {ratioLabel || "比例"}
                    </span>
                  ) : null}
                  {layout.showRatio && layout.showResolution ? (
                    <span className="opacity-35">·</span>
                  ) : null}
                  {layout.showResolution ? (
                    <span>{resolutionLabel || "分辨率"}</span>
                  ) : null}
                  <ChevronDown className="size-3.5 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="joy-composer-params-menu joy-studio-popover p-0 w-[min(300px,calc(100vw-48px))]"
                data-canvas-shortcuts-ignore
              >
                <div className="joy-composer-params-panel">
                  {layout.showRatio ? (
                    <div className="joy-composer-params-row">
                      <span className="joy-composer-params-label">比例</span>
                      <div className="joy-composer-params-options is-aspect">
                        {layout.aspects.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className={cn(
                              "joy-composer-params-option is-aspect",
                              genRatio === item.id && "is-on",
                            )}
                            onClick={() => setGenRatio(item.id)}
                          >
                            <AspectRatioGlyph ratio={item.id} />
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {layout.showResolution ? (
                    <div className="joy-composer-params-row">
                      <span className="joy-composer-params-label">分辨率</span>
                      <div className="joy-composer-params-options">
                        {layout.resolutions.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className={cn(
                              "joy-composer-params-option",
                              resolution === item.id && "is-on",
                            )}
                            onClick={() => setResolution(item.id)}
                          >
                            {formatQualityLabel(item, "image")}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

          <button
            type="button"
            className="joy-studio-shell__primary"
            disabled={busy || !meta || !modelId}
            onClick={() => void submit()}
          >
            {busy ? "提交中…" : "确认扩图"}
          </button>
        </>
      }
    />
  );
}
