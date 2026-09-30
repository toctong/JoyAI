"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Copy,
  Download,
  Eye,
  FileText,
  Film,
  MoreHorizontal,
  Music2,
  PenLine,
  Play,
  Plus,
  Search,
  Sparkles,
  Trash2,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/shared/lib/utils";
import { toast } from "@/shared/lib/toast";
import { confirmDialog } from "@/shared/lib/confirm";
import { useManjuStore } from "../../manju-store";
import { submitManjuAnalyzeJob } from "../../manju-api";
import { submitWorkflowSkill } from "../../lib/workflow-skill";
import { ManjuTextField } from "../../manju-text-field";
import { ManjuExportDialog } from "../manju-export-dialog";
import { EpisodeContinueDialog } from "../episode-continue-dialog";
import {
  manjuStudioHref,
  openManjuProduceTab,
} from "../manju-studio-routes";
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

function episodeStats(project: ManjuProjectDraft, epId: string) {
  const shots = project.shots.filter((s) => s.episodeId === epId);
  const videos = shots.filter((s) => Boolean(s.videoUrl)).length;
  return { shots, videos, pending: shots.length === 0 };
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

  const [detailEpId, setDetailEpId] = useState<string | null>(null);
  const [detailIndex, setDetailIndex] = useState("");
  const [detailTitle, setDetailTitle] = useState("");
  const [detailContent, setDetailContent] = useState("");
  const [detailHook, setDetailHook] = useState("");
  const [detailSummary, setDetailSummary] = useState("");
  const [continueFromId, setContinueFromId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const list = project?.episodes ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((ep, i) => {
      const title = (ep.title || `第${i + 1}集`).toLowerCase();
      const hint =
        `${ep.summary ?? ""} ${ep.hook ?? ""} ${ep.sourceText ?? ""}`.toLowerCase();
      return title.includes(q) || hint.includes(q);
    });
  }, [project?.episodes, query]);

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

  const openDetail = (epId: string) => {
    const idx = project.episodes.findIndex((e) => e.id === epId);
    const ep = project.episodes[idx];
    if (!ep) return;
    setDetailEpId(epId);
    setDetailIndex(String(idx + 1));
    setDetailTitle(ep.title);
    setDetailContent(ep.sourceText ?? "");
    setDetailHook(ep.hook ?? "");
    setDetailSummary(ep.summary ?? "");
  };

  const saveDetail = () => {
    if (!detailEpId) return;
    const title = detailTitle.trim();
    if (!title) {
      toast.error("请填写剧集标题");
      return;
    }
    const from = project.episodes.findIndex((e) => e.id === detailEpId);
    if (from < 0) return;
    const rawIndex = Number.parseInt(detailIndex, 10);
    const target = Number.isFinite(rawIndex)
      ? Math.min(Math.max(1, rawIndex), project.episodes.length) - 1
      : from;

    const next = [...project.episodes];
    const [ep] = next.splice(from, 1);
    if (!ep) return;
    next.splice(target, 0, {
      ...ep,
      title,
      sourceText: detailContent,
      hook: detailHook.trim(),
      summary: detailSummary.trim(),
    });
    updateProject(projectId, { episodes: next });
  };

  const openContinue = (epId: string) => {
    const ep = project.episodes.find((e) => e.id === epId);
    if (!ep) return;
    if (!ep.hook?.trim() && !ep.sourceText?.trim()) {
      toast.message("建议先补本集钩子或原文，续写效果更好");
    }
    setContinueFromId(epId);
  };

  const closeDetail = () => {
    if (detailEpId) saveDetail();
    setDetailEpId(null);
  };

  const openProduce = (epId: string) => {
    setPendingEpId(epId);
    setProduceMode("manual");
    setProduceOpen(true);
  };

  const confirmProduce = async (skipAnalyze: boolean) => {
    const epId = pendingEpId;
    if (!epId) {
      setProduceOpen(false);
      setPendingEpId(null);
      return;
    }

    if (produceMode === "agent") {
      toast.message("Agent 创作即将开放，已按常规创作打开制作台");
    }

    const missingRefs = project.assets.filter(
      (a) =>
        a.kind === "character" &&
        a.name.trim() &&
        !a.imageUrl &&
        !a.assetId,
    );
    if (missingRefs.length > 0) {
      const ok = await confirmDialog({
        title: "角色缺少参考图",
        description: `${missingRefs.map((a) => a.name).join("、")} 尚无参考图，跨镜长相可能不稳定。仍要进入制作台？`,
        confirmText: "仍要继续",
        cancelText: "先去补图",
      });
      if (!ok) return;
    }

    setProduceOpen(false);
    setPendingEpId(null);

    const ep = project.episodes.find((e) => e.id === epId);
    const analyzeText =
      (ep?.sourceText || "").trim() || project.scriptText.trim();
    const epShotCount = project.shots.filter((s) => s.episodeId === epId).length;
    const needsAssets =
      !skipAnalyze && analyzeText.length >= 20 && project.assets.length === 0;
    const needsPlan =
      !skipAnalyze &&
      !needsAssets &&
      epShotCount === 0 &&
      analyzeText.length >= 20;

    // Open first (same click turn). ?plan=1 lets same-tab fallback auto-run script_plan.
    const opened = openManjuProduceTab(projectId, epId, {
      autoPlan: needsPlan,
    });

    if (skipAnalyze || !opened) return;

    try {
      setAnalyzing(projectId, true);
      await flushSave(projectId);
      if (needsAssets) {
        const job = await submitManjuAnalyzeJob({
          projectId,
          scriptText: analyzeText,
          purpose: "analyze_assets",
          modelId: project.settings.llmModelId,
          episodeId: epId,
          analyzeMode: "incremental",
        });
        updateProject(projectId, { lastAnalyzeJobId: job.id });
        toast.message("AI 正在解析剧本资产…");
      } else if (needsPlan) {
        const job = await submitWorkflowSkill({
          project,
          skill: "script_plan",
          episodeId: epId,
        });
        updateProject(projectId, { lastAnalyzeJobId: job.id });
        toast.message("AI 正在规划本集分镜…");
      } else {
        setAnalyzing(projectId, false);
      }
    } catch (e) {
      setAnalyzing(projectId, false);
      toast.error(e instanceof Error ? e.message : "提交失败");
    }
  };

  const startParseFromDetail = () => {
    if (!detailEpId) return;
    saveDetail();
    setDetailEpId(null);
    openProduce(detailEpId);
  };

  const copyEpisode = (epId: string) => {
    const ep = project.episodes.find((e) => e.id === epId);
    if (!ep) return;
    const clone: ManjuEpisodeDraft = {
      ...ep,
      id: crypto.randomUUID(),
      title: `${ep.title || "剧集"} (副本)`,
    };
    updateProject(projectId, {
      episodes: [...project.episodes, clone],
    });
    toast.success("已复制剧集");
  };

  const deleteEpisode = async (epId: string) => {
    const ep = project.episodes.find((e) => e.id === epId);
    if (!ep) return;
    const ok = await confirmDialog({
      title: "删除剧集？",
      description: `将删除「${ep.title}」，以及归属该集的分镜。`,
      confirmText: "删除",
      cancelText: "取消",
      destructive: true,
    });
    if (!ok) return;
    updateProject(projectId, {
      episodes: project.episodes.filter((e) => e.id !== epId),
      shots: project.shots.filter((s) => s.episodeId !== epId),
    });
    if (detailEpId === epId) setDetailEpId(null);
    toast.success("已删除剧集");
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
  const detailEp = detailEpId
    ? project.episodes.find((e) => e.id === detailEpId)
    : null;
  const detailPending = detailEp
    ? episodeStats(project, detailEp.id).pending
    : true;
  const detailCharCount = detailContent.trim().length;

  return (
    <div className="manju-ep-manage">
      <div className="manju-studio__sticky-bar manju-studio__page-head">
        <label className="manju-studio__page-search">
          <Search className="manju-studio__page-search-icon" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索剧集"
            aria-label="搜索剧集"
          />
        </label>
        <div className="manju-studio__page-actions">
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
                可点击右上方「新增一集」，或先在剧本页解析剧本
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
            const { shots, videos, pending } = episodeStats(project, ep.id);
            const checked = selected.has(ep.id);
            const thumb = episodeThumb(project, ep.id);
            const title = ep.title || `第${i + 1}集`;
            return (
              <article
                key={ep.id}
                className={cn(
                  "manju-ep-card",
                  batchMode && checked && "is-selected",
                  pending && "is-pending",
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
                  <div className="manju-ep-card__info">
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
                        <button
                          type="button"
                          className="manju-ep-card__name-btn"
                          onClick={() => openDetail(ep.id)}
                        >
                          <h2 className="manju-ep-card__name">{title}</h2>
                        </button>
                      )}
                      <span
                        className={cn(
                          "manju-ep-card__badge",
                          !pending && "is-ready",
                        )}
                      >
                        {pending ? "待分镜" : "已分镜"}
                      </span>
                    </div>
                    {!pending ? (
                      <p className="manju-ep-card__meta">
                        分镜表 · {videos > 0 ? videos : shots.length} 个
                        {videos > 0 ? "视频" : "分镜"}
                      </p>
                    ) : null}
                    {!batchMode && !pending ? (
                      <div className="manju-ep-card__actions">
                        <Button
                          variant="outline"
                          size="sm"
                          className="manju-ep-card__ghost-btn"
                          asChild
                        >
                          <Link href={manjuStudioHref(projectId, "preview")}>
                            <Play className="size-3.5" />
                            预览
                          </Link>
                        </Button>
                        <Button
                          size="sm"
                          className="manju-ep-card__primary-btn"
                          asChild
                        >
                          <a
                            href={manjuStudioHref(projectId, "episode", {
                              epId: ep.id,
                            })}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Wand2 className="size-3.5" />
                            制作视频
                          </a>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="manju-ep-card__ghost-btn"
                          onClick={() => openContinue(ep.id)}
                        >
                          <PenLine className="size-3.5" />
                          AI 写下一集
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="manju-ep-card__ghost-btn"
                          onClick={() => toast.message("BGM 制作即将接入")}
                        >
                          <Music2 className="size-3.5" />
                          制作BGM
                        </Button>
                        <ManjuExportDialog
                          project={project}
                          episodeId={ep.id}
                          trigger={
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="manju-ep-card__ghost-btn"
                            >
                              <Download className="size-3.5" />
                              导出
                            </Button>
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                  {!batchMode && pending ? (
                    <div className="manju-ep-card__cta">
                      <Button
                        size="sm"
                        className="manju-ep-card__parse-btn"
                        disabled={analyzing}
                        onClick={() => openProduce(ep.id)}
                      >
                        <Wand2 className="size-3.5" />
                        开始制作
                      </Button>
                    </div>
                  ) : null}
                </div>
                {!batchMode ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="manju-ep-card__more"
                        aria-label="更多"
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem onClick={() => openDetail(ep.id)}>
                        <Eye className="size-3.5" />
                        查看详情
                      </DropdownMenuItem>
                      {!pending ? (
                        <DropdownMenuItem onClick={() => openContinue(ep.id)}>
                          <PenLine className="size-3.5" />
                          AI 写下一集
                        </DropdownMenuItem>
                      ) : null}
                      {pending ? (
                        <DropdownMenuItem
                          disabled={analyzing}
                          onClick={() => openProduce(ep.id)}
                        >
                          <Wand2 className="size-3.5" />
                          开始制作
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuItem onClick={() => copyEpisode(ep.id)}>
                        <Copy className="size-3.5" />
                        复制
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => void deleteEpisode(ep.id)}
                      >
                        <Trash2 className="size-3.5" />
                        删除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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

      <EpisodeContinueDialog
        projectId={projectId}
        fromEpisodeId={continueFromId}
        open={Boolean(continueFromId)}
        onOpenChange={(next) => {
          if (!next) setContinueFromId(null);
        }}
      />

      <ProduceDialog
        open={produceOpen}
        onOpenChange={(open) => {
          setProduceOpen(open);
          if (!open) setPendingEpId(null);
        }}
        mode={produceMode}
        onModeChange={setProduceMode}
        needsAssetParse={project.assets.length === 0}
        onConfirm={() => void confirmProduce(false)}
        onSkip={() => void confirmProduce(true)}
      />

      <Sheet
        open={Boolean(detailEpId)}
        onOpenChange={(open) => {
          if (!open) closeDetail();
        }}
      >
        <SheetContent
          side="right"
          showCloseButton={false}
          className="manju-ep-detail-sheet w-full sm:max-w-xl"
        >
          <SheetHeader className="manju-ep-detail-sheet__head">
            <div className="manju-ep-detail-sheet__head-left">
              <button
                type="button"
                className="manju-ep-detail-sheet__back"
                aria-label="返回"
                onClick={closeDetail}
              >
                <ArrowLeft className="size-4" />
              </button>
              <SheetTitle className="manju-ep-detail-sheet__title">
                剧集详情：{detailTitle.trim() || detailIndex || "—"}
              </SheetTitle>
            </div>
            <div className="manju-ep-detail-sheet__head-actions">
              <Button type="button" variant="outline" size="sm" disabled>
                导出资产
              </Button>
              {detailPending ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={analyzing}
                  onClick={startParseFromDetail}
                >
                  <Wand2 className="size-3.5" />
                  开始制作
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (!detailEpId) return;
                      saveDetail();
                      openContinue(detailEpId);
                    }}
                  >
                    <PenLine className="size-3.5" />
                    AI 写下一集
                  </Button>
                  <Button size="sm" asChild>
                    <a
                      href={
                        detailEpId
                          ? manjuStudioHref(projectId, "episode", {
                              epId: detailEpId,
                            })
                          : undefined
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        if (!detailEpId) return;
                        saveDetail();
                        setDetailEpId(null);
                      }}
                    >
                      <Wand2 className="size-3.5" />
                      制作视频
                    </a>
                  </Button>
                </>
              )}
            </div>
          </SheetHeader>

          <div className="manju-ep-detail-sheet__body">
            <section className="manju-ep-detail-sheet__section">
              <h3 className="manju-ep-detail-sheet__section-title">基本信息</h3>
              <div className="manju-ep-detail-sheet__fields">
                <div className="manju-ep-detail-sheet__field">
                  <Label htmlFor="ep-detail-index">剧集序号</Label>
                  <Input
                    id="ep-detail-index"
                    type="number"
                    min={1}
                    value={detailIndex}
                    onChange={(e) => setDetailIndex(e.target.value)}
                  />
                </div>
                <div className="manju-ep-detail-sheet__field">
                  <Label htmlFor="ep-detail-title">剧集标题</Label>
                  <Input
                    id="ep-detail-title"
                    value={detailTitle}
                    onChange={(e) => setDetailTitle(e.target.value)}
                    placeholder="为本集起个名字"
                  />
                </div>
                <div className="manju-ep-detail-sheet__field">
                  <Label htmlFor="ep-detail-summary">本集摘要</Label>
                  <Input
                    id="ep-detail-summary"
                    value={detailSummary}
                    onChange={(e) => setDetailSummary(e.target.value)}
                    placeholder="一两句本集发生什么"
                  />
                </div>
                <div className="manju-ep-detail-sheet__field">
                  <Label htmlFor="ep-detail-hook">本集钩子</Label>
                  <Input
                    id="ep-detail-hook"
                    value={detailHook}
                    onChange={(e) => setDetailHook(e.target.value)}
                    placeholder="结尾悬念，供 AI 写下一集承接"
                  />
                </div>
              </div>
            </section>

            <section className="manju-ep-detail-sheet__section">
              <div className="manju-ep-detail-sheet__section-head">
                <h3 className="manju-ep-detail-sheet__section-title">
                  剧本内容
                </h3>
                <span className="manju-ep-detail-sheet__char-count">
                  原始剧本内容（{detailCharCount} 字符）
                </span>
              </div>
              <ManjuTextField
                value={detailContent}
                onChange={setDetailContent}
                placeholder="本集对应的剧本片段…"
                minHeight={320}
              />
            </section>
          </div>
        </SheetContent>
      </Sheet>
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
  needsAssetParse,
  onConfirm,
  onSkip,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: ProduceMode;
  onModeChange: (mode: ProduceMode) => void;
  needsAssetParse: boolean;
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
            <span>
              {needsAssetParse
                ? "先解析资产，再逐步微调分镜与视频"
                : "规划本集分镜，再逐步微调画面与视频"}
            </span>
            {mode === "manual" ? (
              <span className="manju-mode-dialog__check" aria-hidden />
            ) : null}
          </button>
          <button
            type="button"
            className={cn(
              "manju-mode-dialog__option",
              "is-disabled",
              mode === "agent" && "is-on",
            )}
            disabled
            title="Agent 创作即将开放"
          >
            <strong>Agent 创作</strong>
            <span>即将开放：离线自动跑分镜与生成</span>
          </button>
        </div>
        <div className="manju-mode-dialog__footer">
          <button
            type="button"
            className="manju-mode-dialog__skip"
            onClick={onSkip}
          >
            仅打开制作台
          </button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button onClick={onConfirm}>
              {needsAssetParse ? "解析并制作" : "规划分镜并制作"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
