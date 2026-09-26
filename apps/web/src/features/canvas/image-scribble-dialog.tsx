"use client";

/**
 * Scribble annotate — img under + draw canvas over (same pattern as erase).
 * Export composites via loadCanvasImage proxy to avoid CORS taint.
 */

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ArrowUpRight,
  Eraser,
  Lightbulb,
  MessageSquareText,
  MousePointer2,
  Pencil,
  Square,
  Type,
  Undo2,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/shared/lib/utils";
import { toast } from "@/shared/lib/toast";
import { loadCanvasImage } from "./lib/load-canvas-image";
import { CanvasStudioShell } from "./studio/canvas-studio-shell";
import { StudioSidePanels } from "./studio/studio-side-panels";
import { StudioImageStage } from "./studio/studio-image-stage";

type Props = {
  open: boolean;
  url: string;
  nodeTitle?: string;
  onClose: () => void;
  onConfirm: (payload: { prompt: string; blob: Blob }) => Promise<void>;
};

type Tool = "select" | "brush" | "rect" | "arrow" | "text" | "eraser";

type TextEdit = {
  x: number;
  y: number;
  value: string;
};

const COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#ffffff",
];

export function ImageScribbleDialog({
  open,
  url,
  nodeTitle,
  onClose,
  onConfirm,
}: Props) {
  const drawRef = useRef<HTMLCanvasElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const textEditRef = useRef<TextEdit | null>(null);
  const historyRef = useRef<ImageData[]>([]);
  const stroke = useRef<{
    active: boolean;
    start: { x: number; y: number } | null;
    last: { x: number; y: number } | null;
    snapshot: ImageData | null;
  }>({ active: false, start: null, last: null, snapshot: null });

  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [tool, setTool] = useState<Tool>("brush");
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(6);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [canUndo, setCanUndo] = useState(false);
  const [textEdit, setTextEdit] = useState<TextEdit | null>(null);
  textEditRef.current = textEdit;

  useEffect(() => {
    if (!open) return;
    setTool("brush");
    setColor(COLORS[0]);
    setWidth(6);
    setPrompt("");
    setBusy(false);
    setError("");
    setSize(null);
    setTextEdit(null);
    historyRef.current = [];
    setCanUndo(false);
  }, [open, url]);

  useEffect(() => {
    const canvas = drawRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !size) return;
    canvas.width = size.width;
    canvas.height = size.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    historyRef.current = [];
    setCanUndo(false);
    setTextEdit(null);
  }, [size]);

  useEffect(() => {
    if (!textEdit) return;
    const id = window.requestAnimationFrame(() => {
      textInputRef.current?.focus();
      textInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, [textEdit?.x, textEdit?.y]);

  function pushHistory() {
    const canvas = drawRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    historyRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (historyRef.current.length > 40) historyRef.current.shift();
    setCanUndo(historyRef.current.length > 0);
  }

  function undo() {
    if (textEdit) {
      setTextEdit(null);
      return;
    }
    const canvas = drawRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const prev = historyRef.current.pop();
    setCanUndo(historyRef.current.length > 0);
    if (!prev) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    ctx.putImageData(prev, 0, 0);
  }

  function fontPx() {
    return Math.max(16, width * 3);
  }

  function commitTextEdit() {
    const edit = textEditRef.current;
    if (!edit) return;
    const text = edit.value.trim();
    textEditRef.current = null;
    setTextEdit(null);
    if (!text) return;
    const canvas = drawRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    pushHistory();
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = color;
    ctx.font = `${fontPx()}px sans-serif`;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText(text, edit.x, edit.y);
    ctx.restore();
  }

  function cancelTextEdit() {
    textEditRef.current = null;
    setTextEdit(null);
  }

  function pointFromEvent(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = drawRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * canvas.width,
      y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * canvas.height,
    };
  }

  function onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (tool === "select") {
      if (textEditRef.current) {
        if (textEditRef.current.value.trim()) commitTextEdit();
        else cancelTextEdit();
      }
      return;
    }

    if (tool === "text") {
      event.preventDefault();
      if (textEditRef.current?.value.trim()) commitTextEdit();
      else if (textEditRef.current) cancelTextEdit();
      const point = pointFromEvent(event);
      const next = { x: point.x, y: point.y, value: "" };
      textEditRef.current = next;
      setTextEdit(next);
      return;
    }

    if (textEditRef.current) {
      if (textEditRef.current.value.trim()) commitTextEdit();
      else cancelTextEdit();
    }

    const canvas = drawRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pushHistory();
    const point = pointFromEvent(event);
    const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    stroke.current = {
      active: true,
      start: point,
      last: point,
      snapshot,
    };

    if (tool === "brush" || tool === "eraser") {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = width;
      ctx.globalCompositeOperation =
        tool === "eraser" ? "destination-out" : "source-over";
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(point.x, point.y, width / 2, 0, Math.PI * 2);
      if (tool === "brush") ctx.fill();
    }
  }

  function onTextKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitTextEdit();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancelTextEdit();
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!stroke.current.active || !stroke.current.start) return;
    const canvas = drawRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const point = pointFromEvent(event);

    if (tool === "brush" || tool === "eraser") {
      ctx.globalCompositeOperation =
        tool === "eraser" ? "destination-out" : "source-over";
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(stroke.current.last!.x, stroke.current.last!.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      stroke.current.last = point;
      return;
    }

    if (stroke.current.snapshot) {
      ctx.putImageData(stroke.current.snapshot, 0, 0);
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const s = stroke.current.start;
    if (tool === "rect") {
      ctx.strokeRect(s.x, s.y, point.x - s.x, point.y - s.y);
    } else if (tool === "arrow") {
      drawArrow(ctx, s.x, s.y, point.x, point.y, width);
    }
    stroke.current.last = point;
  }

  function onPointerUp() {
    stroke.current = {
      active: false,
      start: null,
      last: null,
      snapshot: null,
    };
  }

  async function submit() {
    const text = prompt.trim();
    if (!text) {
      setError("请描述要如何改图");
      return;
    }
    const canvas = drawRef.current;
    if (!canvas || !size) return;
    setBusy(true);
    setError("");
    try {
      const image = await loadCanvasImage(url);
      const out = document.createElement("canvas");
      out.width = size.width;
      out.height = size.height;
      const ctx = out.getContext("2d");
      if (!ctx) throw new Error("无法创建画布");
      ctx.drawImage(image, 0, 0, size.width, size.height);
      ctx.drawImage(canvas, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) => {
        out.toBlob(
          (next) => (next ? resolve(next) : reject(new Error("导出失败"))),
          "image/png",
        );
      });
      await onConfirm({
        prompt: `根据涂鸦标注修改参考图：${text}。保持未标注区域与原图一致。`,
        blob,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "提交失败");
      setBusy(false);
    }
  }

  if (!open || !url) return null;

  const tools: { id: Tool; icon: typeof Pencil; label: string }[] = [
    { id: "select", icon: MousePointer2, label: "选择" },
    { id: "brush", icon: Pencil, label: "画笔" },
    { id: "rect", icon: Square, label: "矩形" },
    { id: "arrow", icon: ArrowUpRight, label: "箭头" },
    { id: "text", icon: Type, label: "文字" },
    { id: "eraser", icon: Eraser, label: "橡皮" },
  ];

  return (
    <CanvasStudioShell
      open={open}
      title="涂鸦改图"
      subtitle={nodeTitle}
      sourceUrl={url}
      onClose={() => {
        if (!busy) onClose();
      }}
      stageTools={
        <>
          {tools.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                title={item.label}
                className={cn(
                  "inline-flex size-8 items-center justify-center rounded-md",
                  tool === item.id && "bg-[hsl(199_90%_48%/0.35)]",
                )}
                onClick={() => {
                  if (textEdit) commitTextEdit();
                  setTool(item.id);
                }}
              >
                <Icon className="size-4 opacity-80" />
              </button>
            );
          })}
          <span className="mx-1 h-4 w-px bg-white/15" />
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={cn(
                "size-5 rounded-full border border-white/20",
                color === c && "ring-2 ring-white/70",
              )}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
          <span className="mx-1 h-4 w-px bg-white/15" />
          <div className="flex shrink-0 items-center gap-2">
            <span className="shrink-0 whitespace-nowrap text-xs text-white/50">
              粗细
            </span>
            <Slider
              tone="onDark"
              orientation="horizontal"
              min={2}
              max={28}
              step={1}
              value={[width]}
              onValueChange={([v]) => setWidth(v ?? 6)}
              className="w-[80px] shrink-0"
            />
            <span className="w-5 shrink-0 text-right text-xs tabular-nums text-white/70">
              {width}
            </span>
          </div>
          <button
            type="button"
            className="inline-flex size-8 items-center justify-center rounded-md disabled:opacity-30"
            title="撤销"
            disabled={!canUndo}
            onClick={undo}
          >
            <Undo2 className="size-4 opacity-70" />
          </button>
        </>
      }
      stageHint="点选文字工具后在图上点击即可输入 · Enter 确认 · Esc 取消"
      center={
        <StudioImageStage
          url={url}
          onReady={setSize}
          overlay={(stageSize) => (
            <>
              <canvas
                ref={drawRef}
                width={stageSize.width}
                height={stageSize.height}
                className="absolute inset-0 h-full w-full touch-none"
                style={{
                  cursor:
                    tool === "select"
                      ? "default"
                      : tool === "text"
                        ? "text"
                        : "crosshair",
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
              {textEdit ? (
                <input
                  ref={textInputRef}
                  value={textEdit.value}
                  placeholder="输入标注…"
                  className="absolute z-10 max-w-[80%] min-w-[7rem] rounded-sm border border-white/35 bg-black/55 px-1.5 py-0.5 outline-none backdrop-blur-sm placeholder:text-white/35"
                  style={{
                    left: textEdit.x,
                    top: textEdit.y,
                    color,
                    caretColor: color,
                    fontSize: fontPx(),
                    lineHeight: 1.2,
                    transform: "translate(0, 0)",
                  }}
                  onChange={(event) => {
                    const value = event.target.value;
                    setTextEdit((prev) => {
                      const next = prev ? { ...prev, value } : null;
                      textEditRef.current = next;
                      return next;
                    });
                  }}
                  onKeyDown={onTextKeyDown}
                  onBlur={() => commitTextEdit()}
                  onPointerDown={(event) => event.stopPropagation()}
                />
              ) : null}
            </>
          )}
        />
      }
      sideTitle="如何改"
      sideMeta="底层原图 + 上层标注层"
      side={
        <StudioSidePanels
          defaultOpen={["prompt"]}
          items={[
            {
              id: "prompt",
              title: "修改说明",
              icon: <MessageSquareText />,
              content: (
                <>
                  <label className="joy-studio-shell__field">
                    <span className="joy-studio-shell__field-label">
                      <span>描述要改成什么</span>
                    </span>
                    <textarea
                      value={prompt}
                      rows={6}
                      placeholder="例如：把箭头指向的杯子改成红色马克杯"
                      className="joy-studio-shell__textarea"
                      onChange={(e) => {
                        setPrompt(e.target.value);
                        setError("");
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
              id: "tips",
              title: "使用建议",
              icon: <Lightbulb />,
              content: (
                <ul className="list-disc space-y-1.5 pl-4 text-xs text-white/50">
                  <li>先用箭头 / 圈出要改的物体</li>
                  <li>说明写具体：颜色、材质、增删</li>
                  <li>未标注区域会尽量保持原样</li>
                </ul>
              ),
            },
          ]}
        />
      }
      sideFoot="开源 mask editor 同构：img + overlay canvas"
      footerHint="标注改动区域，右侧描述目标效果后生成"
      footerActions={
        <button
          type="button"
          className="joy-studio-shell__primary"
          disabled={busy || !size}
          onClick={() => void submit()}
        >
          {busy ? "提交中…" : "生成"}
        </button>
      }
    />
  );
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  lineWidth: number,
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 2) return;

  const strokeW = Math.max(1, lineWidth);
  // Head scales with stroke; shrink on short drags so it stays readable.
  const headLen = Math.min(Math.max(strokeW * 3.5, 14), len * 0.42);
  const headHalf = Math.max(strokeW * 1.4, headLen * 0.45);
  const angle = Math.atan2(dy, dx);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  // Shaft ends inside the head a bit so join has no gap / no tip poke-through.
  const shaftEnd = Math.max(0, headLen - strokeW * 0.35);
  const endX = x2 - cos * shaftEnd;
  const endY = y2 - sin * shaftEnd;
  const baseX = x2 - cos * headLen;
  const baseY = y2 - sin * headLen;
  const ox = Math.cos(angle + Math.PI / 2) * headHalf;
  const oy = Math.sin(angle + Math.PI / 2) * headHalf;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = strokeW;

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(baseX + ox, baseY + oy);
  ctx.lineTo(baseX - ox, baseY - oy);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}
