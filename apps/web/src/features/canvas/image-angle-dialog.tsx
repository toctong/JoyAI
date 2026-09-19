"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/shared/lib/utils";
import {
  DEFAULT_ANGLE_PARAMS,
  anglePreviewTransform,
  type ImageAngleParams,
} from "./lib/angle-prompt";

type Props = {
  open: boolean;
  url: string;
  onClose: () => void;
  onConfirm: (params: ImageAngleParams) => void;
};

export function ImageAngleDialog({ open, url, onClose, onConfirm }: Props) {
  const [params, setParams] = useState<ImageAngleParams>(DEFAULT_ANGLE_PARAMS);

  useEffect(() => {
    if (open) setParams(DEFAULT_ANGLE_PARAMS);
  }, [open, url]);

  function update<K extends keyof ImageAngleParams>(
    key: K,
    value: ImageAngleParams[K],
  ) {
    setParams((current) => ({ ...current, [key]: value }));
  }

  return (
    <Dialog
      open={open && Boolean(url)}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        data-canvas-shortcuts-ignore
        className="max-w-3xl"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>AI 多角度</DialogTitle>
          <DialogDescription>
            左侧只预览方向，确认后会基于原图创建提示词节点并重新生成。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-[minmax(240px,1fr)_280px]">
          <div className="flex min-h-[280px] flex-col justify-between rounded-xl bg-muted/40 p-4">
            <div className="grid flex-1 place-items-center">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  className="size-44 rounded-2xl object-cover shadow-lg"
                  draggable={false}
                  style={{ transform: anglePreviewTransform(params) }}
                />
                <div className="absolute -bottom-5 left-1/2 h-8 w-20 -translate-x-1/2 rounded-full border border-border/60 bg-background/40 backdrop-blur" />
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => setParams(DEFAULT_ANGLE_PARAMS)}
            >
              <RotateCcw className="mr-1.5 size-3.5" />
              重置
            </Button>
          </div>

          <div className="space-y-5 py-1">
            <AngleField
              label="左右角度"
              value={params.horizontalAngle}
              min={-60}
              max={60}
              step={1}
              suffix="°"
              onChange={(value) => update("horizontalAngle", value)}
            />
            <AngleField
              label="俯仰角度"
              value={params.pitchAngle}
              min={-45}
              max={45}
              step={1}
              suffix="°"
              onChange={(value) => update("pitchAngle", value)}
            />
            <AngleField
              label="镜头距离"
              value={params.cameraDistance}
              min={1}
              max={10}
              step={0.1}
              onChange={(value) => update("cameraDistance", value)}
            />
            <div className="grid grid-cols-[72px_1fr] items-center gap-3">
              <span className="text-sm text-muted-foreground">镜头</span>
              <div className="flex gap-1 rounded-lg bg-muted/60 p-0.5">
                {(
                  [
                    { id: "standard", label: "标准", wide: false },
                    { id: "wide", label: "广角", wide: true },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition",
                      params.wideAngle === item.wide
                        ? "bg-background shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => update("wideAngle", item.wide)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button type="button" onClick={() => onConfirm(params)}>
            AI 生成
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AngleField({
  label,
  value,
  min,
  max,
  step,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  const display = Number.isInteger(step)
    ? String(value)
    : value.toFixed(1);
  return (
    <div className="grid grid-cols-[72px_1fr_52px] items-center gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(next) => onChange(next[0] ?? value)}
      />
      <span className="text-right text-sm font-medium tabular-nums">
        {display}
        {suffix}
      </span>
    </div>
  );
}
