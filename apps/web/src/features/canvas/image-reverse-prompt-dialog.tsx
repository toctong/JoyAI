"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, MessageSquareText, Sparkles } from "lucide-react";
import type { ModelCapabilities } from "@joyai/shared";
import { BrandAvatar } from "@/components/admin/brand-avatar";
import { ComposerModelMenu } from "@/features/studio/composer-model-menu";
import { modelAcceptsImageInput } from "@/features/studio/model-options";
import { api } from "@/shared/lib/api";
import { modelIconSrc } from "@/shared/lib/brand-icons";
import { IMAGE_PROMPT_REVERSE_PRESET } from "./lib/reverse-prompt";
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
  onConfirm: (payload: { modelId: string }) => void;
};

export function ImageReversePromptDialog({
  open,
  url,
  nodeTitle,
  onClose,
  onConfirm,
}: Props) {
  const [models, setModels] = useState<PublicModel[]>([]);
  const [modelId, setModelId] = useState("");
  const [modelsError, setModelsError] = useState("");

  const visionModels = useMemo(() => {
    const llm = models.filter((m) => m.kind === "llm");
    const vision = llm.filter((m) => modelAcceptsImageInput(m.capabilities));
    return vision.length ? vision : llm;
  }, [models]);

  const selectedModel = visionModels.find((m) => m.id === modelId);

  useEffect(() => {
    if (!open) return;
    setModelsError("");
    let cancelled = false;
    void api<PublicModel[]>("/models")
      .then((list) => {
        if (cancelled) return;
        const next = Array.isArray(list) ? list : [];
        setModels(next);
        const llm = next.filter((m) => m.kind === "llm");
        const vision = llm.filter((m) =>
          modelAcceptsImageInput(m.capabilities),
        );
        const pick = vision.length ? vision : llm;
        setModelId(pick[0]?.id ?? "");
        setModelsError(pick.length ? "" : "暂无可用的语言模型");
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
      title="提取提示词"
      subtitle={nodeTitle}
      titleIcon={<MessageSquareText className="size-4 opacity-80" />}
      sourceUrl={url}
      onClose={onClose}
      stageHint="确认后会在画布右侧生成文本节点 · 有原提示词则直接提取，否则用 AI 反推"
      center={
        <StudioImageStage url={url} className="max-h-[min(70vh,760px)]" />
      }
      sideTitle="反推说明"
      sideMeta="图 → 提示词"
      side={
        <StudioSidePanels
          defaultOpen={["how", "preset"]}
          items={[
            {
              id: "how",
              title: "怎么用",
              icon: <Sparkles />,
              content: (
                <p className="text-[13px] leading-relaxed text-white/65">
                  底部选择支持识图的语言模型，点击「生成」后才会提交。若图片节点已有提示词，会直接复制到新文本节点；否则按右侧指令反推一段可生图提示词。
                </p>
              ),
            },
            {
              id: "preset",
              title: "反推指令",
              icon: <MessageSquareText />,
              content: (
                <pre className="whitespace-pre-wrap rounded-lg border border-white/10 bg-black/35 px-3 py-2.5 text-[12px] leading-relaxed text-white/70">
                  {IMAGE_PROMPT_REVERSE_PRESET.trim()}
                </pre>
              ),
            },
          ]}
        />
      }
      sideFoot="结果会写到画布右侧的文本节点"
      footerHint={
        modelsError || "先选模型，再点生成 · 不会在打开弹框时自动反推"
      }
      footerActions={
        <>
          <ComposerModelMenu
            models={visionModels}
            selectedId={modelId}
            onSelect={setModelId}
            emptyLabel="暂无可用的语言模型"
            align="end"
            contentClassName="joy-studio-popover"
            contentProps={{ "data-canvas-shortcuts-ignore": true }}
          >
            <button
              type="button"
              className="joy-studio-shell__chip gap-2"
              disabled={!visionModels.length}
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
              onConfirm({ modelId });
            }}
          >
            生成
          </button>
        </>
      }
    />
  );
}
