"use client";

import { useState } from "react";
import {
  Loader2,
  MapPin,
  Package,
  Plus,
  Sparkles,
  Trash2,
  UserRound,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhotoView, JoyPhotoProvider } from "@/shared/ui/joy-photo-preview";
import { apiUpload } from "@/shared/lib/api";
import { toast } from "@/shared/lib/toast";
import { cn } from "@/shared/lib/utils";
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
  const removeAsset = useManjuStore((s) => s.removeAsset);
  const bindJobToAsset = useManjuStore((s) => s.bindJobToAsset);
  const mergeExtractedAssets = useManjuStore((s) => s.mergeExtractedAssets);
  const autoLinkShotAssets = useManjuStore((s) => s.autoLinkShotAssets);

  const activeKind = lockedKind ?? tab;
  const list = project.assets.filter((a) => a.kind === activeKind);

  const generate = async (asset: ManjuAssetDraft) => {
    if (!asset.name.trim()) {
      toast.error("请先填写名称");
      return;
    }
    try {
      updateAsset(project.id, asset.id, { status: "queued", jobId: null });
      const job = await submitImageJob({
        prompt: buildAssetPrompt(asset, project.settings),
        ratio: preferredAssetRatio(asset.kind),
        modelId: project.settings.imageModelId,
      });
      bindJobToAsset(project.id, asset.id, job.id, "queued");
      toast.success("已提交资产图生成");
    } catch (e) {
      updateAsset(project.id, asset.id, { jobId: null, status: "failed" });
      toast.error(e instanceof Error ? e.message : "提交失败");
    }
  };

  const generateMissing = async () => {
    const targets = list.filter(
      (a) => a.name.trim() && !a.imageUrl && !isBusyStatus(a.status),
    );
    if (targets.length === 0) {
      toast.message("当前分类没有待生成资产");
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
            const count = project.assets.filter((a) => a.kind === kind).length;
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
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fromScript}
            disabled={!project.scriptText.trim()}
          >
            <Wand2 className="h-4 w-4" />
            从剧本提取
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void generateMissing()}
            disabled={list.length === 0}
          >
            <Sparkles className="h-4 w-4" />
            批量出图
          </Button>
          <Button size="sm" onClick={() => addAsset(project.id, activeKind)}>
            <Plus className="h-4 w-4" />
            新增{TABS.find((t) => t.kind === activeKind)?.label}
          </Button>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="manju-card text-center">
          <p className="manju-card__desc">
            还没有{TABS.find((t) => t.kind === activeKind)?.label}
            。可从剧本提取，或手动添加后生成一致性参考图。
          </p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {list.map((asset) => {
            const busy = isBusyStatus(asset.status);
            return (
              <article key={asset.id} className="manju-asset-card">
                <div className="manju-asset-card__media">
                  {asset.imageUrl ? (
                    <PhotoView src={asset.imageUrl}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={asset.imageUrl}
                        alt={asset.name}
                        className="cursor-zoom-in"
                      />
                    </PhotoView>
                  ) : busy ? (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin" />
                      生成中…
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      暂无参考图
                    </span>
                  )}
                </div>
                <div className="manju-asset-card__body">
                  <div className="flex items-start gap-2">
                    <Input
                      value={asset.name}
                      onChange={(e) =>
                        updateAsset(project.id, asset.id, {
                          name: e.target.value,
                        })
                      }
                      className="h-8 text-sm"
                    />
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
                      asset.kind === "character"
                        ? "外貌、年龄、发型服饰…（出图会自动拼三视图布局）"
                        : asset.kind === "scene"
                          ? "地点、光线、氛围…（无人全景）"
                          : "材质、造型、用途…"
                    }
                    height={100}
                    hideToolbar
                    className="mt-2"
                  />
                  {asset.kind === "character" ? (
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
                    将提交：{buildAssetPrompt(asset, project.settings)}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      {asset.status === "failed"
                        ? "生成失败"
                        : asset.status === "succeeded"
                          ? "已生成"
                          : busy
                            ? "排队/生成中"
                            : "未生成"}
                    </span>
                    <div className="flex gap-1.5">
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
                        {asset.imageUrl ? "重新生成" : "生成参考图"}
                      </Button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
    </JoyPhotoProvider>
  );
}
