"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  Palette,
  PencilLine,
  Sparkles,
  UserRound,
} from "lucide-react";
import type { ModelCapabilities } from "@joyai/shared";
import { BrandAvatar } from "@/components/admin/brand-avatar";
import { ComposerModelMenu } from "@/features/studio/composer-model-menu";
import { api } from "@/shared/lib/api";
import { modelIconSrc } from "@/shared/lib/brand-icons";
import { cn } from "@/shared/lib/utils";
import {
  CanvasStylePicker,
  type SelectedCanvasStyle,
} from "./canvas-style-picker";
import { IMAGE_FX_DEFS, type ImageFxMode } from "./lib/image-fx";
import { filterInpaintModels, pickDefaultModelId, rememberImageModelId } from "./lib/inpaint-models";
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
  mode: ImageFxMode | null;
  url: string;
  nodeTitle?: string;
  onClose: () => void;
  onConfirm: (payload: {
    mode: ImageFxMode;
    note: string;
    stylePrompt?: string | null;
    modelId: string;
  }) => void;
};

const MODE_ICON: Record<ImageFxMode, typeof PencilLine> = {
  lineart: PencilLine,
  colorize: Palette,
  "character-sheet": UserRound,
};

export function ImageFxDialog({
  open,
  mode,
  url,
  nodeTitle,
  onClose,
  onConfirm,
}: Props) {
  const [note, setNote] = useState("");
  const [style, setStyle] = useState<SelectedCanvasStyle | null>(null);
  const [styleOpen, setStyleOpen] = useState(false);
  const [models, setModels] = useState<PublicModel[]>([]);
  const [modelId, setModelId] = useState("");
  const [modelsError, setModelsError] = useState("");

  const def = mode ? IMAGE_FX_DEFS[mode] : null;
  const fxModels = useMemo(() => filterInpaintModels(models), [models]);
  const selectedModel = fxModels.find((m) => m.id === modelId);
  const TitleIcon = mode ? MODE_ICON[mode] : Sparkles;

  useEffect(() => {
    if (!open || !mode) return;
    setNote("");
    setStyle(null);
    setStyleOpen(false);
    setModelsError("");
  }, [open, mode, url]);

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

  if (!open || !url || !mode || !def) return null;

  return (
    <>
      <CanvasStudioShell
        open={open}
        title={def.title}
        subtitle={nodeTitle}
        titleIcon={<TitleIcon className="size-4 opacity-80" />}
        sourceUrl={url}
        onClose={onClose}
        stageHint={def.stageHint}
        center={
          <StudioImageStage url={url} className="max-h-[min(70vh,760px)]" />
        }
        sideTitle={def.sideTitle}
        sideMeta={def.ratio}
        side={
          <StudioSidePanels
            key={mode}
            defaultOpen={["note", ...(def.styleLibrary ? ["style"] : [])]}
            items={[
              ...(def.styleLibrary
                ? [
                    {
                      id: "style",
                      title: "风格库",
                      icon: <Palette />,
                      badge: style?.label,
                      onClear: style ? () => setStyle(null) : undefined,
                      content: (
                        <div className="space-y-2">
                          <button
                            type="button"
                            className={cn(
                              "joy-studio-shell__chip h-9 w-full justify-between gap-2 px-3",
                              style && "is-on",
                            )}
                            onClick={() => setStyleOpen(true)}
                          >
                            <span className="truncate">
                              {style?.label ?? "从风格库选择"}
                            </span>
                            <ChevronDown className="size-3.5 shrink-0 opacity-60" />
                          </button>
                          <p className="text-[12px] leading-relaxed text-white/45">
                            选中的风格会在提交时并入提示词，不会改掉下方备注。
                          </p>
                        </div>
                      ),
                    },
                  ]
                : []),
              {
                id: "note",
                title: def.noteHint,
                icon: <Sparkles />,
                content: (
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    rows={5}
                    placeholder={def.notePlaceholder}
                    className="joy-studio-shell__input min-h-[120px] w-full resize-y px-3 py-2 text-[13px] leading-relaxed"
                    data-canvas-shortcuts-ignore
                  />
                ),
              },
            ]}
          />
        }
        sideFoot="确认后新开提示词节点并用所选模型图生图"
        footerHint={
          modelsError || "底部选择模型，点生成才会提交 · 不会打开弹框就自动跑"
        }
        footerActions={
          <>
            <ComposerModelMenu
              models={fxModels}
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
                disabled={!fxModels.length}
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
                onConfirm({
                  mode,
                  note,
                  stylePrompt: style?.prompt ?? null,
                  modelId,
                });
              }}
            >
              {def.confirmLabel}
            </button>
          </>
        }
      />

      {def.styleLibrary ? (
        <CanvasStylePicker
          open={styleOpen}
          onClose={() => setStyleOpen(false)}
          selectedSlug={style?.slug}
          onSelect={setStyle}
          onClear={() => setStyle(null)}
        />
      ) : null}
    </>
  );
}
