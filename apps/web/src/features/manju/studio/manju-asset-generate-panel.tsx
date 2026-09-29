"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Box,
  ChevronDown,
  ImageIcon,
  Loader2,
  Sparkles,
} from "lucide-react";
import { BrandAvatar } from "@/components/admin/brand-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/shared/lib/api";
import { modelIconSrc } from "@/shared/lib/brand-icons";
import { toast } from "@/shared/lib/toast";
import { cn } from "@/shared/lib/utils";
import type { ComposerModelOption } from "@/features/studio/composer-model-menu";
import { ToolComposer } from "@/features/ai-tools/tool-composer";
import type { ToolPendingRef } from "@/features/ai-tools/use-ai-tool-job";
import { ManjuLibraryImport } from "../manju-library-import";
import { RATIO_OPTIONS, type ManjuAssetDraft } from "../manju-types";
import { preferredAssetRatio } from "../lib/prompt-builders";
import { manjuConfirmGenerateCopy } from "../lib/manju-job-labels";
import { confirmDialog } from "@/shared/lib/confirm";
import "@/features/studio/creation-composer.css";
import "@/features/ai-tools/ai-tools.css";
import "./manju-asset-generate-panel.css";

export type ManjuAssetGenMode = "txt2img" | "img2img";

const MAX_REFS = 4;

type Props = {
  asset: ManjuAssetDraft;
  initialPrompt: string;
  defaultModelId?: string;
  busy?: boolean;
  onClose: () => void;
  onGenerate: (payload: {
    mode: ManjuAssetGenMode;
    prompt: string;
    modelId: string;
    ratio: string;
    referenceAssetIds?: string[];
    referenceUrls?: string[];
  }) => void | Promise<void>;
};

function revokeRef(ref: ToolPendingRef) {
  if (ref.previewUrl.startsWith("blob:")) {
    URL.revokeObjectURL(ref.previewUrl);
  }
}

/** 资产生图：对齐工具详情左右布局（左表单 + joy-composer，右预览） */
export function ManjuAssetGeneratePanel({
  asset,
  initialPrompt,
  defaultModelId = "",
  busy = false,
  onClose,
  onGenerate,
}: Props) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [modelId, setModelId] = useState(defaultModelId);
  const [models, setModels] = useState<ComposerModelOption[]>([]);
  const [refs, setRefs] = useState<ToolPendingRef[]>([]);
  const [ratio, setRatio] = useState(preferredAssetRatio(asset.kind));

  useEffect(() => {
    setPrompt(initialPrompt);
    setModelId(defaultModelId);
    setRatio(preferredAssetRatio(asset.kind));
    setRefs((prev) => {
      prev.forEach(revokeRef);
      return [];
    });
  }, [asset.id, asset.kind, initialPrompt, defaultModelId]);

  useEffect(() => {
    let cancelled = false;
    void api<ComposerModelOption[]>("/models")
      .then((list) => {
        if (cancelled) return;
        setModels((list ?? []).filter((m) => m.kind === "image"));
      })
      .catch(() => {
        if (!cancelled) setModels([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      refs.forEach(revokeRef);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount cleanup only
  }, []);

  const selectedModel = useMemo(
    () => models.find((m) => m.id === modelId),
    [models, modelId],
  );
  const modelLabel = selectedModel?.name ?? (modelId ? "已选模型" : "自动（项目默认）");
  const modelIcon = selectedModel
    ? modelIconSrc({
        remoteId: selectedModel.remoteId,
        name: selectedModel.name,
      })
    : null;

  const addFiles = useCallback((files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    setRefs((prev) => {
      const room = Math.max(0, MAX_REFS - prev.length);
      if (room === 0) {
        toast.message(`最多 ${MAX_REFS} 张参考图`);
        return prev;
      }
      const next = list.slice(0, room).map((file) => ({
        localId: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      if (list.length > room) {
        toast.message(`最多 ${MAX_REFS} 张参考图`);
      }
      return [...prev, ...next];
    });
  }, []);

  const removeRef = useCallback((localId: string) => {
    setRefs((prev) => {
      const hit = prev.find((r) => r.localId === localId);
      if (hit) revokeRef(hit);
      return prev.filter((r) => r.localId !== localId);
    });
  }, []);

  const clearRefs = useCallback(() => {
    setRefs((prev) => {
      prev.forEach(revokeRef);
      return [];
    });
  }, []);

  const importLibraryAsRef = async (picked: {
    assetId: string;
    imageUrl: string;
    name: string;
  }) => {
    if (refs.length >= MAX_REFS) {
      toast.message(`最多 ${MAX_REFS} 张参考图`);
      return;
    }
    try {
      const res = await fetch(picked.imageUrl);
      if (!res.ok) throw new Error("拉取素材失败");
      const blob = await res.blob();
      const ext =
        blob.type === "image/jpeg"
          ? "jpg"
          : blob.type === "image/webp"
            ? "webp"
            : "png";
      const file = new File(
        [blob],
        `${picked.name.trim() || "ref"}.${ext}`,
        { type: blob.type || "image/png" },
      );
      // 带上库 assetId，提交时优先走 referenceAssetIds
      Object.assign(file, { __manjuLibAssetId: picked.assetId });
      addFiles([file]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导入参考图失败");
    }
  };

  const mode: ManjuAssetGenMode = refs.length > 0 ? "img2img" : "txt2img";
  const canSubmit = prompt.trim().length > 0 && !busy;
  const kindLabel =
    asset.kind === "character"
      ? "角色"
      : asset.kind === "scene"
        ? "场景"
        : "道具";

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("请先填写提示词");
      return;
    }
    const confirm = manjuConfirmGenerateCopy({
      kind: "image",
      scope: "asset",
      name: asset.name,
      ratio,
      refCount: refs.length,
    });
    const ok = await confirmDialog({
      title: confirm.title,
      description: confirm.description,
      confirmText: confirm.confirmText,
      cancelText: "取消",
    });
    if (!ok) return;

    const uploadedIds: string[] = [];
    for (const ref of refs) {
      const libId = (ref.file as File & { __manjuLibAssetId?: string })
        .__manjuLibAssetId;
      if (libId) {
        uploadedIds.push(libId);
        continue;
      }
      try {
        const { apiUpload } = await import("@/shared/lib/api");
        const saved = await apiUpload<{ id: string; url: string }>(
          "/upload",
          ref.file,
        );
        uploadedIds.push(saved.id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "参考图上传失败");
        return;
      }
    }

    await onGenerate({
      mode,
      prompt: prompt.trim(),
      modelId,
      ratio,
      referenceAssetIds: uploadedIds.length > 0 ? uploadedIds : undefined,
      referenceUrls: undefined,
    });
  };

  return (
    <div className="manju-asset-gen joy-tool-page">
      <aside className="joy-tool-page-sidebar manju-asset-gen__sidebar">
        <div className="joy-tool-page-sidebar-inner">
          <div className="joy-tool-page-scroll">
            <div className="joy-tool-page-body">
              <button
                type="button"
                className="joy-ai-tool-back"
                disabled={busy}
                onClick={onClose}
              >
                <ArrowLeft className="size-3.5" />
                返回图片管理
              </button>

              <div className="joy-tool-page-heading">
                <h1>AI 生图</h1>
                <p>
                  为「{asset.name.trim() || `未命名${kindLabel}`}」生成参考图。参考图可上传、粘贴或从素材库导入。
                </p>
              </div>

              <p className="joy-tool-page-hint">
                参考图可选（0–{MAX_REFS} 张）。有参考按图生图提交，无参考按文生图。
              </p>

              <div className="joy-tool-page-field">
                <span className="joy-tool-page-label">模型</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="joy-tool-model-trigger"
                      disabled={busy || models.length === 0}
                    >
                      {modelIcon ? (
                        <BrandAvatar
                          src={modelIcon}
                          label={modelLabel}
                          size={20}
                          rounded="md"
                        />
                      ) : (
                        <Box className="size-4 opacity-80" />
                      )}
                      <span className="joy-tool-model-name">{modelLabel}</span>
                      {models.length > 0 ? (
                        <ChevronDown className="joy-tool-model-chevron size-3.5" />
                      ) : null}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="joy-composer-model-menu joy-tool-model-menu"
                  >
                    <DropdownMenuItem
                      className={cn(
                        "joy-composer-model-item",
                        !modelId && "is-selected",
                      )}
                      onClick={() => setModelId("")}
                    >
                      <span className="joy-composer-model-item-text">
                        <span className="joy-composer-model-item-name">
                          自动（项目默认）
                        </span>
                      </span>
                    </DropdownMenuItem>
                    {models.map((item) => (
                      <DropdownMenuItem
                        key={item.id}
                        className={cn(
                          "joy-composer-model-item",
                          item.id === modelId && "is-selected",
                        )}
                        onClick={() => setModelId(item.id)}
                      >
                        <BrandAvatar
                          src={modelIconSrc({
                            remoteId: item.remoteId,
                            name: item.name,
                          })}
                          label={item.name}
                          size={22}
                          rounded="md"
                        />
                        <span className="joy-composer-model-item-text">
                          <span className="joy-composer-model-item-name">
                            {item.name}
                          </span>
                          {item.channel?.name ? (
                            <span className="joy-composer-model-item-id">
                              {item.channel.name}
                            </span>
                          ) : null}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="joy-tool-page-field">
                <span className="joy-tool-page-label">比例</span>
                <div className="joy-tool-options is-ratio">
                  {RATIO_OPTIONS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={cn(
                        "joy-tool-option",
                        ratio === item.id && "is-on",
                      )}
                      disabled={busy}
                      onClick={() => setRatio(item.id)}
                    >
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="joy-tool-page-field">
                <div className="manju-asset-gen__composer-head">
                  <span className="joy-tool-page-label">说明与参考</span>
                  <ManjuLibraryImport
                    kind={asset.kind}
                    disabled={busy || refs.length >= MAX_REFS}
                    label="素材库"
                    className="manju-asset-gen__lib-btn"
                    onPick={(picked) => void importLibraryAsRef(picked)}
                  />
                </div>
                <ToolComposer
                  note={prompt}
                  onNoteChange={setPrompt}
                  placeholder="描述画面内容、风格与构图…"
                  disabled={busy}
                  showRefs
                  refs={refs}
                  canAdd={refs.length < MAX_REFS}
                  uploadHint="参考图"
                  onAddFiles={addFiles}
                  onRemoveRef={removeRef}
                  onClearRefs={clearRefs}
                />
              </div>
            </div>
          </div>

          <div className="joy-tool-page-actions">
            <Button
              type="button"
              className="joy-tool-page-generate h-11"
              disabled={!canSubmit}
              onClick={() => void handleGenerate()}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {busy ? "提交中…" : "开始生成"}
            </Button>
          </div>
        </div>
      </aside>

      <section className="joy-tool-page-preview">
        <div
          className={cn(
            "joy-tool-page-preview-inner",
            !asset.imageUrl && !busy && "is-empty",
          )}
        >
          {busy && !asset.imageUrl ? (
            <div className="joy-ai-tool-empty">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="joy-ai-tool-empty-title">正在生成…</p>
              <p className="joy-ai-tool-empty-hint">任务提交后可在图片管理查看结果</p>
            </div>
          ) : asset.imageUrl ? (
            <div className="manju-asset-gen__preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={asset.imageUrl} alt={asset.name || "当前结果"} />
            </div>
          ) : (
            <div className="joy-ai-tool-empty">
              <span className="joy-ai-tool-empty-icon" aria-hidden>
                <ImageIcon className="size-5" />
              </span>
              <p className="joy-ai-tool-empty-title">暂无结果</p>
              <p className="joy-ai-tool-empty-hint">
                在左侧填写提示词并点击开始生成
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
