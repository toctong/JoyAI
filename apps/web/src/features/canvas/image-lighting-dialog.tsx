"use client";

import { useEffect, useState } from "react";
import { Compass, RotateCcw, SlidersHorizontal } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/shared/lib/utils";
import {
  DEFAULT_LIGHTING,
  DIR_PRESETS,
  buildLightingLabel,
  buildLightingPrompt,
  type LightingParams,
} from "./lib/lighting-prompt";
import { LightingThreePreview } from "./lib/lighting-three-preview";
import { CanvasStudioShell } from "./studio/canvas-studio-shell";
import { StudioSidePanels } from "./studio/studio-side-panels";

type Props = {
  open: boolean;
  url: string;
  nodeTitle?: string;
  onClose: () => void;
  onConfirm: (payload: { prompt: string }) => void;
};

export function ImageLightingDialog({
  open,
  url,
  nodeTitle,
  onClose,
  onConfirm,
}: Props) {
  const [params, setParams] = useState<LightingParams>(DEFAULT_LIGHTING);
  const [view, setView] = useState<"original" | "preview" | "front">(
    "preview",
  );

  useEffect(() => {
    if (open) {
      setParams(DEFAULT_LIGHTING);
      setView("preview");
    }
  }, [open, url]);

  function update<K extends keyof LightingParams>(
    key: K,
    value: LightingParams[K],
  ) {
    setParams((current) => ({ ...current, [key]: value }));
  }

  if (!open || !url) return null;

  return (
    <CanvasStudioShell
      open={open}
      title="打光"
      subtitle={nodeTitle}
      sourceUrl={url}
      onClose={onClose}
      stageHint="Three.js 实时预览主光方向 · 最终由 AI 按提示词重绘光照"
      center={
        <div className="relative flex h-full w-full max-w-4xl flex-col">
          <div className="absolute left-3 top-3 z-10 flex gap-1">
            {(
              [
                { id: "original", label: "原图" },
                { id: "preview", label: "透视" },
                { id: "front", label: "正面" },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "rounded-full px-3 py-1 text-xs",
                  view === item.id
                    ? "bg-[hsl(199_90%_48%/0.4)] text-white"
                    : "bg-black/40 text-white/55",
                )}
                onClick={() => setView(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <LightingThreePreview
            url={url}
            params={params}
            mode={view}
            className="min-h-[min(64vh,720px)] w-full flex-1"
          />
          <span className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/45 px-3 py-1 text-xs text-white/65">
            方位 {params.azimuth}° · 仰角 {params.elevation}° · 亮度{" "}
            {params.brightness}%
          </span>
        </div>
      }
      sideTitle="光源设置"
      sideMeta={buildLightingLabel(params)}
      sideHeadAction={
        <button
          type="button"
          className="joy-studio-shell__chip"
          onClick={() => setParams(DEFAULT_LIGHTING)}
        >
          <RotateCcw className="size-3.5 shrink-0 opacity-80" />
          重置
        </button>
      }
      side={
        <StudioSidePanels
          defaultOpen={["preset", "fine"]}
          items={[
            {
              id: "preset",
              title: "主光源方向",
              icon: <Compass />,
              content: (
                <div className="joy-studio-shell__grid-btns">
                  {DIR_PRESETS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={cn(
                        "joy-studio-shell__grid-btn",
                        params.azimuth === item.azimuth &&
                          params.elevation === item.elevation &&
                          "is-on",
                      )}
                      onClick={() =>
                        setParams((current) => ({
                          ...current,
                          azimuth: item.azimuth,
                          elevation: item.elevation,
                        }))
                      }
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ),
            },
            {
              id: "fine",
              title: "精细调节",
              icon: <SlidersHorizontal />,
              content: (
                <>
                  <Field
                    label="方位"
                    value={`${params.azimuth}°`}
                    hint="正值主光在右侧"
                  >
                    <Slider
                      tone="onDark"
                      min={-180}
                      max={180}
                      step={1}
                      value={[params.azimuth]}
                      onValueChange={([v]) => update("azimuth", v ?? 0)}
                    />
                  </Field>
                  <Field
                    label="仰角"
                    value={`${params.elevation}°`}
                    hint="正值高光 · 负值底光"
                  >
                    <Slider
                      tone="onDark"
                      min={-40}
                      max={80}
                      step={1}
                      value={[params.elevation]}
                      onValueChange={([v]) => update("elevation", v ?? 0)}
                    />
                  </Field>
                  <Field label="亮度" value={`${params.brightness}%`}>
                    <Slider
                      tone="onDark"
                      min={10}
                      max={100}
                      step={1}
                      value={[params.brightness]}
                      onValueChange={([v]) => update("brightness", v ?? 50)}
                    />
                  </Field>
                  <Field label="色温" value={`${params.temperature}K`}>
                    <Slider
                      tone="onDark"
                      min={3000}
                      max={8000}
                      step={50}
                      value={[params.temperature]}
                      onValueChange={([v]) => update("temperature", v ?? 5500)}
                    />
                  </Field>
                  <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                    <span className="text-sm text-white/80">轮廓光</span>
                    <Switch
                      checked={params.rim}
                      onCheckedChange={(checked) => update("rim", checked)}
                    />
                  </label>
                </>
              ),
            },
          ]}
        />
      }
      sideFoot="Three.js 方向光预览 · V 切换视图（侧栏按钮）"
      footerHint={buildLightingLabel(params)}
      footerActions={
        <button
          type="button"
          className="joy-studio-shell__primary"
          onClick={() => onConfirm({ prompt: buildLightingPrompt(params) })}
        >
          打光
        </button>
      }
    />
  );
}

function Field({
  label,
  value,
  hint,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="joy-studio-shell__field">
      <span className="joy-studio-shell__field-label">
        <span>{label}</span>
        <span className="tabular-nums">{value}</span>
      </span>
      {children}
      {hint ? <span className="text-[12px] text-white/35">{hint}</span> : null}
    </div>
  );
}
