"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  GitBranch,
  Loader2,
  MapPin,
  Package,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  extractAssetsFromScript,
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
import { useRegisterManjuHeaderSlots } from "../manju-header-slots";

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
  const [tab, setTab] = useState<ManjuAssetDraft["kind"]>(
    lockedKind ?? "character",
  );
  const addAsset = useManjuStore((s) => s.addAsset);
  const updateAsset = useManjuStore((s) => s.updateAsset);
  const renameAsset = useManjuStore((s) => s.renameAsset);
  const removeAsset = useManjuStore((s) => s.removeAsset);
  const bindJobToAsset = useManjuStore((s) => s.bindJobToAsset);
  const mergeExtractedAssets = useManjuStore((s) => s.mergeExtractedAssets);
  const autoLinkShotAssets = useManjuStore((s) => s.autoLinkShotAssets);

  const activeKind = lockedKind ?? tab;
  const roots = rootAssets(project.assets, activeKind);
  const kindLabel = TABS.find((t) => t.kind === activeKind)?.label ?? "资产";
  const kindAssets = project.assets.filter((a) => a.kind === activeKind);
  const hasImages = kindAssets.some((a) => a.imageUrl);
  const kindBusy = kindAssets.some((a) => isBusyStatus(a.status));
  const router = useRouter();

  const generate = async (asset: ManjuAssetDraft) => {
    if (!asset.name.trim()) {
      toast.error("请先填写名称");
      return;
    }
    try {
      updateAsset(project.id, asset.id, { status: "queued", jobId: null });
      const job = await submitImageJob({
        prompt: buildAssetPrompt(asset, project.settings, project.assets),
        ratio: preferredAssetRatio(asset.kind),
        modelId: project.settings.imageModelId,
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
      bindJobToAsset(project.id, asset.id, job.id, "queued");
      toast.success("已提交资产图生成");
    } catch (e) {
      updateAsset(project.id, asset.id, { jobId: null, status: "failed" });
      toast.error(e instanceof Error ? e.message : "提交失败");
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
      toast.message(force ? "当前分类没有可重生成的资产" : "当前分类没有待生成资产");
      return;
    }
    for (const asset of targets) {
      await generate(asset);
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

  const fromScript = () => {
    const extracted = extractAssetsFromScript(project.scriptText);
    if (extracted.length === 0) {
      toast.error("剧本中未识别到资产");
      return;
    }
    const added = mergeExtractedAssets(project.id, extracted);
    autoLinkShotAssets(project.id);
    toast.success(added > 0 ? `新增 ${added} 个资产` : "没有新资产可添加");
  };

  useRegisterManjuHeaderSlots(
    null,
    {
      label: hasImages ? "重新生成" : "开始生成",
      onPrimary: () => void generateBatch(hasImages),
      onOpenSettings: () =>
        router.replace(`/manju/${project.id}?step=video-settings`),
      disabled: kindAssets.length === 0,
      loading: kindBusy,
    },
    {
      add: {
        label: `新增${kindLabel}`,
        onClick: () => addAsset(project.id, activeKind),
      },
      secondary: {
        label: "自动提取",
        onClick: fromScript,
        disabled: !project.scriptText.trim(),
      },
    },
    `${activeKind}:${hasImages}:${kindBusy}:${kindAssets.length}:${project.scriptText.length}`,
  );

  const renderCard = (asset: ManjuAssetDraft, nested = false) => {
    const busy = isBusyStatus(asset.status);
    const reg = assetRegistryName(asset, project.assets);
    const kids = nested ? [] : childAssets(project.assets, asset.id);
    return (
      <div key={asset.id} className={cn(nested && "mt-2 pl-3 border-l border-border")}>
        <article className="manju-asset-card">
          <div className="manju-asset-card__media">
            {asset.imageUrl ? (
              <PhotoView src={asset.imageUrl}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={asset.imageUrl}
                  alt={reg}
                  className="cursor-zoom-in"
                />
              </PhotoView>
            ) : busy ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                生成中…
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">暂无参考图</span>
            )}
          </div>
          <div className="manju-asset-card__body">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                {asset.parentId ? (
                  <p className="text-[10px] text-muted-foreground">
                    衍生 · @[{reg}]
                  </p>
                ) : null}
                <Input
                  value={asset.name}
                  onChange={(e) =>
                    updateAsset(project.id, asset.id, {
                      name: e.target.value,
                    })
                  }
                  onBlur={(e) => {
                    renameAsset(project.id, asset.id, e.target.value);
                  }}
                  className="h-8 text-sm"
                  placeholder={asset.parentId ? "衍生名（如战甲）" : "名称"}
                />
              </div>
              <button
                type="button"
                className="manju-icon-btn"
                aria-label="删除"
                onClick={() => removeAsset(project.id, asset.id)}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <ManjuMdField
              value={asset.description}
              onChange={(description) =>
                updateAsset(project.id, asset.id, { description })
              }
              placeholder={
                asset.parentId
                  ? "与本体的差异：换装、发型、武器…"
                  : asset.kind === "character"
                    ? "外貌、年龄、发型服饰…（出图会自动拼三视图布局）"
                    : asset.kind === "scene"
                      ? "地点、光线、氛围…（无人全景）"
                      : "材质、造型、用途…"
              }
              height={100}
              hideToolbar
              className="mt-2"
            />
            {asset.kind === "character" && !asset.parentId ? (
              <Input
                value={(asset.aliases ?? []).join("、")}
                onChange={(e) =>
                  updateAsset(project.id, asset.id, {
                    aliases: e.target.value
                      .split(/[、,，]/)
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="别名 / 外号，顿号分隔"
                className="mt-2 h-8 text-xs"
              />
            ) : null}
            <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">
              将提交：
              {buildAssetPrompt(asset, project.settings, project.assets)}
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">
                {asset.status === "failed"
                  ? "生成失败"
                  : asset.status === "succeeded"
                    ? "已生成"
                    : busy
                      ? "排队/生成中"
                      : "未生成"}
              </span>
                <div className="flex flex-wrap gap-1.5">
                {!asset.parentId && asset.kind === "character" ? (
                  <Button
                    variant="outline"
                    size="sm"
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
                  disabled={busy}
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
                  disabled={busy}
                  onFile={(file) => void uploadRef(asset, file)}
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void generate(asset)}
                >
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {asset.status === "failed"
                    ? "重试"
                    : asset.imageUrl
                      ? "重新生成"
                      : "生成参考图"}
                </Button>
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          {lockedKind ? (
            <div className="text-sm font-medium">
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
        </div>

        {roots.length === 0 ? (
          <div className="manju-assets-empty">
            <div className="manju-assets-empty__visual" aria-hidden>
              <span className="manju-assets-empty__box" />
              <span className="manju-assets-empty__beam" />
            </div>
            <p className="manju-assets-empty__title">
              还没有{kindLabel}
            </p>
            <p className="manju-assets-empty__desc">
              可从剧本自动提取，或点顶栏「新增{kindLabel}」后生成一致性参考图。角色可再加「衍生」换装。
            </p>
            <div className="manju-assets-empty__actions">
              <button
                type="button"
                className="manju-entry-card manju-entry-card--compact"
                disabled={!project.scriptText.trim()}
                onClick={fromScript}
              >
                <strong>自动提取</strong>
                <span>从剧本识别角色 / 场景 / 道具</span>
              </button>
              <button
                type="button"
                className="manju-entry-card manju-entry-card--compact"
                onClick={() => addAsset(project.id, activeKind)}
              >
                <strong>手动新增</strong>
                <span>自行填写名称与描述后出图</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="manju-assets-grid">
            {roots.map((asset) => renderCard(asset))}
          </div>
        )}
      </div>
    </JoyPhotoProvider>
  );
}
