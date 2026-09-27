"use client";

import { useRef, useState } from "react";
import {
  GitBranch,
  Loader2,
  MapPin,
  Package,
  Pencil,
  Sparkles,
  Square,
  Trash2,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhotoView, JoyPhotoProvider } from "@/shared/ui/joy-photo-preview";
import { apiUpload } from "@/shared/lib/api";
import { toast } from "@/shared/lib/toast";
import { cn } from "@/shared/lib/utils";
import { ManjuLibraryImport } from "../manju-library-import";
import { AssetRefUpload } from "../asset-ref-upload";
import { ManjuMdField } from "../manju-md-field";
import { useManjuStore } from "../manju-store";
import { submitImageJob } from "../use-manju-jobs";
import {
  buildAssetPrompt,
  isBusyStatus,
  type ManjuAssetDraft,
  type ManjuProjectDraft,
} from "../manju-types";
import { preferredAssetRatio } from "../lib/prompt-builders";
import {
  assetRegistryName,
  childAssets,
  rootAssets,
} from "../lib/asset-registry";
import { cancelManjuJob } from "../lib/cancel-manju-job";
import {
  clearManjuAssetSubmitPending,
  markManjuAssetSubmitPending,
} from "../lib/pending-asset-submit";
import { ManjuStepActions } from "../manju-step-actions";
import type {
  ManjuHeaderGenerateAction,
  ManjuHeaderTools,
} from "../manju-header-slots";

const TABS: {
  kind: ManjuAssetDraft["kind"];
  label: string;
  icon: typeof UserRound;
}[] = [
  { kind: "character", label: "角色", icon: UserRound },
  { kind: "scene", label: "场景", icon: MapPin },
  { kind: "prop", label: "道具", icon: Package },
];

function statusLabel(asset: ManjuAssetDraft, busy: boolean) {
  if (asset.status === "failed") return "失败";
  if (asset.status === "succeeded") return "已生成";
  if (asset.status === "queued") return "排队中";
  if (busy) return "生成中";
  return "未生成";
}

function descPlaceholder(asset: ManjuAssetDraft) {
  if (asset.parentId) return "与本体的差异：换装、发型、武器…";
  if (asset.kind === "character") return "外貌、年龄、发型服饰…";
  if (asset.kind === "scene") return "地点、光线、氛围…";
  return "材质、造型、用途…";
}

export function AssetsStep({
  project,
  lockedKind,
}: {
  project: ManjuProjectDraft;
  lockedKind?: ManjuAssetDraft["kind"];
}) {
  const [tab, setTab] = useState<ManjuAssetDraft["kind"]>(
    lockedKind ?? "character",
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const cancelledIdsRef = useRef(new Set<string>());
  const batchAbortRef = useRef(false);
  const addAsset = useManjuStore((s) => s.addAsset);
  const updateAsset = useManjuStore((s) => s.updateAsset);
  const renameAsset = useManjuStore((s) => s.renameAsset);
  const removeAsset = useManjuStore((s) => s.removeAsset);
  const bindJobToAsset = useManjuStore((s) => s.bindJobToAsset);

  const activeKind = lockedKind ?? tab;
  const roots = rootAssets(project.assets, activeKind);
  const kindLabel = TABS.find((t) => t.kind === activeKind)?.label ?? "资产";
  const kindAssets = project.assets.filter((a) => a.kind === activeKind);
  const hasImages = kindAssets.some((a) => a.imageUrl);
  const kindBusy = kindAssets.some((a) => isBusyStatus(a.status));
  const editing = editingId
    ? (project.assets.find((a) => a.id === editingId) ?? null)
    : null;

  const settleAsset = (asset: ManjuAssetDraft) => {
    updateAsset(project.id, asset.id, {
      jobId: null,
      status: asset.imageUrl ? "succeeded" : "idle",
    });
  };

  const generate = async (
    asset: ManjuAssetDraft,
    opts?: { silent?: boolean },
  ): Promise<boolean> => {
    if (!asset.name.trim()) {
      if (!opts?.silent) toast.error("请先填写名称");
      return false;
    }
    if (cancelledIdsRef.current.has(asset.id)) {
      cancelledIdsRef.current.delete(asset.id);
      settleAsset(asset);
      return false;
    }
    markManjuAssetSubmitPending(asset.id);
    try {
      updateAsset(project.id, asset.id, { status: "queued", jobId: null });
      const job = await submitImageJob({
        prompt: buildAssetPrompt(asset, project.settings, project.assets),
        ratio: preferredAssetRatio(asset.kind),
        modelId: project.settings.imageModelId,
        manjuProjectId: project.id,
        referenceAssetIds: asset.parentId
          ? (() => {
              const parent = project.assets.find((a) => a.id === asset.parentId);
              return parent?.assetId ? [parent.assetId] : undefined;
            })()
          : undefined,
        referenceUrls: asset.parentId
          ? (() => {
              const parent = project.assets.find((a) => a.id === asset.parentId);
              return parent?.imageUrl && !parent.assetId
                ? [parent.imageUrl]
                : undefined;
            })()
          : undefined,
      });
      if (
        cancelledIdsRef.current.has(asset.id) ||
        batchAbortRef.current
      ) {
        cancelledIdsRef.current.delete(asset.id);
        settleAsset(asset);
        void cancelManjuJob(job.id).catch(() => undefined);
        return false;
      }
      bindJobToAsset(project.id, asset.id, job.id, "queued");
      if (!opts?.silent) {
        toast.success(`「${asset.name.trim()}」已提交生成`);
      }
      return true;
    } catch (e) {
      if (cancelledIdsRef.current.has(asset.id)) {
        cancelledIdsRef.current.delete(asset.id);
        settleAsset(asset);
        return false;
      }
      updateAsset(project.id, asset.id, { jobId: null, status: "failed" });
      if (!opts?.silent) {
        toast.error(e instanceof Error ? e.message : "提交失败");
      }
      return false;
    } finally {
      clearManjuAssetSubmitPending(asset.id);
    }
  };

  const stopAsset = async (
    asset: ManjuAssetDraft,
    opts?: { silent?: boolean },
  ) => {
    cancelledIdsRef.current.add(asset.id);
    const jobId = asset.jobId?.trim() ?? "";
    settleAsset(asset);
    if (!jobId) {
      if (!opts?.silent) toast.message(`已停止「${asset.name.trim() || "未命名"}」`);
      return;
    }
    try {
      await cancelManjuJob(jobId);
      if (!opts?.silent) toast.message(`已停止「${asset.name.trim() || "未命名"}」`);
    } catch (e) {
      if (!opts?.silent) {
        toast.error(e instanceof Error ? e.message : "停止失败");
      }
    }
  };

  const stopBatch = async () => {
    batchAbortRef.current = true;
    const targets = useManjuStore
      .getState()
      .projects.find((p) => p.id === project.id)
      ?.assets.filter(
        (a) => a.kind === activeKind && isBusyStatus(a.status),
      ) ?? kindAssets.filter((a) => isBusyStatus(a.status));

    if (targets.length === 0) {
      toast.message("当前没有进行中的生成");
      return;
    }

    setStopping(true);
    try {
      await Promise.all(targets.map((asset) => stopAsset(asset, { silent: true })));
      toast.message(`已停止 ${targets.length} 个${kindLabel}生成`);
    } finally {
      setStopping(false);
    }
  };

  const generateBatch = async (force: boolean) => {
    const targets = project.assets.filter(
      (a) =>
        a.kind === activeKind &&
        a.name.trim() &&
        !isBusyStatus(a.status) &&
        (force || !a.imageUrl),
    );
    if (targets.length === 0) {
      toast.message(
        force ? "当前分类没有可重生成的资产" : "当前分类没有待生成资产",
      );
      return;
    }

    batchAbortRef.current = false;
    setSubmitting(true);

    const toastId = toast.loading(
      `正在提交 ${targets.length} 个${kindLabel}图…`,
    );
    let ok = 0;
    let failed = 0;
    let stopped = 0;
    try {
      for (const asset of targets) {
        if (batchAbortRef.current) {
          stopped += 1;
          continue;
        }
        cancelledIdsRef.current.delete(asset.id);
        const passed = await generate(asset, { silent: true });
        if (passed) ok += 1;
        else if (batchAbortRef.current || cancelledIdsRef.current.has(asset.id)) {
          stopped += 1;
          cancelledIdsRef.current.delete(asset.id);
        } else failed += 1;
      }
      toast.dismiss(toastId);
      if (batchAbortRef.current || stopped > 0) {
        toast.message(
          ok > 0
            ? `已提交 ${ok} 个，已停止其余`
            : `已停止提交（未发出 ${stopped || targets.length - ok} 个）`,
        );
      } else if (failed === 0) {
        toast.success(`已提交 ${ok} 个${kindLabel}图，生成中…`);
      } else if (ok === 0) {
        toast.error(`${failed} 个提交失败`);
      } else {
        toast.message(`已提交 ${ok} 个，失败 ${failed} 个`);
      }
    } finally {
      toast.dismiss(toastId);
      setSubmitting(false);
    }
  };

  const uploadRef = async (asset: ManjuAssetDraft, file: File) => {
    try {
      updateAsset(project.id, asset.id, { status: "running" });
      const saved = await apiUpload<{ id: string; url: string }>(
        "/upload",
        file,
      );
      updateAsset(project.id, asset.id, {
        imageUrl: saved.url,
        assetId: saved.id,
        jobId: null,
        status: "succeeded",
      });
      useManjuStore.getState().markStepComplete(project.id, "assets");
      toast.success("参考图已上传");
    } catch (e) {
      updateAsset(project.id, asset.id, { status: "failed" });
      toast.error(e instanceof Error ? e.message : "上传失败");
    }
  };

  const stepTools: ManjuHeaderTools = {
    add: {
      label: `新增${kindLabel}`,
      onClick: () => addAsset(project.id, activeKind),
      disabled: submitting || stopping,
    },
    secondary:
      kindBusy || submitting
        ? {
            label: stopping ? "停止中…" : "停止全部",
            onClick: () => void stopBatch(),
            disabled: stopping,
            loading: stopping,
          }
        : undefined,
  };

  const stepGenerate: ManjuHeaderGenerateAction = {
    label: hasImages ? "重新生成" : "开始生成",
    onPrimary: () => void generateBatch(hasImages),
    disabled: kindAssets.length === 0 || submitting || stopping || kindBusy,
    loading: submitting,
    emphasis: kindAssets.length > 0 && !hasImages,
    title:
      kindAssets.length === 0
        ? "先新增或回剧本做 AI 分析"
        : hasImages
          ? "可批量重出参考图"
          : "点这里批量出参考图",
  };

  const closeEdit = () => {
    if (editing) {
      renameAsset(project.id, editing.id, editing.name);
    }
    setEditingId(null);
  };

  const renderCard = (asset: ManjuAssetDraft, nested = false) => {
    const busy = isBusyStatus(asset.status);
    const waitLabel =
      asset.status === "queued" ? "排队中…" : busy ? "生成中…" : null;
    const reg = assetRegistryName(asset, project.assets);
    const kids = nested ? [] : childAssets(project.assets, asset.id);
    const aliases = (asset.aliases ?? []).filter(Boolean);
    return (
      <div
        key={asset.id}
        className={cn(
          "manju-asset-card-wrap",
          nested && "mt-2 border-l border-border pl-3",
        )}
      >
        <article
          className="manju-asset-card manju-asset-card--interactive"
          role="button"
          tabIndex={0}
          onClick={() => setEditingId(asset.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setEditingId(asset.id);
            }
          }}
        >
          <div
            className="manju-asset-card__media"
            onClick={(e) => e.stopPropagation()}
          >
            <span
              className={cn(
                "manju-asset-card__tag",
                asset.status === "failed" && "is-failed",
                asset.status === "succeeded" && "is-ok",
                busy && "is-busy",
              )}
            >
              {statusLabel(asset, busy)}
            </span>
            {asset.imageUrl ? (
              <PhotoView src={asset.imageUrl}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={asset.imageUrl}
                  alt={reg}
                  className="cursor-zoom-in"
                />
              </PhotoView>
            ) : !busy ? (
              <span className="text-xs text-muted-foreground">暂无参考图</span>
            ) : null}
            {waitLabel ? (
              <div className="manju-asset-card__busy" aria-live="polite">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>{waitLabel}</span>
              </div>
            ) : null}
          </div>
          <div className="manju-asset-card__body">
            <div
              className="manju-asset-card__top"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="min-w-0 flex-1 space-y-0.5">
                {asset.parentId ? (
                  <p className="manju-asset-card__badge">衍生 · @[{reg}]</p>
                ) : null}
                <h3 className="manju-asset-card__title">
                  {asset.name.trim() || "未命名"}
                </h3>
              </div>
              <button
                type="button"
                className="manju-icon-btn"
                aria-label="编辑"
                onClick={() => setEditingId(asset.id)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="manju-icon-btn"
                aria-label="删除"
                onClick={() => removeAsset(project.id, asset.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              type="button"
              className="manju-asset-card__desc-text"
              onClick={() => setEditingId(asset.id)}
            >
              {asset.description.trim() || (
                <span className="opacity-50">{descPlaceholder(asset)}</span>
              )}
            </button>
            {asset.kind === "character" && !asset.parentId ? (
              <p className="manju-asset-card__alias-text">
                {aliases.length > 0 ? (
                  <>别名：{aliases.join("、")}</>
                ) : (
                  <span className="opacity-50">暂无别名</span>
                )}
              </p>
            ) : null}
            <p
              className="manju-asset-card__prompt"
              title={buildAssetPrompt(asset, project.settings, project.assets)}
            >
              {buildAssetPrompt(asset, project.settings, project.assets)}
            </p>
            <div
              className="manju-asset-card__footer"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="manju-asset-card__actions">
                {!asset.parentId && asset.kind === "character" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="manju-asset-card__action"
                    disabled={busy || submitting || stopping}
                    onClick={() => {
                      const parent = project.assets.find(
                        (a) => a.id === asset.id,
                      );
                      if (parent && !parent.imageUrl) {
                        toast.message("建议先出本体参考图，再做衍生换装");
                      }
                      addAsset(project.id, asset.kind, asset.id);
                      toast.message("已添加衍生，请填写造型差异");
                    }}
                  >
                    <GitBranch className="h-3.5 w-3.5" />
                    衍生
                  </Button>
                ) : null}
                <ManjuLibraryImport
                  kind={asset.kind}
                  disabled={busy || submitting || stopping}
                  onPick={({ assetId, imageUrl, name }) => {
                    updateAsset(project.id, asset.id, {
                      imageUrl,
                      assetId,
                      jobId: null,
                      status: "succeeded",
                      name: asset.name.trim() ? asset.name : name,
                    });
                    useManjuStore
                      .getState()
                      .markStepComplete(project.id, "assets");
                  }}
                />
                <AssetRefUpload
                  disabled={busy || submitting || stopping}
                  onFile={(file) => void uploadRef(asset, file)}
                />
                {busy ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="manju-asset-card__action manju-asset-card__action--stop"
                    disabled={stopping}
                    onClick={() => void stopAsset(asset)}
                  >
                    <Square className="h-3 w-3 fill-current" />
                    停止
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="manju-asset-card__action manju-asset-card__action--primary"
                    disabled={submitting || stopping}
                    onClick={() => void generate(asset)}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {asset.status === "failed"
                      ? "重试"
                      : asset.imageUrl
                        ? "重生成"
                        : "生成"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </article>
        {kids.map((child) => renderCard(child, true))}
      </div>
    );
  };

  return (
    <JoyPhotoProvider>
      <div className="manju-panel">
        <div className="manju-step-bar">
          {lockedKind ? (
            <div className="text-base">
              {TABS.find((t) => t.kind === lockedKind)?.label}库
            </div>
          ) : (
            <div className="manju-tabs">
              {TABS.map(({ kind, label, icon: Icon }) => {
                const count = project.assets.filter(
                  (a) => a.kind === kind,
                ).length;
                return (
                  <button
                    key={kind}
                    type="button"
                    className={cn(
                      "manju-tab",
                      tab === kind && "manju-tab--active",
                    )}
                    onClick={() => setTab(kind)}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                    <span className="opacity-60">{count}</span>
                  </button>
                );
              })}
            </div>
          )}
          <ManjuStepActions
            tools={stepTools}
            generate={stepGenerate}
            busy={kindBusy || submitting}
          />
        </div>

        {roots.length === 0 ? (
          <div className="manju-assets-empty">
            <div className="manju-assets-empty__visual" aria-hidden>
              <span className="manju-assets-empty__box" />
              <span className="manju-assets-empty__beam" />
            </div>
            <p className="manju-assets-empty__title">还没有{kindLabel}</p>
            <div className="manju-assets-empty__actions">
              <button
                type="button"
                className="manju-entry-card manju-entry-card--compact"
                onClick={() => addAsset(project.id, activeKind)}
              >
                <strong>手动新增</strong>
              </button>
            </div>
          </div>
        ) : (
          <div className="manju-assets-grid">
            {roots.map((asset) => renderCard(asset))}
          </div>
        )}
      </div>

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) closeEdit();
        }}
      >
        <DialogContent className="manju-dialog max-w-2xl gap-4 border-border bg-card p-5 shadow-none sm:rounded-xl">
          {editing ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  编辑
                  {editing.kind === "character"
                    ? "角色"
                    : editing.kind === "scene"
                      ? "场景"
                      : "道具"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="asset-edit-name">名称</Label>
                  <Input
                    id="asset-edit-name"
                    value={editing.name}
                    onChange={(e) =>
                      updateAsset(project.id, editing.id, {
                        name: e.target.value,
                      })
                    }
                    placeholder={
                      editing.parentId ? "衍生名（如战甲）" : "名称"
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>描述</Label>
                  <ManjuMdField
                    value={editing.description}
                    onChange={(description) =>
                      updateAsset(project.id, editing.id, { description })
                    }
                    placeholder={descPlaceholder(editing)}
                    height={240}
                  />
                </div>
                {editing.kind === "character" && !editing.parentId ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="asset-edit-alias">别名 / 外号</Label>
                    <Input
                      id="asset-edit-alias"
                      value={(editing.aliases ?? []).join("、")}
                      onChange={(e) =>
                        updateAsset(project.id, editing.id, {
                          aliases: e.target.value
                            .split(/[、,，]/)
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="多个用顿号分隔"
                    />
                  </div>
                ) : null}
              </div>
              <DialogFooter>
                <Button type="button" onClick={closeEdit}>
                  完成
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </JoyPhotoProvider>
  );
}
