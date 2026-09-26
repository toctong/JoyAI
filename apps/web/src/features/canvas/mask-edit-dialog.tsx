"use client";

/**
 * Erase / inpaint — native img + mask overlay (CORS-safe export).
 * UX aligned with studio erase: brush/rect, edge expand, paste-back, model pick.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ChevronDown, Eye, EyeOff, Lightbulb, RectangleHorizontal, Square, Wand2 } from "lucide-react";
import type { ModelCapabilities } from "@joyai/shared";
import { BrandAvatar } from "@/components/admin/brand-avatar";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
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
import {
  CanvasIconBrush,
  CanvasIconEraser,
  CanvasIconRedo,
  CanvasIconTrash,
  CanvasIconUndo,
} from "./icons/canvas-icons";
import { filterInpaintModels, pickDefaultModelId, rememberImageModelId } from "./lib/inpaint-models";
import {
  buildMarkedImageBlob,
  canvasHasPaint,
  dilateMask,
  maskCoveragePercent,
} from "./lib/mark-image";
import { CanvasStudioShell } from "./studio/canvas-studio-shell";
import { StudioSidePanels } from "./studio/studio-side-panels";
import { StudioImageStage } from "./studio/studio-image-stage";

type PublicModel = {
  id: string;
  name: string;
  kind: string;
  remoteId?: string;
  capabilities?: ModelCapabilities | null;
  channel?: { platform?: string; name?: string };
};

export type MaskConfirmPayload = {
  prompt: string;
  blob: Blob;
  modelId: string;
  resolution?: string;
  ratio?: string;
};

type Props = {
  url: string;
  open: boolean;
  nodeTitle?: string;
  onClose: () => void;
  onConfirm: (payload: MaskConfirmPayload) => Promise<void>;
};

type DrawTool = "brush" | "rect" | "eraser";

const MASK_COLORS = [
  { id: "purple", fill: "rgba(168, 85, 247, 0.55)", hex: "#a855f7" },
  { id: "pink", fill: "rgba(236, 72, 153, 0.55)", hex: "#ec4899" },
  { id: "green", fill: "rgba(34, 197, 94, 0.55)", hex: "#22c55e" },
  { id: "blue", fill: "rgba(59, 130, 246, 0.55)", hex: "#3b82f6" },
  { id: "orange", fill: "rgba(249, 115, 22, 0.55)", hex: "#f97316" },
] as const;

const DEFAULT_ERASE_PROMPT =
  "擦除涂抹区域，自然补全背景，保持画面风格与光影一致";

export function MaskEditDialog({
  url,
  open,
  nodeTitle,
  onClose,
  onConfirm,
}: Props) {
  const maskRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<ImageData[]>([]);
  const redoRef = useRef<ImageData[]>([]);
  const drawing = useRef<{
    active: boolean;
    last: { x: number; y: number } | null;
    start: { x: number; y: number } | null;
    snapshot: ImageData | null;
  }>({ active: false, last: null, start: null, snapshot: null });

  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [prompt, setPrompt] = useState("");
  const [brush, setBrush] = useState(24);
  const [tool, setTool] = useState<DrawTool>("brush");
  const [colorId, setColorId] = useState<(typeof MASK_COLORS)[number]["id"]>(
    "purple",
  );
  const [maskOpacity, setMaskOpacity] = useState(55);
  const [showMask, setShowMask] = useState(true);
  const [edgeExpand, setEdgeExpand] = useState(15);
  const [pasteBack, setPasteBack] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [hasPaint, setHasPaint] = useState(false);
  const [coverage, setCoverage] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const [models, setModels] = useState<PublicModel[]>([]);
  const [modelId, setModelId] = useState("");
  const [resolution, setResolution] = useState("");
  const [ratio, setRatio] = useState("");
  const [paramsOpen, setParamsOpen] = useState(false);
  const [modelsError, setModelsError] = useState("");

  const maskColor = MASK_COLORS.find((c) => c.id === colorId) ?? MASK_COLORS[0];

  const inpaintModels = useMemo(() => filterInpaintModels(models), [models]);
  const selectedModel = inpaintModels.find((m) => m.id === modelId);
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
    layout.aspects.find((item) => item.id === ratio)?.label ?? ratio;
  const resolutionOption = layout.resolutions.find((r) => r.id === resolution);
  const resolutionLabel = resolutionOption
    ? formatQualityLabel(resolutionOption, "image")
    : resolution;

  const refreshPaintState = useCallback(() => {
    const mask = maskRef.current;
    if (!mask) {
      setHasPaint(false);
      setCoverage(0);
      return;
    }
    const painted = canvasHasPaint(mask);
    setHasPaint(painted);
    setCoverage(painted ? maskCoveragePercent(mask) : 0);
  }, []);

  const paintPreview = useCallback(() => {
    const mask = maskRef.current;
    const preview = previewRef.current;
    const context = preview?.getContext("2d");
    if (!mask || !preview || !context) return;
    context.clearRect(0, 0, preview.width, preview.height);
    if (!showMask) return;
    const alpha = Math.max(0.08, Math.min(1, maskOpacity / 100));
    const fill = maskColor.fill.replace(
      /[\d.]+\)$/,
      `${alpha.toFixed(2)})`,
    );
    context.fillStyle = fill;
    context.fillRect(0, 0, preview.width, preview.height);
    context.globalCompositeOperation = "destination-in";
    context.drawImage(mask, 0, 0);
    context.globalCompositeOperation = "source-over";
  }, [maskColor.fill, maskOpacity, showMask]);

  useEffect(() => {
    paintPreview();
  }, [paintPreview, size]);

  useEffect(() => {
    if (!open) return;
    setPrompt("");
    setBrush(24);
    setTool("brush");
    setColorId("purple");
    setMaskOpacity(55);
    setShowMask(true);
    setEdgeExpand(15);
    setPasteBack(true);
    setError("");
    setBusy(false);
    setStep(1);
    setHasPaint(false);
    setCoverage(0);
    setSize(null);
    setCanUndo(false);
    setCanRedo(false);
    historyRef.current = [];
    redoRef.current = [];
    setModelsError("");
  }, [open, url]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void api<PublicModel[]>("/models")
      .then((list) => {
        if (!alive) return;
        setModels(list.filter((m) => m.kind === "image"));
      })
      .catch(() => {
        if (alive) setModelsError("加载模型失败");
      });
    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    if (!inpaintModels.length) {
      setModelId("");
      return;
    }
    setModelId((prev) => pickDefaultModelId(inpaintModels, prev));
  }, [inpaintModels]);

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
      setRatio("");
      return;
    }
    setRatio((prev) => {
      if (layout.aspects.some((a) => a.id === prev)) return prev;
      const auto = layout.aspects.find(
        (a) => a.id === "auto" || a.flexible,
      );
      return auto?.id ?? layout.aspects[0]!.id;
    });
  }, [layout]);

  useEffect(() => {
    clearCanvas(maskRef.current);
    clearCanvas(previewRef.current);
    historyRef.current = [];
    redoRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
    setHasPaint(false);
    setCoverage(0);
  }, [size]);

  function pushHistory() {
    const mask = maskRef.current;
    const ctx = mask?.getContext("2d");
    if (!mask || !ctx) return;
    historyRef.current.push(ctx.getImageData(0, 0, mask.width, mask.height));
    if (historyRef.current.length > 40) historyRef.current.shift();
    redoRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }

  function undo() {
    const mask = maskRef.current;
    const ctx = mask?.getContext("2d");
    if (!mask || !ctx) return;
    const prev = historyRef.current.pop();
    if (!prev) return;
    redoRef.current.push(ctx.getImageData(0, 0, mask.width, mask.height));
    ctx.putImageData(prev, 0, 0);
    setCanUndo(historyRef.current.length > 0);
    setCanRedo(true);
    paintPreview();
    refreshPaintState();
  }

  function redo() {
    const mask = maskRef.current;
    const ctx = mask?.getContext("2d");
    if (!mask || !ctx) return;
    const next = redoRef.current.pop();
    if (!next) return;
    historyRef.current.push(ctx.getImageData(0, 0, mask.width, mask.height));
    ctx.putImageData(next, 0, 0);
    setCanUndo(true);
    setCanRedo(redoRef.current.length > 0);
    paintPreview();
    refreshPaintState();
  }

  function resetMask() {
    clearCanvas(maskRef.current);
    clearCanvas(previewRef.current);
    historyRef.current = [];
    redoRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
    setHasPaint(false);
    setCoverage(0);
    setError("");
    setStep(1);
  }

  function pointerToMask(event: ReactPointerEvent<HTMLCanvasElement>) {
    const mask = maskRef.current;
    if (!mask) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * mask.width,
      y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * mask.height,
    };
  }

  function strokeBrush(
    ctx: CanvasRenderingContext2D,
    from: { x: number; y: number } | null,
    to: { x: number; y: number },
    erase: boolean,
  ) {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = brush;
    ctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
    ctx.strokeStyle = "#000";
    ctx.fillStyle = "#000";
    if (!from || (from.x === to.x && from.y === to.y)) {
      ctx.beginPath();
      ctx.arc(to.x, to.y, brush / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
  }

  function drawRect(
    ctx: CanvasRenderingContext2D,
    a: { x: number; y: number },
    b: { x: number; y: number },
  ) {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#000";
    ctx.fillRect(x, y, w, h);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    event.preventDefault();
    event.stopPropagation();
    const mask = maskRef.current;
    const ctx = mask?.getContext("2d");
    const point = pointerToMask(event);
    if (!mask || !ctx || !point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pushHistory();
    drawing.current = {
      active: true,
      last: point,
      start: point,
      snapshot: ctx.getImageData(0, 0, mask.width, mask.height),
    };
    if (tool === "brush" || tool === "eraser") {
      strokeBrush(ctx, null, point, tool === "eraser");
      paintPreview();
      refreshPaintState();
      setError("");
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current.active) return;
    event.preventDefault();
    const mask = maskRef.current;
    const ctx = mask?.getContext("2d");
    const point = pointerToMask(event);
    if (!mask || !ctx || !point) return;

    if (tool === "rect" && drawing.current.snapshot && drawing.current.start) {
      ctx.putImageData(drawing.current.snapshot, 0, 0);
      drawRect(ctx, drawing.current.start, point);
      paintPreview();
      return;
    }

    if (tool === "brush" || tool === "eraser") {
      strokeBrush(ctx, drawing.current.last, point, tool === "eraser");
      drawing.current.last = point;
      paintPreview();
      refreshPaintState();
    }
  }

  function onPointerUp() {
    if (!drawing.current.active) return;
    drawing.current = {
      active: false,
      last: null,
      start: null,
      snapshot: null,
    };
    refreshPaintState();
  }

  const submit = useCallback(async () => {
    if (!modelId) {
      setError(modelsError || "请选择支持图生图的模型");
      return;
    }
    const mask = maskRef.current;
    if (!mask || !canvasHasPaint(mask)) {
      setError("请先涂抹要擦除的区域");
      setStep(1);
      return;
    }
    setBusy(true);
    setError("");
    setStep(2);
    try {
      const expanded = dilateMask(mask, edgeExpand);
      const blob = await buildMarkedImageBlob(url, expanded, {
        maskFill: maskColor.fill,
      });
      const base = prompt.trim() || DEFAULT_ERASE_PROMPT;
      const text = pasteBack
        ? `${base}。仅重绘涂抹选区及其紧邻边缘，其余像素保持原图不变。`
        : base;
      await onConfirm({
        prompt: text,
        blob,
        modelId,
        resolution: layout.showResolution ? resolution || undefined : undefined,
        ratio: layout.showRatio ? ratio || undefined : undefined,
      });
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "生成标记图失败");
    }
  }, [
    edgeExpand,
    layout.showRatio,
    layout.showResolution,
    maskColor.fill,
    modelId,
    modelsError,
    onConfirm,
    pasteBack,
    prompt,
    ratio,
    resolution,
    url,
  ]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "TEXTAREA" ||
          target.tagName === "INPUT" ||
          target.isContentEditable)
      ) {
        return;
      }
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }
      if (
        (meta && event.key.toLowerCase() === "z" && event.shiftKey) ||
        (meta && event.key.toLowerCase() === "y")
      ) {
        event.preventDefault();
        redo();
        return;
      }
      if (meta && event.key === "Enter") {
        event.preventDefault();
        void submit();
        return;
      }
      switch (event.key.toLowerCase()) {
        case "b":
          setTool("brush");
          break;
        case "r":
          setTool("rect");
          break;
        case "e":
          setTool("eraser");
          break;
        case "h":
          setShowMask((v) => !v);
          break;
        case "[":
          setBrush((v) => Math.max(8, v - 4));
          break;
        case "]":
          setBrush((v) => Math.min(160, v + 4));
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, submit]);

  if (!open) return null;

  const coverageLabel = hasPaint
    ? pasteBack
      ? `整图处理（选区外回贴），选区约占画面 ${coverage.toFixed(1)}%`
      : `整图重绘，选区约占画面 ${coverage.toFixed(1)}%`
    : "尚未涂抹选区";

  return (
    <CanvasStudioShell
      open={open}
      title="擦除"
      subtitle={nodeTitle}
      sourceUrl={url}
      onClose={() => {
        if (!busy) onClose();
      }}
      stageTools={
        <>
          <button
            type="button"
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-md",
              tool === "brush" && "bg-[hsl(199_90%_48%/0.35)]",
            )}
            title="画笔 (B)"
            onClick={() => setTool("brush")}
          >
            <CanvasIconBrush className="size-4 opacity-80" />
          </button>
          <button
            type="button"
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-md",
              tool === "rect" && "bg-[hsl(199_90%_48%/0.35)]",
            )}
            title="矩形 (R)"
            onClick={() => setTool("rect")}
          >
            <Square className="size-4 opacity-80" />
          </button>
          <button
            type="button"
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-md",
              tool === "eraser" && "bg-[hsl(199_90%_48%/0.35)]",
            )}
            title="橡皮 (E)"
            onClick={() => setTool("eraser")}
          >
            <CanvasIconEraser className="size-4 opacity-80" />
          </button>
          <span className="mx-1 h-4 w-px bg-white/15" />
          {MASK_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={cn(
                "size-5 rounded-full border-2",
                colorId === c.id
                  ? "border-white"
                  : "border-transparent opacity-70",
              )}
              style={{ background: c.hex }}
              title="选区颜色"
              onClick={() => setColorId(c.id)}
            />
          ))}
          <span className="mx-1 h-4 w-px bg-white/15" />
          <div className="flex shrink-0 items-center gap-2">
            <span className="shrink-0 whitespace-nowrap text-xs text-white/50">
              大小
            </span>
            <Slider
              tone="onDark"
              orientation="horizontal"
              min={8}
              max={160}
              step={2}
              value={[brush]}
              onValueChange={([value]) => setBrush(value ?? 24)}
              className="w-[96px] shrink-0"
            />
            <span className="w-7 shrink-0 text-right text-xs tabular-nums text-white/70">
              {brush}
            </span>
          </div>
          <span className="mx-1 h-4 w-px bg-white/15" />
          <button
            type="button"
            className="inline-flex size-8 items-center justify-center rounded-md disabled:opacity-30"
            title="撤销"
            disabled={!canUndo}
            onClick={undo}
          >
            <CanvasIconUndo className="size-4 opacity-70" />
          </button>
          <button
            type="button"
            className="inline-flex size-8 items-center justify-center rounded-md disabled:opacity-30"
            title="重做"
            disabled={!canRedo}
            onClick={redo}
          >
            <CanvasIconRedo className="size-4 opacity-70" />
          </button>
          <button
            type="button"
            className="inline-flex size-8 items-center justify-center rounded-md"
            title="清空选区"
            onClick={resetMask}
          >
            <CanvasIconTrash className="size-4 opacity-70" />
          </button>
          <button
            type="button"
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-md",
              !showMask && "bg-white/10",
            )}
            title="显示/隐藏选区 (H)"
            onClick={() => setShowMask((v) => !v)}
          >
            {showMask ? (
              <Eye className="size-4 opacity-70" />
            ) : (
              <EyeOff className="size-4 opacity-70" />
            )}
          </button>
        </>
      }
      stageHint="涂抹要擦除的物体 · 高亮区域为选区"
      center={
        <StudioImageStage
          url={url}
          onReady={(next) => setSize(next)}
          overlay={(stageSize) => (
            <>
              <canvas
                ref={maskRef}
                width={stageSize.width}
                height={stageSize.height}
                className="hidden"
              />
              <canvas
                ref={previewRef}
                width={stageSize.width}
                height={stageSize.height}
                className={cn(
                  "absolute inset-0 h-full w-full touch-none",
                  tool === "rect" ? "cursor-crosshair" : "cursor-crosshair",
                )}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
            </>
          )}
        />
      }
      sideTitle="擦除设置"
      sideMeta={coverageLabel}
      sideHeadAction={
        <button
          type="button"
          className="text-xs text-white/55 hover:text-white/85"
          onClick={resetMask}
        >
          重置
        </button>
      }
      side={
        <>
          <div className="flex flex-wrap gap-2 text-sm">
            <span
              className={cn(
                "rounded-full px-3 py-1",
                hasPaint
                  ? "bg-[hsl(199_90%_48%/0.35)] text-white"
                  : "bg-white/5 text-white/45",
              )}
            >
              1. 涂抹物体
            </span>
            <span
              className={cn(
                "rounded-full px-3 py-1",
                hasPaint && modelId
                  ? "bg-[hsl(199_90%_48%/0.35)] text-white"
                  : "bg-white/5 text-white/45",
              )}
            >
              2. 开始擦除
            </span>
          </div>

          <StudioSidePanels
            defaultOpen={["settings"]}
            items={[
              {
                id: "settings",
                title: "擦除参数",
                icon: <Wand2 />,
                badge: pasteBack ? "局部重绘" : "整图重绘",
                onClear:
                  edgeExpand !== 15 || !pasteBack || prompt.trim()
                    ? () => {
                        setEdgeExpand(15);
                        setPasteBack(true);
                        setPrompt("");
                      }
                    : undefined,
                content: (
                  <>
                    <label className="joy-studio-shell__field">
                      <span className="joy-studio-shell__field-label">
                        <span>边缘扩展</span>
                        <span className="tabular-nums text-white/45">
                          {edgeExpand}px
                        </span>
                      </span>
                      <Slider
                        tone="onDark"
                        min={0}
                        max={48}
                        step={1}
                        value={[edgeExpand]}
                        onValueChange={([v]) => setEdgeExpand(v ?? 0)}
                      />
                      <span className="text-xs text-white/40">
                        自动外扩选区以覆盖物体边缘与阴影，减少残影
                      </span>
                    </label>
                    <div className="joy-studio-shell__field">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm text-white/85">
                            局部重绘与回贴
                          </p>
                          <p className="mt-1 text-xs text-white/40">
                            仅重绘选区及紧邻区域，其它像素保持原图
                          </p>
                        </div>
                        <Switch
                          checked={pasteBack}
                          onCheckedChange={setPasteBack}
                        />
                      </div>
                    </div>
                    <label className="joy-studio-shell__field">
                      <span className="joy-studio-shell__field-label">
                        <span>补充说明（可选）</span>
                      </span>
                      <textarea
                        value={prompt}
                        rows={3}
                        placeholder="例如：擦除人物，自然补全背景"
                        className="joy-studio-shell__textarea"
                        onChange={(event) => {
                          setPrompt(event.target.value);
                          setError("");
                          if (event.target.value.trim()) setStep(2);
                        }}
                      />
                    </label>
                    {error ? (
                      <p className="text-xs text-red-400">{error}</p>
                    ) : null}
                  </>
                ),
              },
              {
                id: "display",
                title: "选区显示",
                icon: <Eye />,
                content: (
                  <>
                    <div className="joy-studio-shell__field">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm text-white/85">显示选区高亮</p>
                        <Switch
                          checked={showMask}
                          onCheckedChange={setShowMask}
                        />
                      </div>
                      <span className="joy-studio-shell__field-label mt-3">
                        <span>透明度</span>
                        <span className="tabular-nums text-white/45">
                          {maskOpacity}%
                        </span>
                      </span>
                      <Slider
                        tone="onDark"
                        min={15}
                        max={90}
                        step={1}
                        value={[maskOpacity]}
                        onValueChange={([v]) => setMaskOpacity(v ?? 55)}
                        disabled={!showMask}
                      />
                      <span className="text-xs text-white/40">
                        仅影响预览，不改变结果
                      </span>
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
                    <li>尽量涂满物体边缘与阴影，减少残影</li>
                    <li>小物体可用矩形框选，再微调橡皮</li>
                    <li>边缘扩展可略加大，覆盖半透明边缘</li>
                    <li>说明写清要保留的背景材质与光影</li>
                  </ul>
                ),
              },
            ]}
          />
        </>
      }
      sideFoot="B 画笔 · R 矩形 · E 橡皮 · [ ] 大小 · H 显隐 · ⌘Z 撤销 · ⌘↵ 开始擦除"
      footerHint={
        inpaintModels.length
          ? "用画笔或矩形涂出要移除的物体，尽量盖住边缘与阴影"
          : modelsError || "暂无可用图像模型"
      }
      footerActions={
        <>
          <ComposerModelMenu
            models={inpaintModels}
            selectedId={modelId}
            onSelect={(id) => {
              rememberImageModelId(id);
              setModelId(id);
            }}
            emptyLabel="暂无支持擦除的模型"
            align="end"
            contentClassName="joy-studio-popover"
            contentProps={{ "data-canvas-shortcuts-ignore": true }}
          >
            <button
              type="button"
              className="joy-studio-shell__chip gap-2"
              disabled={!inpaintModels.length}
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
                              ratio === item.id && "is-on",
                            )}
                            onClick={() => setRatio(item.id)}
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
            disabled={busy || !modelId}
            onClick={() => void submit()}
          >
            {busy ? "处理中…" : "开始擦除"}
          </button>
        </>
      }
    />
  );
}

function clearCanvas(canvas: HTMLCanvasElement | null) {
  const context = canvas?.getContext("2d");
  if (!canvas || !context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
}
