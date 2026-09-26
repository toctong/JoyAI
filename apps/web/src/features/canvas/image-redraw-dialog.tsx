"use client";

/**
 * Redraw / inpaint — paint a region, describe the change, optional style refs.
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
  Eye,
  EyeOff,
  ImagePlus,
  LayoutGrid,
  Lightbulb,
  MessageSquareText,
  RectangleHorizontal,
  Square,
  Upload,
  X,
} from "lucide-react";
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
import { CanvasNodeRefDialog } from "./canvas-node-ref-dialog";
import { filterInpaintModels, pickDefaultModelId, rememberImageModelId } from "./lib/inpaint-models";
import {
  buildMarkedImageBlob,
  canvasHasPaint,
  dilateMask,
} from "./lib/mark-image";
import { useCanvasStore } from "./store";
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

export type RedrawConfirmPayload = {
  prompt: string;
  blob: Blob;
  modelId: string;
  resolution?: string;
  ratio?: string;
  /** Extra canvas image node ids to wire as style refs. */
  referenceNodeIds: string[];
  /** Local files to upload as style refs. */
  referenceFiles: File[];
};

type Props = {
  url: string;
  open: boolean;
  sourceNodeId?: string;
  nodeTitle?: string;
  onClose: () => void;
  onConfirm: (payload: RedrawConfirmPayload) => Promise<void>;
};

type DrawTool = "brush" | "rect" | "eraser";

const MASK_COLORS = [
  { id: "purple", fill: "rgba(168, 85, 247, 0.55)", hex: "#a855f7" },
  { id: "pink", fill: "rgba(236, 72, 153, 0.55)", hex: "#ec4899" },
  { id: "green", fill: "rgba(34, 197, 94, 0.55)", hex: "#22c55e" },
  { id: "blue", fill: "rgba(59, 130, 246, 0.55)", hex: "#3b82f6" },
  { id: "orange", fill: "rgba(249, 115, 22, 0.55)", hex: "#f97316" },
] as const;

const PROMPT_MAX = 500;

const PRESETS: { id: string; label: string; hint: string; prompt: string }[] = [
  {
    id: "remove",
    label: "移除物体",
    hint: "擦除选区并自然补全",
    prompt: "移除选区内的物体，自然补全背景，保持周围光影与材质一致",
  },
  {
    id: "replace",
    label: "替换为…",
    hint: "把选区换成别的",
    prompt: "将选区替换为『』，与周围环境协调",
  },
  {
    id: "recolor",
    label: "换颜色",
    hint: "改色保留纹理",
    prompt: "将选区改为『』色，保留原有材质与纹理细节",
  },
  {
    id: "material",
    label: "换材质",
    hint: "木/金属/玻璃等",
    prompt: "将选区材质改为『』，保持形体与光影合理",
  },
  {
    id: "fix",
    label: "修复瑕疵",
    hint: "去划痕噪点",
    prompt: "修复选区内的瑕疵、划痕或噪点，尽量保持原貌",
  },
  {
    id: "add",
    label: "添加物体",
    hint: "在选区放入新元素",
    prompt: "在选区内添加『』，与画面风格、透视一致",
  },
  {
    id: "bg",
    label: "换背景",
    hint: "把背景当选区",
    prompt: "将选区背景替换为『』，主体边缘干净自然",
  },
];

const DEFAULT_PROMPT =
  "根据涂抹区域进行局部重绘，与周围环境协调，保持画面风格一致";

export function ImageRedrawDialog({
  url,
  open,
  sourceNodeId = "",
  nodeTitle,
  onClose,
  onConfirm,
}: Props) {
  const maskRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<ImageData[]>([]);
  const redoRef = useRef<ImageData[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
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
  const [edgeExpand, setEdgeExpand] = useState(12);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [hasPaint, setHasPaint] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const [models, setModels] = useState<PublicModel[]>([]);
  const [modelId, setModelId] = useState("");
  const [resolution, setResolution] = useState("");
  const [ratio, setRatio] = useState("");
  const [paramsOpen, setParamsOpen] = useState(false);
  const [modelsError, setModelsError] = useState("");

  const [refFiles, setRefFiles] = useState<
    { id: string; file: File; preview: string }[]
  >([]);
  const [refNodeIds, setRefNodeIds] = useState<string[]>([]);
  const [pickCanvas, setPickCanvas] = useState(false);

  const nodes = useCanvasStore((s) => s.nodes);
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

  const refNodeThumbs = useMemo(
    () =>
      refNodeIds
        .map((id) => {
          const node = nodes.find((n) => n.id === id);
          const src = String(node?.data.url ?? "");
          if (!node || !src) return null;
          return { id, url: src };
        })
        .filter(Boolean) as { id: string; url: string }[],
    [nodes, refNodeIds],
  );

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
    setEdgeExpand(12);
    setError("");
    setBusy(false);
    setStep(1);
    setHasPaint(false);
    setSize(null);
    setCanUndo(false);
    setCanRedo(false);
    historyRef.current = [];
    redoRef.current = [];
    setModelsError("");
    setRefFiles((prev) => {
      prev.forEach((item) => URL.revokeObjectURL(item.preview));
      return [];
    });
    setRefNodeIds([]);
    setPickCanvas(false);
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
  }, [size]);

  function refreshPaint() {
    const mask = maskRef.current;
    if (!mask) {
      setHasPaint(false);
      return;
    }
    setHasPaint(canvasHasPaint(mask));
  }

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
    refreshPaint();
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
    refreshPaint();
  }

  function resetAll() {
    clearCanvas(maskRef.current);
    clearCanvas(previewRef.current);
    historyRef.current = [];
    redoRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
    setHasPaint(false);
    setPrompt("");
    setError("");
    setStep(1);
    clearRefs();
  }

  function clearRefs() {
    setRefFiles((prev) => {
      prev.forEach((item) => URL.revokeObjectURL(item.preview));
      return [];
    });
    setRefNodeIds([]);
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
      refreshPaint();
      setError("");
      setStep(1);
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
      refreshPaint();
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
    refreshPaint();
  }

  function applyPreset(text: string) {
    setPrompt(text.slice(0, PROMPT_MAX));
    setStep(2);
    setError("");
  }

  const submit = useCallback(async () => {
    if (!modelId) {
      setError(modelsError || "请选择支持图生图的模型");
      return;
    }
    const mask = maskRef.current;
    if (!mask || !canvasHasPaint(mask)) {
      setError("请先涂抹或框选要重绘的区域");
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
      const text = prompt.trim() || DEFAULT_PROMPT;
      await onConfirm({
        prompt: text,
        blob,
        modelId,
        resolution: layout.showResolution ? resolution || undefined : undefined,
        ratio: layout.showRatio ? ratio || undefined : undefined,
        referenceNodeIds: refNodeIds,
        referenceFiles: refFiles.map((item) => item.file),
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
    prompt,
    ratio,
    refFiles,
    refNodeIds,
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

  return (
    <>
      <CanvasStudioShell
        open={open}
        title="重绘"
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
              onClick={resetAll}
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
        stageHint="在图上涂抹或框选要重绘的区域"
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
                  className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                />
              </>
            )}
          />
        }
        sideTitle="重绘设置"
        sideMeta={
          hasPaint ? "已涂抹选区，继续描述变化" : "先涂抹或框选区域"
        }
        sideHeadAction={
          <button
            type="button"
            className="text-xs text-white/55 hover:text-white/85"
            onClick={resetAll}
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
                1. 涂抹区域
              </span>
              <span
                className={cn(
                  "rounded-full px-3 py-1",
                  prompt.trim()
                    ? "bg-[hsl(199_90%_48%/0.35)] text-white"
                    : "bg-white/5 text-white/45",
                )}
              >
                2. 描述变化
              </span>
            </div>

            <StudioSidePanels
              defaultOpen={["prompt", "presets", "refs"]}
              items={[
                {
                  id: "prompt",
                  title: "描述变化",
                  icon: <MessageSquareText />,
                  badge: prompt.trim() ? "已填写" : undefined,
                  onClear: prompt.trim()
                    ? () => {
                        setPrompt("");
                        setError("");
                      }
                    : undefined,
                  content: (
                    <>
                      <p className="text-xs text-white/45">
                        把选区变成什么？留空则智能填充、与周围环境协调。
                      </p>
                      <label className="joy-studio-shell__field">
                        <textarea
                          value={prompt}
                          rows={4}
                          maxLength={PROMPT_MAX}
                          placeholder="例如：换成一件深蓝色针织毛衣"
                          className="joy-studio-shell__textarea"
                          onChange={(event) => {
                            setPrompt(event.target.value.slice(0, PROMPT_MAX));
                            setError("");
                            setStep(2);
                          }}
                        />
                        <span className="joy-studio-shell__field-label">
                          <span />
                          <span className="tabular-nums text-white/35">
                            {prompt.length}/{PROMPT_MAX}
                          </span>
                        </span>
                      </label>
                      {error ? (
                        <p className="text-xs text-red-400">{error}</p>
                      ) : null}
                    </>
                  ),
                },
                {
                  id: "presets",
                  title: "常用改法",
                  icon: <Lightbulb />,
                  content: (
                    <>
                      <p className="text-xs text-white/45">
                        点击填入描述框，『 』处替换成你想要的内容即可。
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {PRESETS.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-left hover:bg-white/[0.06]"
                            onClick={() => applyPreset(item.prompt)}
                          >
                            <span className="block text-sm text-white/85">
                              {item.label}
                            </span>
                            <span className="mt-0.5 block text-[11px] text-white/40">
                              {item.hint}
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  ),
                },
                {
                  id: "refs",
                  title: "参考图",
                  icon: <ImagePlus />,
                  badge:
                    refFiles.length + refNodeThumbs.length > 0
                      ? `${refFiles.length + refNodeThumbs.length}`
                      : undefined,
                  onClear:
                    refFiles.length + refNodeThumbs.length > 0
                      ? clearRefs
                      : undefined,
                  content: (
                    <>
                      <p className="text-xs text-white/45">
                        让 AI 参照颜色、款式或材质；左侧连线到底图的图片也会作为参考。
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-dashed border-white/20 text-xs text-white/70 hover:border-white/35 hover:text-white"
                          onClick={() => fileRef.current?.click()}
                        >
                          <Upload className="size-3.5 opacity-80" />
                          上传参考图
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-dashed border-white/20 text-xs text-white/70 hover:border-white/35 hover:text-white"
                          disabled={!sourceNodeId}
                          onClick={() => setPickCanvas(true)}
                        >
                          <LayoutGrid className="size-3.5 opacity-80" />
                          从画布选图
                        </button>
                      </div>
                      {(refFiles.length > 0 || refNodeThumbs.length > 0) && (
                        <div className="flex flex-wrap gap-2">
                          {refFiles.map((item) => (
                            <div
                              key={item.id}
                              className="relative size-14 overflow-hidden rounded-md border border-white/15"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={item.preview}
                                alt=""
                                className="size-full object-cover"
                              />
                              <button
                                type="button"
                                className="absolute right-0.5 top-0.5 rounded bg-black/70 p-0.5"
                                onClick={() => {
                                  URL.revokeObjectURL(item.preview);
                                  setRefFiles((prev) =>
                                    prev.filter((f) => f.id !== item.id),
                                  );
                                }}
                              >
                                <X className="size-3 text-white" />
                              </button>
                            </div>
                          ))}
                          {refNodeThumbs.map((item) => (
                            <div
                              key={item.id}
                              className="relative size-14 overflow-hidden rounded-md border border-white/15"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={item.url}
                                alt=""
                                className="size-full object-cover"
                              />
                              <button
                                type="button"
                                className="absolute right-0.5 top-0.5 rounded bg-black/70 p-0.5"
                                onClick={() =>
                                  setRefNodeIds((prev) =>
                                    prev.filter((id) => id !== item.id),
                                  )
                                }
                              >
                                <X className="size-3 text-white" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(event) => {
                          const files = Array.from(event.target.files ?? []);
                          event.target.value = "";
                          if (!files.length) return;
                          setRefFiles((prev) => [
                            ...prev,
                            ...files.map((file) => ({
                              id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`,
                              file,
                              preview: URL.createObjectURL(file),
                            })),
                          ]);
                        }}
                      />
                    </>
                  ),
                },
                {
                  id: "display",
                  title: "选区显示",
                  icon: <Eye />,
                  content: (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm text-white/85">显示选区高亮</p>
                        <Switch
                          checked={showMask}
                          onCheckedChange={setShowMask}
                        />
                      </div>
                      <span className="joy-studio-shell__field-label">
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
                      <p className="text-xs text-white/40">
                        高亮颜色与透明度只影响显示，不影响生成结果。
                      </p>
                    </>
                  ),
                },
              ]}
            />
          </>
        }
        sideFoot="B 画笔 · R 矩形 · E 橡皮 · [ ] 大小 · H 显隐 · ⌘Z 撤销 · ⌘↵ 重绘"
        footerHint="先在图上涂抹或框选要重绘的区域，再描述想要的变化"
        footerActions={
          <>
            <ComposerModelMenu
              models={inpaintModels}
              selectedId={modelId}
              onSelect={(id) => {
                rememberImageModelId(id);
                setModelId(id);
              }}
              emptyLabel="暂无支持重绘的模型"
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
              {busy ? "处理中…" : "重绘"}
            </button>
          </>
        }
      />

      {sourceNodeId ? (
        <CanvasNodeRefDialog
          open={pickCanvas}
          hostId={sourceNodeId}
          hostLabel="重绘"
          onClose={() => setPickCanvas(false)}
          onConfirm={(ids) => {
            setRefNodeIds((prev) => [
              ...new Set([
                ...prev,
                ...ids.filter((id) => id !== sourceNodeId),
              ]),
            ]);
            setPickCanvas(false);
          }}
        />
      ) : null}
    </>
  );
}

function clearCanvas(canvas: HTMLCanvasElement | null) {
  const context = canvas?.getContext("2d");
  if (!canvas || !context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
}
