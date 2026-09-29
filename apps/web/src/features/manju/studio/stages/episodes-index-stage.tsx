"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Download,
  FileText,
  Film,
  MoreHorizontal,
  Music2,
  PenLine,
  Play,
  Plus,
  Search,
  Sparkles,
  Wand2,
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
import { cn } from "@/shared/lib/utils";
import { toast } from "@/shared/lib/toast";
import { confirmDialog } from "@/shared/lib/confirm";
import { useManjuStore } from "../../manju-store";
import { submitManjuAnalyzeJob } from "../../manju-api";
import { ManjuTextField } from "../../manju-text-field";
import { ManjuExportDialog } from "../manju-export-dialog";
import { manjuStudioHref } from "../manju-studio-routes";
import type { ManjuEpisodeDraft, ManjuProjectDraft } from "../../manju-types";

type ProduceMode = "manual" | "agent";

type CreateDraft = {
  index: string;
  title: string;
  content: string;
};

function nextDefaultIndex(count: number) {
  return String(count + 1);
}

function episodeThumb(project: ManjuProjectDraft, epId: string) {
  const shots = project.shots
    .filter((s) => s.episodeId === epId)
    .sort((a, b) => a.index - b.index);
  for (const s of shots) {
    if (s.storyboardImageUrl) return s.storyboardImageUrl;
  }
  for (const s of shots) {
    if (s.videoUrl) return s.videoUrl;
  }
  return null;
}

function openProduceTab(projectId: string, epId: string) {
  const href = manjuStudioHref(projectId, "episode", { epId });
  window.open(href, "_blank", "noopener,noreferrer");
}

export function EpisodesIndexStage({ projectId }: { projectId: string }) {
  const project = useManjuStore((s) =>
    s.projects.find((p) => p.id === projectId),
  );
  const updateProject = useManjuStore((s) => s.updateProject);
  const flushSave = useManjuStore((s) => s.flushSave);
  const setAnalyzing = useManjuStore((s) => s.setAnalyzing);
  const analyzing = useManjuStore((s) => Boolean(s.analyzingIds[projectId]));

  const [query, setQuery] = useState("");
  const [batchMode, setBatchMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<CreateDraft>({
    index: "1",
    title: "",
    content: "",
  });

  const [produceOpen, setProduceOpen] = useState(false);
  const [produceMode, setProduceMode] = useState<ProduceMode>("manual");
  const [pendingEpId, setPendingEpId] = useState<string | null>(null);

  const episodes = project?.episodes ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return episodes;
    return episodes.filter((ep, i) => {
      const title = (ep.title || `第${i + 1}集`).toLowerCase();
      const hint = `${ep.summary ?? ""} ${ep.hook ?? ""} ${ep.sourceText ?? ""}`.toLowerCase();
      return title.includes(q) || hint.includes(q);
    });
  }, [episodes, query]);

  if (!project) return null;

  const openCreate = () => {
    setCreateDraft({
      index: nextDefaultIndex(project.episodes.length),
      title: "",
      content: "",
    });
    setCreateOpen(true);
  };

  const createEpisode = () => {
    const title = createDraft.title.trim();
    if (!title) {
      toast.error("请填写剧集标题");
      return;
    }
    const rawIndex = Number.parseInt(createDraft.index, 10);
    const insertAt = Number.isFinite(rawIndex)
      ? Math.min(Math.max(1, rawIndex), project.episodes.length + 1) - 1
      : project.episodes.length;

    const ep: ManjuEpisodeDraft = {
      id: crypto.randomUUID(),
      title,
      summary: "",
      hook: "",
      sourceText: createDraft.content.trim(),
    };
    const next = [...project.episodes];
    next.splice(insertAt, 0, ep);
    updateProject(projectId, { episodes: next });
    setCreateOpen(false);
    toast.success("已创建剧集");
  };

  const openProduce = (epId: string) => {
    setPendingEpId(epId);
    setProduceMode("manual");
    setProduceOpen(true);
  };

  const confirmProduce = async (skipAnalyze: boolean) => {
    const epId = pendingEpId;
    setProduceOpen(false);
    if (!epId) return;

    if (produceMode === "agent") {
      toast.message("Agent 创作将打开侧栏 Agent");
    }

    if (!skipAnalyze && project.scriptText.trim().length >= 20) {
      try {
        setAnalyzing(projectId, true);
        await flushSave(projectId);
        await submitManjuAnalyzeJob({
          projectId,
          scriptText: project.scriptText,
          purpose: "analyze_assets",
          modelId: project.settings.llmModelId,
          analyzeMode: "incremental",
        });
        toast.success("已开始解析");
      } catch (e) {
        setAnalyzing(projectId, false);
        toast.error(e instanceof Error ? e.message : "解析提交失败");
      }
    }

    openProduceTab(projectId, epId);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteSelected = async () => {
    if (selected.size === 0) {
      toast.message("请先勾选要删除的剧集");
      return;
    }
    const ok = await confirmDialog({
      title: "删除所选剧集？",
      description: `将删除 ${selected.size} 集，以及归属这些集的分镜。`,
      confirmText: "删除",
      cancelText: "取消",
      destructive: true,
    });
    if (!ok) return;
    const drop = selected;
    updateProject(projectId, {
      episodes: project.episodes.filter((ep) => !drop.has(ep.id)),
      shots: project.shots.filter(
        (s) => !s.episodeId || !drop.has(s.episodeId),
      ),
    });
    setSelected(new Set());
    setBatchMode(false);
    toast.success("已删除剧集");
  };

  const empty = project.episodes.length === 0;

  return (
    <div className="manju-ep-manage">
      <div className="manju-ep-manage__head">
        <h1 className="manju-ep-manage__title">
          {project.title || "未命名漫剧"} · 共{project.episodes.length}集
        </h1>
        <div className="manju-ep-manage__actions">
          <label className="manju-ep-manage__search">
            <Search className="size-3.5" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索"
              aria-label="搜索剧集"
            />
          </label>
          {batchMode ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={selected.size === 0}
                onClick={() => void deleteSelected()}
              >
                删除所选
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setBatchMode(false);
                  setSelected(new Set());
                }}
              >
                取消
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={empty}
              onClick={() => setBatchMode(true)}
            >
              批量操作
            </Button>
          )}
          <Button type="button" size="sm" onClick={openCreate}>
            <Plus className="size-4" />
            新增一集
          </Button>
        </div>
      </div>

      {empty ? (
        <div className="manju-ep-empty">
          {analyzing ? (
            <>
              <div className="manju-ep-empty__visual" aria-hidden>
                <Sparkles className="size-10 text-primary" />
              </div>
              <p className="manju-ep-empty__title">正在解析剧本…</p>
              <p className="manju-ep-empty__desc">
                AI 正在解析剧本内容，请稍后在角色/场景/道具页查看资产
              </p>
            </>
          ) : (
            <>
              <div className="manju-ep-empty__visual" aria-hidden>
                <FileText className="manju-ep-empty__paper" />
                <PenLine className="manju-ep-empty__pen" />
              </div>
              <p className="manju-ep-empty__title">暂无剧集</p>
              <p className="manju-ep-empty__desc">
                可点击右上方「新增一集」
              </p>
            </>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="manju-ep-empty">
          <p className="manju-ep-empty__title">没有匹配的剧集</p>
          <p className="manju-ep-empty__desc">试试其他关键词</p>
        </div>
      ) : (
        <div className="manju-ep-manage__grid">
          {filtered.map((ep) => {
            const i = project.episodes.findIndex((item) => item.id === ep.id);
            const shots = project.shots.filter((s) => s.episodeId === ep.id);
            const pending = shots.length === 0;
            const checked = selected.has(ep.id);
            const thumb = episodeThumb(project, ep.id);
            const title = ep.title || `第${i + 1}集`;
            return (
              <article
                key={ep.id}
                className={cn(
                  "manju-ep-card",
                  batchMode && checked && "is-selected",
                )}
              >
                <div className="manju-ep-card__thumb" aria-hidden>
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" />
                  ) : (
                    <Film className="size-8 opacity-45" />
                  )}
                </div>
                <div className="manju-ep-card__main">
                  <div className="manju-ep-card__top">
                    {batchMode ? (
                      <label className="manju-ep-card__check">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelect(ep.id)}
                        />
                        <h2 className="manju-ep-card__name">{title}</h2>
                      </label>
                    ) : (
                      <h2 className="manju-ep-card__name">{title}</h2>
                    )}
                    <span
                      className={cn(
                        "manju-ep-card__badge",
                        !pending && "is-ready",
                      )}
                    >
                      {pending ? "待解析" : "已解析"}
                    </span>
                  </div>
                  <p className="manju-ep-card__meta">
                    {pending
                      ? ep.summary?.trim() ||
                        ep.sourceText?.trim()?.slice(0, 60) ||
                        "尚未规划分镜"
                      : `分镜表 · ${shots.length} 个分镜`}
                  </p>
                  {!batchMode ? (
                    <div className="manju-ep-card__actions">
                      {pending ? (
                        <Button
                          size="sm"
                          disabled={analyzing}
                          onClick={() => openProduce(ep.id)}
                        >
                          <Wand2 className="size-3.5" />
                          开始解析
                        </Button>
                      ) : (
                        <>
                          <Button variant="outline" size="sm" asChild>
                            <Link href={manjuStudioHref(projectId, "preview")}>
                              <Play className="size-3.5" />
                              预览
                            </Link>
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => openProduceTab(projectId, ep.id)}
                          >
                            <Wand2 className="size-3.5" />
                            制作视频
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => toast.message("BGM 制作即将接入")}
                          >
                            <Music2 className="size-3.5" />
                            制作BGM
                          </Button>
                          <ManjuExportDialog
                            project={project}
                            episodeId={ep.id}
                            trigger={
                              <Button type="button" variant="outline" size="sm">
                                <Download className="size-3.5" />
                                导出
                              </Button>
                            }
                          />
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
                {!batchMode ? (
                  <button
                    type="button"
                    className="manju-ep-card__more"
                    aria-label="更多"
                    onClick={() =>
                      toast.message("可在批量操作中删除或调整剧集")
                    }
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      <CreateEpisodeDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        draft={createDraft}
        onChange={setCreateDraft}
        onConfirm={createEpisode}
      />

      <ProduceDialog
        open={produceOpen}
        onOpenChange={setProduceOpen}
        mode={produceMode}
        onModeChange={setProduceMode}
        onConfirm={() => void confirmProduce(false)}
        onSkip={() => void confirmProduce(true)}
      />
    </div>
  );
}

function CreateEpisodeDialog({
  open,
  onOpenChange,
  draft,
  onChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: CreateDraft;
  onChange: (draft: CreateDraft) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="manju-ep-create-dialog sm:max-w-md">
        <DialogHeader>
          <DialogTitle>创建新剧集</DialogTitle>
        </DialogHeader>
        <div className="manju-ep-create-dialog__fields">
          <div className="manju-ep-create-dialog__field">
            <Label htmlFor="ep-create-index">
              剧集序号 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ep-create-index"
              type="number"
              min={1}
              value={draft.index}
              onChange={(e) =>
                onChange({ ...draft, index: e.target.value })
              }
            />
          </div>
          <div className="manju-ep-create-dialog__field">
            <Label htmlFor="ep-create-title">
              剧集标题 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ep-create-title"
              value={draft.title}
              onChange={(e) =>
                onChange({ ...draft, title: e.target.value })
              }
              placeholder="为本集起个名字"
            />
          </div>
          <div className="manju-ep-create-dialog__field">
            <Label htmlFor="ep-create-content">剧集内容</Label>
            <ManjuTextField
              id="ep-create-content"
              value={draft.content}
              onChange={(content) => onChange({ ...draft, content })}
              placeholder="本集对应的剧本片段（可选）"
              minHeight={140}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button type="button" onClick={onConfirm}>
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProduceDialog({
  open,
  onOpenChange,
  mode,
  onModeChange,
  onConfirm,
  onSkip,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: ProduceMode;
  onModeChange: (mode: ProduceMode) => void;
  onConfirm: () => void;
  onSkip: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            选择生产方式
          </DialogTitle>
        </DialogHeader>
        <div className="manju-mode-dialog__grid">
          <button
            type="button"
            className={cn(
              "manju-mode-dialog__option",
              mode === "manual" && "is-on",
            )}
            onClick={() => onModeChange("manual")}
          >
            <strong>常规创作</strong>
            <span>每分镜逐步微调和确认画面、视频等</span>
            {mode === "manual" ? (
              <span className="manju-mode-dialog__check" aria-hidden />
            ) : null}
          </button>
          <button
            type="button"
            className={cn(
              "manju-mode-dialog__option",
              mode === "agent" && "is-on",
            )}
            onClick={() => onModeChange("agent")}
          >
            <strong>Agent 创作</strong>
            <span>由 Agent 能力驱动的操作流程，支持离线自动完成创作</span>
            {mode === "agent" ? (
              <span className="manju-mode-dialog__check" aria-hidden />
            ) : null}
          </button>
        </div>
        <div className="manju-mode-dialog__footer">
          <button
            type="button"
            className="manju-mode-dialog__skip"
            onClick={onSkip}
          >
            跳过解析
          </button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button onClick={onConfirm}>确认</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
