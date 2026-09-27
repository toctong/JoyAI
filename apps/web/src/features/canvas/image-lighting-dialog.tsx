"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Compass,
  Lightbulb,
  RotateCcw,
  SlidersHorizontal,
  SunMedium,
  Zap,
} from "lucide-react";
import type { ModelCapabilities } from "@joyai/shared";
import { BrandAvatar } from "@/components/admin/brand-avatar";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ComposerModelMenu } from "@/features/studio/composer-model-menu";
import { api } from "@/shared/lib/api";
import { modelIconSrc } from "@/shared/lib/brand-icons";
import { cn } from "@/shared/lib/utils";
import {
  filterInpaintModels,
  pickDefaultModelId,
  rememberImageModelId,
} from "./lib/inpaint-models";
import {
  DEFAULT_LIGHTING,
  DIR_PRESETS,
  buildLightingLabel,
  buildLightingPrompt,
  clampAzimuth,
  clampElevation,
  temperatureToneLabel,
  type LightingParams,
} from "./lib/lighting-prompt";
import { LightingThreePreview } from "./lib/lighting-three-preview";
import { CanvasStudioShell } from "./studio/canvas-studio-shell";
import { StudioSidePanels } from "./studio/studio-side-panels";

type PublicModel = {
  id: string;
  name: string;
  kind: string;
  remoteId?: string;
  capabilities?: ModelCapabilities | null;
  channel?: { platform?: string; name?: string };
};

type Props = {
  open: boolean;
  url: string;
  nodeTitle?: string;
  onClose: () => void;
  onConfirm: (payload: { prompt: string; modelId: string }) => void;
};

type ViewMode = "original" | "preview" | "front";

export function ImageLightingDialog({
  open,
  url,
  nodeTitle,
  onClose,
  onConfirm,
}: Props) {
  const [params, setParams] = useState<LightingParams>(DEFAULT_LIGHTING);
  const [view, setView] = useState<ViewMode>("preview");
  const [models, setModels] = useState<PublicModel[]>([]);
  const [modelId, setModelId] = useState("");
  const [modelsError, setModelsError] = useState("");

  const i2iModels = useMemo(() => filterInpaintModels(models), [models]);
  const selectedModel = i2iModels.find((m) => m.id === modelId);

  useEffect(() => {
    if (!open) return;
    setParams(DEFAULT_LIGHTING);
    setView("preview");
    setModelsError("");
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
        setModelsError(filtered.length ? "" : "暂无支持图生图的模型");
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

  const paramsRef = useRef(params);
  const modelIdRef = useRef(modelId);
  const onConfirmRef = useRef(onConfirm);
  paramsRef.current = params;
  modelIdRef.current = modelId;
  onConfirmRef.current = onConfirm;

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
      const step = event.shiftKey ? 15 : 5;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setParams((p) => ({
          ...p,
          azimuth: clampAzimuth(p.azimuth - step),
        }));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setParams((p) => ({
          ...p,
          azimuth: clampAzimuth(p.azimuth + step),
        }));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setParams((p) => ({
          ...p,
          elevation: clampElevation(p.elevation + step),
        }));
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setParams((p) => ({
          ...p,
          elevation: clampElevation(p.elevation - step),
        }));
      } else if (event.key === "l" || event.key === "L") {
        event.preventDefault();
        setParams((p) => ({ ...p, rim: !p.rim }));
      } else if (event.key === "v" || event.key === "V") {
        event.preventDefault();
        setView((prev) =>
          prev === "preview"
            ? "front"
            : prev === "front"
              ? "original"
              : "preview",
        );
      } else if (event.key === "0") {
        event.preventDefault();
        setParams(DEFAULT_LIGHTING);
      } else if (event.key === "Enter") {
        const id = modelIdRef.current;
        if (!id) return;
        event.preventDefault();
        onConfirmRef.current({
          prompt: buildLightingPrompt(paramsRef.current),
          modelId: id,
        });
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

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
      titleIcon={<SunMedium className="size-4 opacity-80" />}
      sourceUrl={url}
      onClose={onClose}
      stageHint="主光源：点哪光到哪，拖出球外可绕到背面，双击复位 · 右键拖拽旋转视角"
      center={
        <div className="relative flex h-full w-full max-w-5xl flex-col">
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
                  "rounded-full px-3 py-1 text-xs transition",
                  view === item.id
                    ? "bg-[hsl(199_90%_48%/0.45)] text-white"
                    : "bg-black/45 text-white/55 hover:text-white/85",
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
            onParamsChange={(patch) =>
              setParams((current) => ({ ...current, ...patch }))
            }
            onReset={() => setParams(DEFAULT_LIGHTING)}
          />
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1">
            <span className="rounded-full bg-black/55 px-3 py-1 text-[11px] text-white/60">
              主光源：点哪光到哪，拖出球外可绕到背面，双击复位
            </span>
            <span className="rounded-full bg-black/45 px-3 py-1 text-xs tabular-nums text-white/80">
              方位 {params.azimuth}° · 仰角 {params.elevation}°
            </span>
          </div>
        </div>
      }
      sideTitle="光源设置"
      sideMeta={`方位 ${params.azimuth}° · 仰角 ${params.elevation}°`}
      sideHeadAction={
        <button
          type="button"
          className="joy-studio-shell__chip"
          title="重置"
          onClick={() => setParams(DEFAULT_LIGHTING)}
        >
          <RotateCcw className="size-3.5 shrink-0 opacity-80" />
        </button>
      }
      side={
        <StudioSidePanels
          defaultOpen={["dir", "light", "hint"]}
          items={[
            {
              id: "dir",
              title: "主光源方向",
              icon: <Compass />,
              badge: `${params.azimuth}° / ${params.elevation}°`,
              content: (
                <div className="space-y-3">
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
                  <Field
                    label="方位"
                    value={`${params.azimuth}°`}
                    hint="0 正前 · 正数在右 · ±180 正背（逆光）"
                  >
                    <Slider
                      tone="onDark"
                      min={-180}
                      max={180}
                      step={1}
                      value={[params.azimuth]}
                      onValueChange={([v]) =>
                        update("azimuth", clampAzimuth(v ?? 0))
                      }
                    />
                  </Field>
                  <Field
                    label="仰角"
                    value={`${params.elevation}°`}
                    hint="正数顶光 · 负数底光"
                  >
                    <Slider
                      tone="onDark"
                      min={-90}
                      max={90}
                      step={1}
                      value={[params.elevation]}
                      onValueChange={([v]) =>
                        update("elevation", clampElevation(v ?? 0))
                      }
                    />
                  </Field>
                </div>
              ),
            },
            {
              id: "light",
              title: "光照",
              icon: <SlidersHorizontal />,
              badge: `${params.brightness}% · ${params.temperature}K`,
              content: (
                <div className="space-y-3">
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
                  <Field
                    label="色温"
                    value={`${params.temperature}K · ${temperatureToneLabel(params.temperature)}`}
                  >
                    <div className="space-y-1.5">
                      <div className="relative flex h-5 items-center">
                        <div
                          className="pointer-events-none absolute inset-x-0 h-1.5 rounded-full"
                          style={{
                            background:
                              "linear-gradient(90deg, #ff9a4a 0%, #ffe9c2 42%, #f5f7fa 55%, #9ec8ff 100%)",
                          }}
                        />
                        <Slider
                          tone="onDark"
                          min={3000}
                          max={8000}
                          step={50}
                          value={[params.temperature]}
                          onValueChange={([v]) =>
                            update("temperature", v ?? 5600)
                          }
                          className="relative z-[1] [&>span:first-child]:bg-transparent [&>span:first-child>span]:bg-transparent"
                        />
                      </div>
                      <div className="flex justify-between text-[11px] text-white/35">
                        <span>暖</span>
                        <span>中性</span>
                        <span>冷</span>
                      </div>
                    </div>
                  </Field>
                  <label className="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
                    <span className="space-y-0.5">
                      <span className="block text-sm text-white/85">轮廓光</span>
                      <span className="block text-[12px] leading-relaxed text-white/40">
                        在主体边缘加一圈高光，让人物从背景里分离出来
                      </span>
                    </span>
                    <Switch
                      checked={params.rim}
                      onCheckedChange={(checked) => update("rim", checked)}
                    />
                  </label>
                </div>
              ),
            },
            {
              id: "hint",
              title: "使用建议",
              icon: <Lightbulb />,
              content: (
                <ul className="list-disc space-y-1.5 pl-4 text-[12px] leading-relaxed text-white/45">
                  <li>
                    左前 / 右前约 ±30°、仰角 20–40°，接近自然窗光。
                  </li>
                  <li>
                    选「后方」或拖出球外，适合逆光与发丝轮廓。
                  </li>
                  <li>
                    开轮廓光可加强主体与背景的分离感。
                  </li>
                  <li>
                    预览只示意灯位；最终由所选模型按提示词重绘光照。
                  </li>
                </ul>
              ),
            },
          ]}
        />
      }
      sideFoot={
        <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-white/40">
          <Kbd>←↑↓→</Kbd>
          <Kbd>Shift</Kbd>
          <Kbd>L</Kbd>
          <Kbd>V</Kbd>
          <Kbd>0</Kbd>
          <Kbd>↵</Kbd>
          <span className="ml-1">微调 / 大步 / 轮廓 / 视图 / 重置 / 打光</span>
        </span>
      }
      footerHint={modelsError || buildLightingLabel(params)}
      footerActions={
        <>
          <ComposerModelMenu
            models={i2iModels}
            selectedId={modelId}
            onSelect={(id) => {
              rememberImageModelId(id);
              setModelId(id);
            }}
            emptyLabel="暂无支持图生图的模型"
            align="end"
            contentClassName="joy-studio-popover"
            contentProps={{ "data-canvas-shortcuts-ignore": true }}
          >
            <button
              type="button"
              className="joy-studio-shell__chip gap-2"
              disabled={!i2iModels.length}
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

          <button
            type="button"
            className="joy-studio-shell__primary gap-1.5"
            disabled={!modelId}
            onClick={() => {
              if (!modelId) return;
              onConfirm({
                prompt: buildLightingPrompt(params),
                modelId,
              });
            }}
          >
            <Zap className="size-3.5 opacity-90" />
            打光
          </button>
        </>
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

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/55">
      {children}
    </kbd>
  );
}
