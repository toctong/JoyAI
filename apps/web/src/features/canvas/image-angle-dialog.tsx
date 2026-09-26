"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Aperture,
  ChevronDown,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import type { ModelCapabilities } from "@joyai/shared";
import { BrandAvatar } from "@/components/admin/brand-avatar";
import { Slider } from "@/components/ui/slider";
import { ComposerModelMenu } from "@/features/studio/composer-model-menu";
import { api } from "@/shared/lib/api";
import { modelIconSrc } from "@/shared/lib/brand-icons";
import { cn } from "@/shared/lib/utils";
import {
  DEFAULT_ANGLE_PARAMS,
  anglePreviewTransform,
  buildAngleLabel,
  type ImageAngleParams,
} from "./lib/angle-prompt";
import { filterInpaintModels, pickDefaultModelId, rememberImageModelId } from "./lib/inpaint-models";
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
  onConfirm: (payload: {
    params: ImageAngleParams;
    modelId: string;
  }) => void;
};

const PRESETS: {
  id: string;
  label: string;
  params: Partial<ImageAngleParams>;
}[] = [
  { id: "front-high", label: "正前高", params: { horizontalAngle: 0, pitchAngle: 25 } },
  { id: "front-low", label: "正前低", params: { horizontalAngle: 0, pitchAngle: -20 } },
  { id: "left", label: "左侧", params: { horizontalAngle: -35, pitchAngle: 0 } },
  { id: "right", label: "右侧", params: { horizontalAngle: 35, pitchAngle: 0 } },
  { id: "back", label: "背面", params: { horizontalAngle: 60, pitchAngle: 5 } },
  { id: "tilt", label: "斜侧", params: { horizontalAngle: 25, pitchAngle: 12 } },
];

export function ImageAngleDialog({
  open,
  url,
  nodeTitle,
  onClose,
  onConfirm,
}: Props) {
  const [params, setParams] = useState<ImageAngleParams>(DEFAULT_ANGLE_PARAMS);
  const [models, setModels] = useState<PublicModel[]>([]);
  const [modelId, setModelId] = useState("");
  const [modelsError, setModelsError] = useState("");

  const angleModels = useMemo(() => filterInpaintModels(models), [models]);
  const selectedModel = angleModels.find((m) => m.id === modelId);

  useEffect(() => {
    if (!open) return;
    setParams(DEFAULT_ANGLE_PARAMS);
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

  function update<K extends keyof ImageAngleParams>(
    key: K,
    value: ImageAngleParams[K],
  ) {
    setParams((current) => ({ ...current, [key]: value }));
  }

  if (!open || !url) return null;

  return (
    <CanvasStudioShell
      open={open}
      title="多角度"
      subtitle={nodeTitle}
      sourceUrl={url}
      onClose={onClose}
      stageHint="拖动右侧滑杆或点预设移动机位 · 预览仅示意，最终由 AI 重绘"
      center={
        <div className="relative flex flex-col items-center gap-6">
          <div className="relative" style={{ perspective: 640 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt=""
              className="size-56 rounded-2xl object-cover shadow-2xl sm:size-72"
              draggable={false}
              style={{ transform: anglePreviewTransform(params) }}
            />
            <div className="absolute -bottom-6 left-1/2 h-10 w-28 -translate-x-1/2 rounded-full border border-white/15 bg-white/5 backdrop-blur" />
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <span className="rounded-full bg-black/40 px-3 py-1 text-xs text-white/70">
              Orbit {params.horizontalAngle}° · Pitch {params.pitchAngle}° ·{" "}
              {params.cameraDistance.toFixed(2)}x
            </span>
          </div>
        </div>
      }
      sideTitle="机位参数"
      sideMeta={buildAngleLabel(params)}
      sideHeadAction={
        <button
          type="button"
          className="joy-studio-shell__chip"
          onClick={() => setParams(DEFAULT_ANGLE_PARAMS)}
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
              title: "预设视角",
              icon: <Aperture />,
              content: (
                <div className="joy-studio-shell__grid-btns">
                  {PRESETS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="joy-studio-shell__grid-btn"
                      onClick={() =>
                        setParams((current) => ({
                          ...current,
                          ...item.params,
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
              title: "精细参数",
              icon: <SlidersHorizontal />,
              content: (
                <>
                  <AngleField
                    label="水平环绕"
                    hint="正值相机移到主体右侧"
                    value={params.horizontalAngle}
                    min={-60}
                    max={60}
                    step={1}
                    suffix="°"
                    onChange={(value) => update("horizontalAngle", value)}
                  />
                  <AngleField
                    label="垂直俯仰"
                    hint="正值俯视 · 负值仰视"
                    value={params.pitchAngle}
                    min={-45}
                    max={45}
                    step={1}
                    suffix="°"
                    onChange={(value) => update("pitchAngle", value)}
                  />
                  <AngleField
                    label="景别缩放"
                    hint="数值越大镜头越远"
                    value={params.cameraDistance}
                    min={1}
                    max={10}
                    step={0.1}
                    onChange={(value) => update("cameraDistance", value)}
                  />
                  <div className="joy-studio-shell__field">
                    <span className="joy-studio-shell__field-label">
                      <span>广角镜头</span>
                    </span>
                    <div className="flex gap-1 rounded-lg border border-white/10 bg-black/30 p-0.5">
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
                              ? "bg-[rgba(30,200,224,0.35)] text-white"
                              : "text-white/50 hover:text-white/80",
                          )}
                          onClick={() => update("wideAngle", item.wide)}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ),
            },
          ]}
        />
      }
      sideFoot="确认后创建提示词节点并用所选模型图生图重绘"
      footerHint={
        modelsError ||
        "拖动视口示意、拉滑杆或点预设移动机位 · 底部选择 AI 模型"
      }
      footerActions={
        <>
          <ComposerModelMenu
            models={angleModels}
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
              disabled={!angleModels.length}
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
            className="joy-studio-shell__primary"
            disabled={!modelId}
            onClick={() => {
              if (!modelId) return;
              onConfirm({ params, modelId });
            }}
          >
            生成新视角
          </button>
        </>
      }
    />
  );
}

function AngleField({
  label,
  hint,
  value,
  min,
  max,
  step,
  suffix = "",
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  const display = Number.isInteger(step) ? String(value) : value.toFixed(1);
  return (
    <div className="joy-studio-shell__field">
      <span className="joy-studio-shell__field-label">
        <span>{label}</span>
        <span className="tabular-nums">
          {display}
          {suffix}
        </span>
      </span>
      <Slider
        tone="onDark"
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(next) => onChange(next[0] ?? value)}
      />
      {hint ? <span className="text-[12px] text-white/35">{hint}</span> : null}
    </div>
  );
}
