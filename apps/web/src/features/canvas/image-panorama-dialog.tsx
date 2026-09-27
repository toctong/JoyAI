"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Globe, Lightbulb, Sparkles } from "lucide-react";
import type { ModelCapabilities } from "@joyai/shared";
import { BrandAvatar } from "@/components/admin/brand-avatar";
import { ComposerModelMenu } from "@/features/studio/composer-model-menu";
import { api } from "@/shared/lib/api";
import { modelIconSrc } from "@/shared/lib/brand-icons";
import {
  filterInpaintModels,
  pickDefaultModelId,
  rememberImageModelId,
} from "./lib/inpaint-models";
import { CanvasStudioShell } from "./studio/canvas-studio-shell";
import { StudioImageStage } from "./studio/studio-image-stage";
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
  onConfirm: (payload: { note: string; modelId: string }) => void;
};

export function ImagePanoramaDialog({
  open,
  url,
  nodeTitle,
  onClose,
  onConfirm,
}: Props) {
  const [note, setNote] = useState("");
  const [models, setModels] = useState<PublicModel[]>([]);
  const [modelId, setModelId] = useState("");
  const [modelsError, setModelsError] = useState("");

  const i2iModels = useMemo(() => filterInpaintModels(models), [models]);
  const selectedModel = i2iModels.find((m) => m.id === modelId);

  useEffect(() => {
    if (!open) return;
    setNote("");
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

  if (!open || !url) return null;

  return (
    <CanvasStudioShell
      open={open}
      title="转 720° 环视"
      subtitle={nodeTitle}
      titleIcon={<Globe className="size-4 opacity-80" />}
      sourceUrl={url}
      onClose={onClose}
      stageHint="基于当前画面生成 720° 环视图 · 2:1 画幅 · 生成后可在舞台环视"
      center={
        <StudioImageStage url={url} className="max-h-[min(70vh,760px)]" />
      }
      sideTitle="转 720° 环视"
      sideMeta="基于当前画面生成 720° 环视图 · 2:1 画幅"
      side={
        <StudioSidePanels
          defaultOpen={["model", "hint", "note"]}
          items={[
            {
              id: "model",
              title: "环视模型",
              icon: <Globe />,
              badge: selectedModel?.name,
              content: (
                <div className="space-y-2">
                  <ComposerModelMenu
                    models={i2iModels}
                    selectedId={modelId}
                    onSelect={(id) => {
                      rememberImageModelId(id);
                      setModelId(id);
                    }}
                    emptyLabel="暂无支持图生图的模型"
                    align="start"
                    contentClassName="joy-studio-popover"
                    contentProps={{ "data-canvas-shortcuts-ignore": true }}
                  >
                    <button
                      type="button"
                      className="joy-studio-shell__chip h-9 w-full justify-between gap-2 px-3"
                      disabled={!i2iModels.length}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {selectedModel ? (
                          <BrandAvatar
                            src={modelIconSrc(selectedModel)}
                            label={selectedModel.name}
                            size={16}
                            rounded="md"
                          />
                        ) : null}
                        <span className="truncate">
                          {selectedModel?.name ?? "选择模型"}
                        </span>
                      </span>
                      <ChevronDown className="size-3.5 shrink-0 opacity-60" />
                    </button>
                  </ComposerModelMenu>
                  <p className="text-[12px] leading-relaxed text-white/45">
                    需要支持参考图的图像模型。输出固定 2:1 等距柱状全景。
                  </p>
                </div>
              ),
            },
            {
              id: "hint",
              title: "使用建议",
              icon: <Lightbulb />,
              content: (
                <p className="text-[12px] leading-relaxed text-white/45">
                  全景基于当前画面「脑补」四周，画面应空旷完整、铺满全景构图；效果越佳。输出固定
                  2:1 横幅，生成后可在舞台里 360°
                  环视观赏。想要不同风格的全景，先用其它工具改好图，再送为底图转全景。
                </p>
              ),
            },
            {
              id: "note",
              title: "可选补充",
              icon: <Sparkles />,
              content: (
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={4}
                  placeholder="例如：保留人物站位，补全教室四周与窗外操场"
                  className="joy-studio-shell__input min-h-[96px] w-full resize-y px-3 py-2 text-[13px] leading-relaxed"
                  data-canvas-shortcuts-ignore
                />
              ),
            },
          ]}
        />
      }
      sideFoot="确认后新开环视节点并用所选模型图生图"
      footerHint={
        modelsError ||
        "底部选择模型，点生成才会提交 · 不会打开弹框就自动跑"
      }
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
            className="joy-studio-shell__primary"
            disabled={!modelId}
            onClick={() => {
              if (!modelId) return;
              onConfirm({ note, modelId });
            }}
          >
            生成环视
          </button>
        </>
      }
    />
  );
}
