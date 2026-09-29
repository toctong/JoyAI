"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Download,
  Film,
  ImageIcon,
  MapPin,
  Package,
  Plus,
  Sparkles,
  Star,
  Trash2,
  Upload,
  UserRound,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/shared/lib/utils";
import { toast } from "@/shared/lib/toast";
import { confirmDialog } from "@/shared/lib/confirm";
import { ManjuExportDialog } from "../manju-export-dialog";
import { manjuStudioHref } from "../manju-studio-routes";
import { useManjuStore } from "../../manju-store";
import {
  buildShotImagePrompt,
  buildShotVideoPrompt,
  isBusyStatus,
  resolveManjuGenMode,
  type ManjuProjectDraft,
  type ManjuShotDraft,
} from "../../manju-types";
import {
  referenceMediaFromSlots,
  resolveShotReferenceSlots,
} from "../../lib/prompt-builders";
import { submitImageJob, submitVideoJob } from "../../use-manju-jobs";
import { ManjuAssetPicker } from "../../manju-asset-picker";

const SHOT_SIZES = ["远景", "全景", "中景", "近景", "特写", "大特写"] as const;
const CAMERA_ANGLES = ["平视", "俯视", "仰视", "侧面", "斜角"] as const;
const CAMERA_MOVES = [
  "固定",
  "推",
  "拉",
  "摇",
  "移",
  "跟",
  "升",
  "降",
] as const;

type GenTab = "t2i" | "i2i" | "ref_video" | "i2v";
type LibraryTab = "current" | "all";
type LibraryFilter = "all" | "image" | "video";

function shotLabel(shot: ManjuShotDraft, epIndex: number) {
  const prefix = `${epIndex}-${shot.index}`;
  const title = shot.title.trim() || shot.visual.trim().slice(0, 12) || "未命名";
  return { prefix, title, full: `${prefix} ${title}` };
}

function countAssetsByKind(
  project: ManjuProjectDraft,
  refs: string[],
): { character: number; scene: number; prop: number } {
  const set = new Set(refs);
  let character = 0;
  let scene = 0;
  let prop = 0;
  for (const a of project.assets) {
    if (!set.has(a.id)) continue;
    if (a.kind === "character") character += 1;
    else if (a.kind === "scene") scene += 1;
    else prop += 1;
  }
  return { character, scene, prop };
}

type Props = {
  projectId: string;
  episodeId: string;
};

export function EpisodeProduceWorkspace({ projectId, episodeId }: Props) {
  const project = useManjuStore((s) =>
    s.projects.find((p) => p.id === projectId),
  );
  const updateShot = useManjuStore((s) => s.updateShot);
  const addShot = useManjuStore((s) => s.addShot);
  const removeShot = useManjuStore((s) => s.removeShot);
  const bindJobToShotStoryboard = useManjuStore(
    (s) => s.bindJobToShotStoryboard,
  );
  const bindJobToShotVideo = useManjuStore((s) => s.bindJobToShotVideo);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [genTab, setGenTab] = useState<GenTab>("t2i");
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("current");
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>("all");
  const [previewKind, setPreviewKind] = useState<"image" | "video">("image");

  const episode = project?.episodes.find((e) => e.id === episodeId);
  const epIndex = Math.max(
    1,
    (project?.episodes.findIndex((e) => e.id === episodeId) ?? 0) + 1,
  );

  const shots = useMemo(
    () =>
      (project?.shots ?? [])
        .filter((s) => s.episodeId === episodeId)
        .sort((a, b) => a.index - b.index),
    [project?.shots, episodeId],
  );

  useEffect(() => {
    if (!shots.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !shots.some((s) => s.id === selectedId)) {
      setSelectedId(shots[0]!.id);
    }
  }, [shots, selectedId]);

  const selected =
    shots.find((s) => s.id === selectedId) ?? shots[0] ?? null;

  useEffect(() => {
    if (!selected) return;
    if (previewKind === "video" && !selected.videoUrl && selected.storyboardImageUrl) {
      setPreviewKind("image");
    }
  }, [selected, previewKind]);

  const libraryItems = useMemo(() => {
    if (!project) return [];
    const source =
      libraryTab === "current" && selected ? [selected] : shots;
    const items: Array<{
      id: string;
      kind: "image" | "video";
      url: string;
      shotId: string;
      label: string;
      selected: boolean;
    }> = [];
    for (const shot of source) {
      const label = shotLabel(shot, epIndex).full;
      if (
        (libraryFilter === "all" || libraryFilter === "image") &&
        shot.storyboardImageUrl
      ) {
        items.push({
          id: `${shot.id}-img`,
          kind: "image",
          url: shot.storyboardImageUrl,
          shotId: shot.id,
          label,
          selected:
            selected?.id === shot.id &&
            previewKind === "image" &&
            Boolean(shot.storyboardImageUrl),
        });
      }
      if (
        (libraryFilter === "all" || libraryFilter === "video") &&
        shot.videoUrl
      ) {
        items.push({
          id: `${shot.id}-vid`,
          kind: "video",
          url: shot.videoUrl,
          shotId: shot.id,
          label,
          selected:
            selected?.id === shot.id &&
            previewKind === "video" &&
            Boolean(shot.videoUrl),
        });
      }
    }
    return items;
  }, [
    project,
    libraryTab,
    libraryFilter,
    selected,
    shots,
    epIndex,
    previewKind,
  ]);

  if (!project) return null;

  const patchSelected = (patch: Partial<ManjuShotDraft>) => {
    if (!selected) return;
    updateShot(projectId, selected.id, patch);
  };

  const handleAddShot = () => {
    const id = addShot(projectId, undefined, { episodeId });
    setSelectedId(id);
    toast.success("已新增分镜");
  };

  const handleDeleteShot = async (shot: ManjuShotDraft) => {
    const ok = await confirmDialog({
      title: "删除分镜？",
      description: `将删除「${shotLabel(shot, epIndex).full}」。`,
      confirmText: "删除",
      cancelText: "取消",
      destructive: true,
    });
    if (!ok) return;
    removeShot(projectId, shot.id);
    toast.success("已删除分镜");
  };

  const generateImage = async () => {
    if (!selected) return;
    if (!selected.visual.trim() && !selected.imagePrompt?.trim()) {
      toast.error("请先填写分镜描述或提示词");
      return;
    }
    if (project.settings.mode === "grid") {
      toast.message("多宫格模式请回到分镜卡片页批量生成");
      return;
    }
    try {
      const slots = resolveShotReferenceSlots(selected, project);
      const { referenceAssetIds, referenceUrls } =
        referenceMediaFromSlots(slots);
      const job = await submitImageJob({
        prompt: buildShotImagePrompt(selected, project),
        ratio: project.settings.ratio,
        modelId: project.settings.imageModelId,
        manjuProjectId: project.id,
        referenceAssetIds:
          genTab === "i2i" || referenceAssetIds.length
            ? referenceAssetIds
            : undefined,
        referenceUrls:
          genTab === "i2i" || referenceUrls.length
            ? referenceUrls
            : undefined,
      });
      bindJobToShotStoryboard(projectId, selected.id, job.id, "queued");
      setPreviewKind("image");
      toast.success(`分镜 ${selected.index} 已提交生图`);
    } catch (e) {
      updateShot(projectId, selected.id, { storyboardStatus: "failed" });
      toast.error(e instanceof Error ? e.message : "提交失败");
    }
  };

  const generateVideo = async () => {
    if (!selected) return;
    if (
      !selected.visual.trim() &&
      !selected.storyboardImageUrl &&
      !selected.videoPrompt?.trim()
    ) {
      toast.error("请先完成分镜描述、提示词或分镜图");
      return;
    }
    try {
      const mode = resolveManjuGenMode(project.settings.mode);
      if (mode === "i2v" && !selected.storyboardImageUrl) {
        toast.error("图生视频需要先有分镜静帧");
        return;
      }
      const slots = resolveShotReferenceSlots(selected, project);
      const fromAssets = referenceMediaFromSlots(slots);
      const referenceAssetIds: string[] = [];
      const referenceUrls: string[] = [];
      if (mode === "ref") {
        referenceAssetIds.push(...fromAssets.referenceAssetIds);
        referenceUrls.push(...fromAssets.referenceUrls);
      } else if (selected.storyboardAssetId) {
        referenceAssetIds.push(selected.storyboardAssetId);
      } else if (selected.storyboardImageUrl) {
        referenceUrls.push(selected.storyboardImageUrl);
      }
      const duration =
        selected.duration && selected.duration > 0
          ? selected.duration
          : project.settings.duration || 5;
      const job = await submitVideoJob({
        prompt: buildShotVideoPrompt(selected, project, { mode }),
        ratio: project.settings.ratio,
        duration,
        modelId: project.settings.videoModelId,
        manjuProjectId: project.id,
        referenceAssetIds: referenceAssetIds.length
          ? referenceAssetIds
          : undefined,
        referenceUrls: referenceUrls.length ? referenceUrls : undefined,
        refMode: mode === "ref" ? "omni" : "first_last",
      });
      bindJobToShotVideo(projectId, selected.id, job.id, "queued");
      setPreviewKind("video");
      setGenTab("i2v");
      toast.success(`分镜 ${selected.index} 已提交生视频`);
    } catch (e) {
      updateShot(projectId, selected.id, { videoStatus: "failed" });
      toast.error(e instanceof Error ? e.message : "提交失败");
    }
  };

  const handleStartGenerate = () => {
    if (genTab === "i2v" || genTab === "ref_video") {
      void generateVideo();
      return;
    }
    void generateImage();
  };

  const assetCounts = selected
    ? countAssetsByKind(project, selected.assetRefs)
    : { character: 0, scene: 0, prop: 0 };

  const previewUrl =
    selected && previewKind === "video"
      ? selected.videoUrl
      : selected?.storyboardImageUrl ?? null;

  const busy =
    selected &&
    (isBusyStatus(selected.storyboardStatus) ||
      isBusyStatus(selected.videoStatus));

  const titleValue = selected?.title ?? "";
  const titleDisplay = selected
    ? shotLabel(selected, epIndex).full
    : "选择分镜";

  return (
    <div className="manju-produce">
      <header className="manju-produce__top">
        <div className="manju-produce__crumbs">
          <Link
            href={manjuStudioHref(projectId, "episode")}
            className="manju-produce__crumb"
          >
            ← 剧集管理
          </Link>
          <span className="manju-produce__crumb-sep" aria-hidden>
            ›
          </span>
          <Link
            href={manjuStudioHref(projectId, "source")}
            className="manju-produce__crumb"
          >
            剧本：{project.title || "未命名漫剧"}
          </Link>
          <span className="manju-produce__crumb-sep" aria-hidden>
            ›
          </span>
          <div className="manju-produce__ep-select">
            <Select
              value={episodeId}
              onValueChange={(id) => {
                // 同制作页内切集，不回到列表
                window.location.assign(
                  manjuStudioHref(projectId, "episode", { epId: id }),
                );
              }}
            >
              <SelectTrigger className="manju-produce__select-trigger">
                <SelectValue
                  placeholder={`#${epIndex}-${episode?.title ?? "剧集"}`}
                />
              </SelectTrigger>
              <SelectContent>
                {project.episodes.map((ep, i) => (
                  <SelectItem key={ep.id} value={ep.id}>
                    #{i + 1}-{ep.title || `第${i + 1}集`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span className="manju-produce__crumb-sep" aria-hidden>
            ›
          </span>
          <span className="manju-produce__crumb manju-produce__crumb--muted">
            风格：{project.settings.style || "默认"}
          </span>
        </div>
      </header>

      <div className="manju-produce__body">
        {/* 左：分镜表 */}
        <aside className="manju-produce__shots" aria-label="分镜表">
          <div className="manju-produce__shots-head">
            <h2>分镜表</h2>
            <span>{shots.length} 个镜头</span>
          </div>
          <div className="manju-produce__shots-list">
            {shots.length === 0 ? (
              <div className="manju-produce__shots-empty">
                <p>本集暂无分镜</p>
                <Button type="button" size="sm" onClick={handleAddShot}>
                  <Plus className="size-3.5" />
                  新增分镜
                </Button>
              </div>
            ) : (
              shots.map((shot) => {
                const label = shotLabel(shot, epIndex);
                const on = selected?.id === shot.id;
                return (
                  <button
                    key={shot.id}
                    type="button"
                    className={cn(
                      "manju-produce__shot-item",
                      on && "is-active",
                    )}
                    onClick={() => setSelectedId(shot.id)}
                  >
                    <span className="manju-produce__shot-thumb" aria-hidden>
                      {shot.storyboardImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={shot.storyboardImageUrl} alt="" />
                      ) : (
                        <ImageIcon className="size-4 opacity-40" />
                      )}
                    </span>
                    <span className="manju-produce__shot-meta">
                      <strong className="truncate">{label.full}</strong>
                      <span className="truncate">
                        {shot.visual.trim() || "暂无描述"}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <div className="manju-produce__shots-foot">
            <Button type="button" variant="outline" size="sm" onClick={handleAddShot}>
              <Plus className="size-3.5" />
              新增分镜
            </Button>
            <ManjuExportDialog
              project={project}
              episodeId={episodeId}
              trigger={
                <Button type="button" variant="outline" size="sm">
                  <Download className="size-3.5" />
                  导出
                </Button>
              }
            />
          </div>
        </aside>

        {/* 中：分镜编辑 */}
        <section className="manju-produce__editor" aria-label="分镜编辑">
          {selected ? (
            <>
              <div className="manju-produce__editor-title">
                <Input
                  value={titleValue}
                  maxLength={50}
                  placeholder={`分镜标题，如 ${epIndex}-${selected.index} 豪华全景`}
                  onChange={(e) => patchSelected({ title: e.target.value })}
                />
                <span className="manju-produce__char-count">
                  {titleValue.length}/50
                </span>
              </div>

              <div className="manju-produce__field">
                <Label>分镜描述</Label>
                <Textarea
                  value={selected.visual}
                  rows={5}
                  placeholder="描述本镜画面、动作与气氛…"
                  onChange={(e) => patchSelected({ visual: e.target.value })}
                />
              </div>

              <div className="manju-produce__field">
                <Label>画面要素</Label>
                <div className="manju-produce__pill-row">
                  <span className="manju-produce__pill">
                    <UserRound className="size-3.5" />
                    角色 {assetCounts.character}
                  </span>
                  <span className="manju-produce__pill">
                    <MapPin className="size-3.5" />
                    场景 {assetCounts.scene}
                  </span>
                  <span className="manju-produce__pill">
                    <Package className="size-3.5" />
                    道具 {assetCounts.prop}
                  </span>
                </div>
                <ManjuAssetPicker
                  assets={project.assets}
                  value={selected.assetRefs}
                  onChange={(ids) => patchSelected({ assetRefs: ids })}
                />
              </div>

              <div className="manju-produce__cinema-row">
                <div className="manju-produce__field">
                  <Label>景别</Label>
                  <Select
                    value={selected.shotSize || "全景"}
                    onValueChange={(v) => patchSelected({ shotSize: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SHOT_SIZES.map((v) => (
                        <SelectItem key={v} value={v}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="manju-produce__field">
                  <Label>角度</Label>
                  <Select
                    value={selected.cameraAngle || "平视"}
                    onValueChange={(v) => patchSelected({ cameraAngle: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CAMERA_ANGLES.map((v) => (
                        <SelectItem key={v} value={v}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="manju-produce__field">
                  <Label>运镜</Label>
                  <Select
                    value={selected.cameraMove || "固定"}
                    onValueChange={(v) => patchSelected({ cameraMove: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CAMERA_MOVES.map((v) => (
                        <SelectItem key={v} value={v}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="manju-produce__field">
                <Label>对话内容</Label>
                <Textarea
                  value={selected.dialogue}
                  rows={2}
                  placeholder="本镜对白，没有可留空"
                  onChange={(e) => patchSelected({ dialogue: e.target.value })}
                />
              </div>

              <div className="manju-produce__gen-tabs" role="tablist">
                {(
                  [
                    ["t2i", "文生图"],
                    ["i2i", "图生图"],
                    ["ref_video", "参考视频"],
                    ["i2v", "图生视频"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={genTab === id}
                    className={cn(
                      "manju-produce__gen-tab",
                      genTab === id && "is-on",
                    )}
                    onClick={() => setGenTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="manju-produce__field">
                <Label>
                  {genTab === "i2v" || genTab === "ref_video"
                    ? "视频提示词"
                    : "画面提示词"}
                </Label>
                <Textarea
                  value={
                    genTab === "i2v" || genTab === "ref_video"
                      ? selected.videoPrompt
                      : selected.imagePrompt
                  }
                  rows={4}
                  placeholder={
                    genTab === "i2v" || genTab === "ref_video"
                      ? "镜头运动、情绪与节奏…"
                      : "构图、光影、风格补充…"
                  }
                  onChange={(e) =>
                    patchSelected(
                      genTab === "i2v" || genTab === "ref_video"
                        ? { videoPrompt: e.target.value }
                        : { imagePrompt: e.target.value },
                    )
                  }
                />
              </div>

              <div className="manju-produce__gen-meta">
                <span>画幅 {project.settings.ratio}</span>
                <span>风格 {project.settings.style || "默认"}</span>
                <span>
                  时长 {selected.duration ?? project.settings.duration}s
                </span>
              </div>

              <Button
                type="button"
                className="manju-produce__gen-btn"
                disabled={Boolean(busy)}
                onClick={handleStartGenerate}
              >
                {busy ? (
                  <>
                    <Sparkles className="size-4 animate-pulse" />
                    生成中…
                  </>
                ) : (
                  <>
                    <Wand2 className="size-4" />
                    开始生成
                  </>
                )}
              </Button>
            </>
          ) : (
            <div className="manju-produce__editor-empty">
              <p>选择或新增一个分镜开始制作</p>
              <Button type="button" onClick={handleAddShot}>
                <Plus className="size-3.5" />
                新增分镜
              </Button>
            </div>
          )}
        </section>

        {/* 右：预览 + 素材库 */}
        <section className="manju-produce__stage" aria-label="预览与素材">
          <div className="manju-produce__preview">
            <div className="manju-produce__preview-toolbar">
              <span className="manju-produce__preview-title">{titleDisplay}</span>
              <div className="manju-produce__preview-actions">
                <button
                  type="button"
                  className="manju-produce__icon-btn"
                  aria-label="上传"
                  onClick={() => toast.message("本地上传即将接入")}
                >
                  <Upload className="size-4" />
                </button>
                <button
                  type="button"
                  className="manju-produce__icon-btn"
                  aria-label="下载"
                  disabled={!previewUrl}
                  onClick={() => {
                    if (!previewUrl) return;
                    window.open(previewUrl, "_blank", "noopener,noreferrer");
                  }}
                >
                  <Download className="size-4" />
                </button>
                <button
                  type="button"
                  className="manju-produce__icon-btn"
                  aria-label="删除当前预览"
                  disabled={!selected}
                  onClick={() => {
                    if (!selected) return;
                    if (previewKind === "video") {
                      patchSelected({
                        videoUrl: null,
                        videoAssetId: null,
                        videoJobId: null,
                        videoStatus: "idle",
                      });
                    } else {
                      patchSelected({
                        storyboardImageUrl: null,
                        storyboardAssetId: null,
                        storyboardJobId: null,
                        storyboardStatus: "idle",
                      });
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
            <div className="manju-produce__preview-canvas">
              {previewUrl ? (
                previewKind === "video" ? (
                  <video src={previewUrl} controls playsInline />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl} alt={titleDisplay} />
                )
              ) : (
                <div className="manju-produce__preview-empty">
                  <Film className="size-10 opacity-30" />
                  <p>生成后在此预览画面或视频</p>
                </div>
              )}
            </div>
          </div>

          <div className="manju-produce__library">
            <div className="manju-produce__library-head">
              <div className="manju-produce__library-tabs">
                <button
                  type="button"
                  className={cn(libraryTab === "current" && "is-on")}
                  onClick={() => setLibraryTab("current")}
                >
                  当前分镜
                </button>
                <button
                  type="button"
                  className={cn(libraryTab === "all" && "is-on")}
                  onClick={() => setLibraryTab("all")}
                >
                  所有分镜
                </button>
              </div>
              <div className="manju-produce__library-filters">
                {(
                  [
                    ["all", "全部"],
                    ["image", "图片"],
                    ["video", "视频"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={cn(libraryFilter === id && "is-on")}
                    onClick={() => setLibraryFilter(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="manju-produce__library-grid">
              {libraryItems.length === 0 ? (
                <p className="manju-produce__library-empty">暂无素材</p>
              ) : (
                libraryItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      "manju-produce__library-card",
                      item.selected && "is-selected",
                    )}
                    title={item.label}
                    onClick={() => {
                      setSelectedId(item.shotId);
                      setPreviewKind(item.kind);
                    }}
                  >
                    {item.kind === "video" ? (
                      <video src={item.url} muted playsInline />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.url} alt="" />
                    )}
                    {item.selected ? (
                      <span className="manju-produce__library-badge">
                        <Star className="size-3" />
                        已选
                      </span>
                    ) : null}
                  </button>
                ))
              )}
            </div>
            <div className="manju-produce__library-foot">
              共 {libraryItems.length} 条
            </div>
          </div>
        </section>

        {/* 最右：属性操作 */}
        <aside className="manju-produce__info" aria-label="素材信息">
          {selected && previewUrl ? (
            <>
              <div className="manju-produce__info-card">
                <div className="manju-produce__info-id">
                  <strong className="truncate">
                    {selected.storyboardAssetId?.slice(0, 12) ||
                      selected.id.slice(0, 8)}
                  </strong>
                  <span className="manju-produce__info-tag">AI 生成</span>
                </div>
                <p className="manju-produce__info-meta">
                  {previewKind === "video" ? "镜头视频" : "分镜静帧"} ·{" "}
                  {selected.shotSize}/{selected.cameraAngle}/
                  {selected.cameraMove}
                </p>
              </div>
              <div className="manju-produce__info-actions">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void generateImage()}
                >
                  AI 重绘
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled
                >
                  超分
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy || !selected.storyboardImageUrl}
                  onClick={() => void generateVideo()}
                >
                  <Wand2 className="size-3.5" />
                  生成视频
                </Button>
              </div>
              <div className="manju-produce__field">
                <Label>图片内容描述</Label>
                <p className="manju-produce__info-desc">
                  {selected.visual.trim() || "暂无描述"}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => void handleDeleteShot(selected)}
              >
                <Trash2 className="size-3.5" />
                删除分镜
              </Button>
            </>
          ) : (
            <div className="manju-produce__info-empty">
              <ChevronDown className="size-4 opacity-40" />
              <p>生成或选择素材后显示属性</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
