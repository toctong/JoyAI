"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  Download,
  ImageIcon,
  Loader2,
  MapPin,
  Package,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  UserRound,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhotoView, JoyPhotoProvider } from "@/shared/ui/joy-photo-preview";
import { toast } from "@/shared/lib/toast";
import { confirmDialog } from "@/shared/lib/confirm";
import { cn } from "@/shared/lib/utils";
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
import { manjuAssetHref } from "../studio/manju-studio-routes";
import {
  ManjuAssetFallbackDialog,
  MANJU_ASSET_FALLBACK_EVENT,
} from "../studio/manju-asset-fallback-dialog";

const TABS: {
  kind: ManjuAssetDraft["kind"];
  label: string;
  icon: typeof UserRound;
}[] = [
  { kind: "character", label: "角色", icon: UserRound },
  { kind: "scene", label: "场景", icon: MapPin },
  { kind: "prop", label: "道具", icon: Package },
];

export function AssetsStep({
  project,
  lockedKind,
}: {
  project: ManjuProjectDraft;
  lockedKind?: ManjuAssetDraft["kind"];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<ManjuAssetDraft["kind"]>(
    lockedKind ?? "character",
  );
  const [search, setSearch] = useState("");
  const [batchMode, setBatchMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [submitting, setSubmitting] = useState(false);
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const cancelledIdsRef = useRef(new Set<string>());
  const batchAbortRef = useRef(false);
  const addAsset = useManjuStore((s) => s.addAsset);
  const updateAsset = useManjuStore((s) => s.updateAsset);
  const removeAsset = useManjuStore((s) => s.removeAsset);
  const bindJobToAsset = useManjuStore((s) => s.bindJobToAsset);

  const activeKind = lockedKind ?? tab;
  const roots = rootAssets(project.assets, activeKind).filter((a) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const blob = `${a.name} ${a.description} ${(a.aliases ?? []).join(" ")}`.toLowerCase();
    return blob.includes(q);
  });
  const kindLabel = TABS.find((t) => t.kind === activeKind)?.label ?? "资产";
  const analyzing = useManjuStore((s) => Boolean(s.analyzingIds[project.id]));

  useEffect(() => {
    const onFallback = (ev: Event) => {
      const detail = (ev as CustomEvent<{ projectId?: string }>).detail;
      if (detail?.projectId === project.id) setFallbackOpen(true);
    };
    window.addEventListener(MANJU_ASSET_FALLBACK_EVENT, onFallback);
    return () =>
      window.removeEventListener(MANJU_ASSET_FALLBACK_EVENT, onFallback);
  }, [project.id]);

  const openDetail = (assetId: string) => {
    router.push(manjuAssetHref(project.id, activeKind, assetId));
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitBatch = () => {
    setBatchMode(false);
    setSelected(new Set());
  };

  const duplicateAsset = (asset: ManjuAssetDraft) => {
    const id = addAsset(project.id, asset.kind, asset.parentId ?? undefined);
    updateAsset(project.id, id, {
      name: `${asset.name.trim() || "未命名"} 副本`,
      description: asset.description,
      aliases: [...(asset.aliases ?? [])],
    });
    toast.message("已复制");
  };

  const isStarred = (asset: ManjuAssetDraft) =>
    (asset.aliases ?? []).includes("星标");

  const toggleStar = (asset: ManjuAssetDraft) => {
    const next = new Set(asset.aliases ?? []);
    if (next.has("星标")) next.delete("星标");
    else next.add("星标");
    updateAsset(project.id, asset.id, { aliases: [...next] });
  };

  const downloadAssetImage = async (asset: ManjuAssetDraft) => {
    const url = asset.imageUrl?.trim();
    if (!url) {
      toast.message("暂无图片可下载");
      return;
    }
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      const stem = (asset.name.trim() || asset.id.slice(0, 8)).replace(
        /[\\/:*?"<>|]+/g,
        "_",
      );
      a.download = `${stem}.png`;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const settleAsset = (asset: ManjuAssetDraft) => {
    updateAsset(project.id, asset.id, {
      jobId: null,
      status: asset.imageUrl ? "succeeded" : "idle",
    });
  };

  const generateOne = async (
    asset: ManjuAssetDraft,
  ): Promise<"ok" | "fail" | "stop"> => {
    if (!asset.name.trim()) return "fail";
    if (cancelledIdsRef.current.has(asset.id) || batchAbortRef.current) {
      cancelledIdsRef.current.delete(asset.id);
      settleAsset(asset);
      return "stop";
    }
    markManjuAssetSubmitPending(asset.id);
    try {
      updateAsset(project.id, asset.id, { status: "queued", jobId: null });
      const parent = asset.parentId
        ? project.assets.find((a) => a.id === asset.parentId)
        : null;
      const job = await submitImageJob({
        prompt: buildAssetPrompt(asset, project.settings, project.assets),
        ratio: preferredAssetRatio(asset.kind),
        modelId: project.settings.imageModelId,
        manjuProjectId: project.id,
        referenceAssetIds: parent?.assetId ? [parent.assetId] : undefined,
        referenceUrls:
          parent?.imageUrl && !parent.assetId ? [parent.imageUrl] : undefined,
      });
      if (
        cancelledIdsRef.current.has(asset.id) ||
        batchAbortRef.current
      ) {
        cancelledIdsRef.current.delete(asset.id);
        settleAsset(asset);
        void cancelManjuJob(job.id).catch(() => undefined);
        return "stop";
      }
      bindJobToAsset(project.id, asset.id, job.id, "queued");
      return "ok";
    } catch {
      if (cancelledIdsRef.current.has(asset.id)) {
        cancelledIdsRef.current.delete(asset.id);
        settleAsset(asset);
        return "stop";
      }
      updateAsset(project.id, asset.id, { jobId: null, status: "failed" });
      return "fail";
    } finally {
      clearManjuAssetSubmitPending(asset.id);
    }
  };

  const batchGenerate = async () => {
    const targets = roots.filter(
      (a) =>
        selected.has(a.id) &&
        a.name.trim() &&
        !isBusyStatus(a.status),
    );
    if (targets.length === 0) {
      toast.message("请先勾选可生成的资产（需有名称且未在生成中）");
      return;
    }
    batchAbortRef.current = false;
    setSubmitting(true);
    const toastId = toast.loading(`正在提交 ${targets.length} 个${kindLabel}图…`);
    let ok = 0;
    let fail = 0;
    let stop = 0;
    try {
      for (const asset of targets) {
        if (batchAbortRef.current) {
          stop += 1;
          continue;
        }
        cancelledIdsRef.current.delete(asset.id);
        const result = await generateOne(asset);
        if (result === "ok") ok += 1;
        else if (result === "stop") stop += 1;
        else fail += 1;
      }
      toast.dismiss(toastId);
      if (ok > 0 && fail === 0 && stop === 0) {
        toast.success(`已提交 ${ok} 个${kindLabel}图`);
      } else if (ok > 0) {
        toast.message(`已提交 ${ok} 个，失败 ${fail}，跳过 ${stop}`);
      } else {
        toast.error(fail > 0 ? `${fail} 个提交失败` : "未提交任何任务");
      }
    } finally {
      toast.dismiss(toastId);
      setSubmitting(false);
    }
  };

  /** 一键为缺失参考图的角色提交定妆图 */
  const generateMissingPortraits = async () => {
    const targets = rootAssets(project.assets, "character").filter(
      (a) =>
        a.name.trim() &&
        !a.imageUrl &&
        !a.assetId &&
        !isBusyStatus(a.status),
    );
    if (targets.length === 0) {
      toast.message("没有缺少参考图的角色");
      return;
    }
    const ok = await confirmDialog({
      title: "一键角色定妆？",
      description: `将为 ${targets.length} 个无参考图角色提交定妆生图（${targets
        .map((a) => a.name)
        .slice(0, 6)
        .join("、")}${targets.length > 6 ? "…" : ""}）。`,
      confirmText: "开始定妆",
      cancelText: "取消",
    });
    if (!ok) return;
    batchAbortRef.current = false;
    setSubmitting(true);
    const toastId = toast.loading(`正在提交定妆 0/${targets.length}…`);
    let done = 0;
    let fail = 0;
    try {
      for (const asset of targets) {
        if (batchAbortRef.current) break;
        const result = await generateOne(asset);
        done += 1;
        if (result !== "ok") fail += 1;
        toast.loading(`正在提交定妆 ${done}/${targets.length}…`, {
          id: toastId,
        });
      }
      toast.dismiss(toastId);
      if (fail === 0) toast.success(`已提交 ${done} 个角色定妆`);
      else toast.message(`已提交 ${done - fail} 个，失败 ${fail}`);
    } finally {
      toast.dismiss(toastId);
      setSubmitting(false);
    }
  };

  const batchExport = () => {
    const items = roots.filter((a) => selected.has(a.id));
    if (items.length === 0) {
      toast.message("请先勾选要导出的资产");
      return;
    }
    const payload = {
      projectId: project.id,
      projectTitle: project.title,
      kind: activeKind,
      exportedAt: new Date().toISOString(),
      assets: items.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        aliases: a.aliases ?? [],
        parentId: a.parentId,
        imageUrl: a.imageUrl,
        assetId: a.assetId,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stem = (project.title || "manju").replace(/[\\/:*?"<>|]+/g, "_");
    a.download = `${stem}_${kindLabel}_${items.length}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`已导出 ${items.length} 个${kindLabel}`);
  };

  const batchDelete = async () => {
    if (selected.size === 0) {
      toast.message("请先勾选要删除的资产");
      return;
    }
    const ok = await confirmDialog({
      title: `删除所选${kindLabel}？`,
      description: `将删除 ${selected.size} 项，不可恢复。`,
      confirmText: "删除",
      cancelText: "取消",
      destructive: true,
    });
    if (!ok) return;
    const ids = [...selected];
    for (const id of ids) removeAsset(project.id, id);
    setSelected(new Set());
    toast.success(`已删除 ${ids.length} 项`);
  };

  const renderCard = (asset: ManjuAssetDraft, nested = false) => {
    const busy = isBusyStatus(asset.status);
    const waitLabel =
      asset.status === "queued" ? "排队中…" : busy ? "生成中…" : null;
    const reg = assetRegistryName(asset, project.assets);
    const kids = nested ? [] : childAssets(project.assets, asset.id);
    const titleLine = asset.description.trim()
      ? `${asset.name.trim() || "未命名"} · ${asset.description.trim().slice(0, 48)}`
      : asset.name.trim() || "未命名";
    const checked = selected.has(asset.id);
    return (
      <div
        key={asset.id}
        className={cn(
          "manju-asset-card-wrap",
          nested && "manju-asset-card-wrap--nested",
        )}
      >
        <article
          className={cn(
            "manju-lore-card",
            batchMode && "is-batch",
            checked && "is-selected",
          )}
          role="button"
          tabIndex={0}
          onClick={() => {
            if (batchMode) toggleSelect(asset.id);
            else openDetail(asset.id);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (batchMode) toggleSelect(asset.id);
              else openDetail(asset.id);
            }
          }}
        >
          <div className="manju-lore-card__media">
            {isStarred(asset) ? (
              <span className="manju-lore-card__badge">星标</span>
            ) : null}
            {batchMode ? (
              <span
                className={cn(
                  "manju-lore-card__check",
                  checked && "is-on",
                )}
                aria-hidden
              />
            ) : null}
            {asset.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={asset.imageUrl}
                alt={reg}
                className="manju-lore-card__img"
              />
            ) : (
              <div className="manju-lore-card__placeholder">
                {activeKind === "character" ? (
                  <UserRound className="size-10 opacity-40" />
                ) : activeKind === "scene" ? (
                  <MapPin className="size-10 opacity-40" />
                ) : (
                  <Package className="size-10 opacity-40" />
                )}
                <span>暂无图片</span>
              </div>
            )}
            {waitLabel ? (
              <div className="manju-lore-card__busy" aria-live="polite">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>{waitLabel}</span>
              </div>
            ) : null}
            {!batchMode ? (
              <div
                className="manju-lore-card__hover"
                onClick={(e) => e.stopPropagation()}
              >
                {!asset.imageUrl && asset.name.trim() && !busy ? (
                  <button
                    type="button"
                    className="manju-lore-card__hover-btn"
                    title={
                      activeKind === "character" ? "生成定妆图" : "生成参考图"
                    }
                    aria-label={
                      activeKind === "character" ? "生成定妆图" : "生成参考图"
                    }
                    disabled={submitting}
                    onClick={() => void generateOne(asset)}
                  >
                    <Wand2 className="size-3.5" />
                  </button>
                ) : null}
                <button
                  type="button"
                  className={cn(
                    "manju-lore-card__hover-btn",
                    isStarred(asset) && "is-star",
                  )}
                  title={isStarred(asset) ? "取消星标" : "星标"}
                  aria-label={isStarred(asset) ? "取消星标" : "星标"}
                  onClick={() => toggleStar(asset)}
                >
                  <Star
                    className="size-3.5"
                    fill={isStarred(asset) ? "currentColor" : "none"}
                  />
                </button>
                <button
                  type="button"
                  className="manju-lore-card__hover-btn"
                  title="下载"
                  aria-label="下载"
                  onClick={() => void downloadAssetImage(asset)}
                >
                  <Download className="size-3.5" />
                </button>
                {asset.imageUrl ? (
                  <PhotoView src={asset.imageUrl}>
                    <button
                      type="button"
                      className="manju-lore-card__hover-btn"
                      title="预览"
                      aria-label="预览"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ImageIcon className="size-3.5" />
                    </button>
                  </PhotoView>
                ) : (
                  <button
                    type="button"
                    className="manju-lore-card__hover-btn"
                    title="预览"
                    aria-label="预览"
                    onClick={() => toast.message("暂无图片可预览")}
                  >
                    <ImageIcon className="size-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  className="manju-lore-card__hover-btn"
                  title="复制"
                  aria-label="复制"
                  onClick={() => duplicateAsset(asset)}
                >
                  <Copy className="size-3.5" />
                </button>
                <button
                  type="button"
                  className="manju-lore-card__hover-btn is-danger"
                  title="删除"
                  aria-label="删除"
                  onClick={() => removeAsset(project.id, asset.id)}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ) : null}
          </div>
          <div className="manju-lore-card__body">
            <h3 className="manju-lore-card__title" title={titleLine}>
              {titleLine}
            </h3>
          </div>
        </article>
        {kids.map((child) => renderCard(child, true))}
      </div>
    );
  };

  return (
    <JoyPhotoProvider>
      <div className="manju-lore">
        <ManjuAssetFallbackDialog
          projectId={project.id}
          open={fallbackOpen}
          onOpenChange={setFallbackOpen}
        />
        <div className="manju-lore__sticky manju-studio__sticky-bar">
          <div className="manju-studio__page-head">
            <label className="manju-studio__page-search">
              <Search className="manju-studio__page-search-icon" aria-hidden />
              <input
                type="search"
                placeholder={`搜索${kindLabel}`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label={`搜索${kindLabel}`}
              />
            </label>
            {!lockedKind ? (
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
            ) : null}
            <div className="manju-studio__page-actions">
              {activeKind === "character" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={submitting}
                  onClick={() => void generateMissingPortraits()}
                >
                  <Wand2 className="size-3.5" />
                  一键定妆缺失角色
                </Button>
              ) : null}
              {project.assets.length === 0 && project.scriptText.trim() ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFallbackOpen(true)}
                >
                  手动登记角色
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (batchMode) exitBatch();
                  else setBatchMode(true);
                }}
              >
                {batchMode ? "退出批量" : "批量操作"}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  const id = addAsset(project.id, activeKind);
                  router.push(manjuAssetHref(project.id, activeKind, id));
                }}
              >
                <Plus className="size-3.5" />
                新增{kindLabel}
              </Button>
            </div>
          </div>

          {batchMode ? (
            <div className="manju-lore-batch">
              <label className="manju-lore-batch__count">
                <input
                  type="checkbox"
                  checked={
                    roots.length > 0 && selected.size === roots.length
                  }
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelected(new Set(roots.map((r) => r.id)));
                    } else {
                      setSelected(new Set());
                    }
                  }}
                />
                <span>
                  已选择 / {selected.size}
                  <span className="manju-lore-batch__count-unit">项</span>
                </span>
              </label>
              <div className="manju-lore-batch__actions">
                <button
                  type="button"
                  disabled={selected.size === 0 || submitting}
                  onClick={() => void batchGenerate()}
                >
                  <Wand2 className="size-3.5" />
                  {submitting ? "提交中…" : "批量生图"}
                </button>
                <button
                  type="button"
                  disabled={selected.size === 0 || submitting}
                  onClick={batchExport}
                >
                  <Download className="size-3.5" />
                  批量导出
                </button>
                <button
                  type="button"
                  disabled={selected.size === 0 || submitting}
                  onClick={() => void batchDelete()}
                >
                  <Trash2 className="size-3.5" />
                  批量删除
                </button>
              </div>
              <button
                type="button"
                className="manju-lore-batch__cancel"
                disabled={submitting}
                onClick={exitBatch}
              >
                取消
              </button>
            </div>
          ) : null}
        </div>

        {roots.length === 0 && !search.trim() ? (
          <div className="manju-assets-empty">
            {analyzing ? (
              <>
                <div className="manju-assets-empty__visual" aria-hidden>
                  <Sparkles className="manju-assets-empty__spark" />
                </div>
                <p className="manju-assets-empty__title">正在解析剧本…</p>
                <p className="manju-assets-empty__desc">
                  AI 正在解析剧本并写入资产，也可手动新建后批量生图
                </p>
              </>
            ) : (
              <>
                <div className="manju-assets-empty__visual" aria-hidden>
                  <span className="manju-assets-empty__box" />
                  <span className="manju-assets-empty__beam" />
                </div>
                <p className="manju-assets-empty__title">暂无{kindLabel}</p>
                <p className="manju-assets-empty__desc">
                  {activeKind === "character"
                    ? "可从剧本抽取角色，或手动新建后补充参考图"
                    : activeKind === "scene"
                      ? "可先解析剧本自动写入，或手动新建场景并补充参考图"
                      : "可先解析剧本自动写入，或手动新建道具并补充参考图"}
                </p>
                <div className="manju-assets-empty__actions">
                  {project.scriptText.trim() && activeKind === "character" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setFallbackOpen(true)}
                    >
                      从剧本抽取 / 粘贴角色
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      const id = addAsset(project.id, activeKind);
                      router.push(manjuAssetHref(project.id, activeKind, id));
                    }}
                  >
                    <Plus className="size-3.5" />
                    新建{kindLabel}
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : roots.length === 0 && search.trim() ? (
          <div className="manju-assets-empty">
            <div className="manju-assets-empty__visual" aria-hidden>
              <Search className="manju-assets-empty__spark opacity-50" />
            </div>
            <p className="manju-assets-empty__title">没有匹配的{kindLabel}</p>
            <p className="manju-assets-empty__desc">试试其他关键词</p>
          </div>
        ) : (
          <div className="manju-lore-grid">
            <button
              type="button"
              className="manju-lore-create"
              onClick={() => {
                const id = addAsset(project.id, activeKind);
                router.push(manjuAssetHref(project.id, activeKind, id));
              }}
            >
              <span className="manju-lore-create__plus">
                <Plus className="size-6" />
              </span>
              <span>新建{kindLabel}</span>
            </button>
            {roots.map((asset) => renderCard(asset))}
          </div>
        )}
      </div>
    </JoyPhotoProvider>
  );
}
