"use client";

import { useEffect, useState } from "react";
import { RotateCcw, RotateCw } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { toast } from "@/shared/lib/toast";
import { rotateImageUrl } from "./lib/rotate-node-image";
import { CanvasStudioShell } from "./studio/canvas-studio-shell";
import { StudioImageStage } from "./studio/studio-image-stage";
import { StudioSidePanels } from "./studio/studio-side-panels";

export type RotateConfirmPayload = {
  blob: Blob;
  deg: 90 | 180 | 270;
  width: number;
  height: number;
};

type Props = {
  open: boolean;
  url: string;
  nodeTitle?: string;
  onClose: () => void;
  onConfirm: (payload: RotateConfirmPayload) => Promise<void>;
};

const STEP_OPTIONS = [
  { deg: 90 as const, label: "90°" },
  { deg: 180 as const, label: "180°" },
  { deg: 270 as const, label: "270°" },
];

export function ImageRotateDialog({
  open,
  url,
  nodeTitle,
  onClose,
  onConfirm,
}: Props) {
  const [deg, setDeg] = useState<0 | 90 | 180 | 270>(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDeg(0);
    setBusy(false);
  }, [open, url]);

  function turn(delta: 90 | -90) {
    if (busy) return;
    setDeg((prev) => {
      const next = (((prev + delta) % 360) + 360) % 360;
      return next as 0 | 90 | 180 | 270;
    });
  }

  async function apply() {
    if (!deg || busy) return;
    setBusy(true);
    try {
      const baked = await rotateImageUrl(url, deg);
      await onConfirm({
        blob: baked.blob,
        deg,
        width: baked.width,
        height: baked.height,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "旋转失败");
    } finally {
      setBusy(false);
    }
  }

  if (!open || !url) return null;

  return (
    <CanvasStudioShell
      open={open}
      title="旋转"
      subtitle={nodeTitle}
      titleIcon={<RotateCw className="size-4 opacity-80" />}
      sourceUrl={url}
      onClose={busy ? () => undefined : onClose}
      stageHint="预览不上传 · 点应用后才会新建画布节点并写入素材库"
      center={
        <div className="flex h-full w-full items-center justify-center overflow-hidden p-4">
          <div
            className="max-h-full max-w-full transition-transform duration-200 ease-out"
            style={{ transform: `rotate(${deg}deg)` }}
          >
            <StudioImageStage
              url={url}
              className="max-h-[min(70vh,720px)]"
            />
          </div>
        </div>
      }
      sideTitle="旋转角度"
      sideMeta={deg ? `${deg}°` : "原图"}
      side={
        <StudioSidePanels
          defaultOpen={["angle", "hint"]}
          items={[
            {
              id: "angle",
              title: "调整角度",
              icon: <RotateCw />,
              content: (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="joy-studio-shell__tool-btn flex-1 justify-center"
                      disabled={busy}
                      onClick={() => turn(-90)}
                    >
                      <RotateCcw className="size-3.5 opacity-80" />
                      左旋 90°
                    </button>
                    <button
                      type="button"
                      className="joy-studio-shell__tool-btn flex-1 justify-center"
                      disabled={busy}
                      onClick={() => turn(90)}
                    >
                      <RotateCw className="size-3.5 opacity-80" />
                      右旋 90°
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {STEP_OPTIONS.map((item) => {
                      const on = deg === item.deg;
                      return (
                        <button
                          key={item.deg}
                          type="button"
                          className={cn(
                            "joy-studio-shell__chip",
                            on && "is-on",
                          )}
                          aria-pressed={on}
                          disabled={busy}
                          onClick={() => setDeg(item.deg)}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      className={cn(
                        "joy-studio-shell__chip",
                        deg === 0 && "is-on",
                      )}
                      aria-pressed={deg === 0}
                      disabled={busy}
                      onClick={() => setDeg(0)}
                    >
                      重置
                    </button>
                  </div>
                </div>
              ),
            },
            {
              id: "hint",
              title: "说明",
              icon: <RotateCcw />,
              content: (
                <p className="text-[12px] leading-relaxed text-white/45">
                  弹框里只做本地预览，不会立刻上传 OSS。确认应用后才会在原图旁新建节点并上传旋转结果。
                </p>
              ),
            },
          ]}
        />
      }
      sideFoot="应用后新开图像节点并连线原图"
      footerHint={
        busy
          ? "正在上传旋转结果…"
          : deg
            ? `当前预览 ${deg}° · 点应用才会落到画布`
            : "先旋转角度，再点应用"
      }
      footerActions={
        <>
          <button
            type="button"
            className="joy-studio-shell__chip"
            disabled={busy || deg === 0}
            onClick={() => setDeg(0)}
          >
            重置
          </button>
          <button
            type="button"
            className="joy-studio-shell__primary"
            disabled={busy || deg === 0}
            onClick={() => void apply().catch(() => undefined)}
          >
            {busy ? "应用中…" : "应用"}
          </button>
        </>
      }
    />
  );
}
