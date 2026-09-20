"use client";

import { useState } from "react";
import {
  ClipboardPaste,
  FileText,
  Loader2,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmDialog } from "@/shared/lib/confirm";
import { toast } from "@/shared/lib/toast";
import { useManjuStore } from "../manju-store";
import { submitManjuAnalyzeJob } from "../manju-api";
import { submitEpisodePlan, submitSeriesMemory } from "../lib/workflow-skill";
import { ManjuMdField } from "../manju-md-field";
import { ScriptFileImport } from "../script-file-import";
import {
  EMPTY_SERIES,
  extractAssetsFromScript,
  parseScriptToShots,
  type ManjuProjectDraft,
  type ManjuSeries,
} from "../manju-types";

type ScriptMode = "choose" | "edit";

export function ScriptStep({ project }: { project: ManjuProjectDraft }) {
  const updateProject = useManjuStore((s) => s.updateProject);
  const setShots = useManjuStore((s) => s.setShots);
  const mergeExtractedAssets = useManjuStore((s) => s.mergeExtractedAssets);
  const autoLinkShotAssets = useManjuStore((s) => s.autoLinkShotAssets);
  const flushSave = useManjuStore((s) => s.flushSave);
  const setAnalyzing = useManjuStore((s) => s.setAnalyzing);
  const analyzing = useManjuStore((s) => Boolean(s.analyzingIds[project.id]));
  const [mode, setMode] = useState<ScriptMode>(
    project.scriptText.trim() ? "edit" : "choose",
  );

  const splitToShots = async () => {
    const shots = parseScriptToShots(project.scriptText);
    if (shots.length === 0) {
      toast.error("未能从剧本拆出分镜，请检查格式");
      return;
    }
    const hasMedia = project.shots.some(
      (s) => s.storyboardImageUrl || s.videoUrl,
    );
    if (hasMedia) {
      const ok = await confirmDialog({
        title: "覆盖现有分镜？",
        description:
          "当前分镜已有分镜图或视频。拆分会整表替换镜头列表，已有媒体可能丢失。",
        confirmText: "仍然拆分",
        cancelText: "取消",
        destructive: true,
      });
      if (!ok) return;
    }
    setShots(project.id, shots);
    autoLinkShotAssets(project.id);
    toast.success(`已拆出 ${shots.length} 个分镜`);
  };

  const extractAssets = () => {
    const extracted = extractAssetsFromScript(project.scriptText);
    if (extracted.length === 0) {
      toast.error("未识别到角色/场景/道具，可手动在第 3 步添加");
      return;
    }
    const added = mergeExtractedAssets(project.id, extracted);
    autoLinkShotAssets(project.id);
    toast.success(
      added > 0
        ? `新增 ${added} 个资产（共识别 ${extracted.length}）`
        : `已识别 ${extracted.length} 个，均已存在`,
    );
  };

  const runAiAnalyze = async () => {
    if (project.scriptText.trim().length < 20) {
      toast.error("请先粘贴更完整的剧本再分析");
      return;
    }
    try {
      setAnalyzing(project.id, true);
      await flushSave(project.id);
      await submitManjuAnalyzeJob({
        projectId: project.id,
        scriptText: project.scriptText,
        purpose: "analyze_assets",
        modelId: project.settings.llmModelId,
      });
      toast.success("已提交资产与分集分析（不含分镜）");
    } catch (e) {
      setAnalyzing(project.id, false);
      toast.error(e instanceof Error ? e.message : "提交分析失败");
    }
  };

  const series = project.series ?? EMPTY_SERIES;

  const patchSeries = (next: ManjuSeries) => {
    updateProject(project.id, { series: next });
  };

  const runSeriesMemory = async () => {
    if (project.scriptText.trim().length < 20) {
      toast.error("请先粘贴更完整的剧本再整理连载记忆");
      return;
    }
    try {
      setAnalyzing(project.id, true);
      await flushSave(project.id);
      await submitSeriesMemory(project);
      toast.success("已提交连载记忆（不改对白和镜头）");
    } catch (e) {
      setAnalyzing(project.id, false);
      toast.error(e instanceof Error ? e.message : "提交失败");
    }
  };

  const runEpisodePlan = async () => {
    if (project.scriptText.trim().length < 40) {
      toast.error("原文太短，先写完整一点再规划分集");
      return;
    }
    try {
      setAnalyzing(project.id, true);
      await flushSave(project.id);
      await submitEpisodePlan(project);
      toast.success("已提交分集规划（不改镜头和对白）");
    } catch (e) {
      setAnalyzing(project.id, false);
      toast.error(e instanceof Error ? e.message : "提交失败");
    }
  };

  const applyImportedText = async (text: string) => {
    if (project.scriptText.trim()) {
      const ok = await confirmDialog({
        title: "覆盖当前原文？",
        description: project.shots.length
          ? "导入会替换剧本编辑区。已有分镜/资产不会自动清空，请随后重新「规划分集 / 规划分镜」。"
          : "导入会替换剧本编辑区内容，不会自动清分镜或资产。",
        confirmText: "覆盖导入",
        cancelText: "取消",
        destructive: true,
      });
      if (!ok) return;
    }
    updateProject(project.id, { scriptText: text });
    setMode("edit");
    if (text.length >= 400) {
      toast.message("长文已导入：建议先「规划分集」，再按集规划分镜");
    } else if (project.shots.length > 0) {
      toast.message("原文已换，建议重新规划分集/分镜");
    }
  };

  if (mode === "choose" && !project.scriptText.trim()) {
    return (
      <div className="manju-script-choose">
        <div className="manju-script-choose__hero">
          <span className="manju-script-choose__hero-icon" aria-hidden>
            <FileText className="h-8 w-8" />
          </span>
          <p>选择一种方式添加剧本</p>
        </div>
        <div className="manju-script-choose__cards">
          <button
            type="button"
            className="manju-entry-card"
            onClick={() => setMode("edit")}
          >
            <span className="manju-entry-card__icon" aria-hidden>
              <ClipboardPaste className="h-8 w-8" />
            </span>
            <strong>粘贴剧本</strong>
            <span>已有内容可直接粘贴修改</span>
          </button>
          <ScriptFileImport
            variant="card"
            disabled={analyzing}
            onText={(text) => void applyImportedText(text)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="manju-panel">
      <div className="manju-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="manju-card__title">剧本 / 小说原文</div>
            <p className="manju-card__desc">
              粘贴或导入成品剧本 / 小说。「AI 分析」只登记角色、场景、道具和分集，分镜要另跑规划。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ScriptFileImport
              disabled={analyzing}
              onText={(text) => void applyImportedText(text)}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={extractAssets}
              disabled={analyzing}
            >
              <Wand2 className="h-4 w-4" />
              本地提取
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void splitToShots()}
              disabled={analyzing}
            >
              拆分为分镜
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void runEpisodePlan()}
              disabled={analyzing}
            >
              规划分集
            </Button>
            <Button
              size="sm"
              onClick={() => void runAiAnalyze()}
              disabled={analyzing}
            >
              {analyzing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {analyzing ? "分析中…" : "AI 分析"}
            </Button>
          </div>
        </div>
        <ManjuMdField
          value={project.scriptText}
          onChange={(scriptText) => updateProject(project.id, { scriptText })}
          placeholder={`示例：\n\n场景：青石巷口·雨夜\n\n少年：今晚，城门不会为任何人开。\n\n镜头2\n暗色水墨风，镜头缓慢推进巷深。少年握着信笺。`}
          height={420}
          preview="edit"
          className="mt-4"
        />
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{project.scriptText.length} 字</span>
          {project.episodes.length > 0 ? (
            <span>分集 {project.episodes.length}</span>
          ) : null}
          {project.shots.length > 0 ? (
            <span>分镜 {project.shots.length}</span>
          ) : null}
          {project.assets.length > 0 ? (
            <span>资产 {project.assets.length}</span>
          ) : null}
        </div>
      </div>

      <div className="manju-card">
        <div className="manju-card__title">故事梗概</div>
        <p className="manju-card__desc">
          AI 分析会写入这里，也可手工改。不影响已确认的对白与媒体。
        </p>
        <ManjuMdField
          value={project.overview}
          onChange={(overview) => updateProject(project.id, { overview })}
          placeholder="一两段概括剧情、人物关系与基调…"
          height={160}
          preview="edit"
          className="mt-3"
        />
        {project.episodes.length > 0 ? (
          <div className="mt-4 space-y-3">
            {project.episodes.map((ep, i) => (
              <div
                key={ep.id}
                className="rounded-lg border border-border bg-muted/30 p-3"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <Input
                    value={ep.title}
                    onChange={(e) =>
                      updateProject(project.id, {
                        episodes: project.episodes.map((item) =>
                          item.id === ep.id
                            ? { ...item, title: e.target.value }
                            : item,
                        ),
                      })
                    }
                    className="h-8 text-sm font-medium"
                    placeholder="分集标题"
                  />
                </div>
                <Input
                  value={ep.hook ?? ""}
                  onChange={(e) =>
                    updateProject(project.id, {
                      episodes: project.episodes.map((item) =>
                        item.id === ep.id
                          ? { ...item, hook: e.target.value }
                          : item,
                      ),
                    })
                  }
                  className="mb-2 h-8 text-xs"
                  placeholder="本集钩子（可选）"
                />
                <ManjuMdField
                  value={ep.summary ?? ""}
                  onChange={(summary) =>
                    updateProject(project.id, {
                      episodes: project.episodes.map((item) =>
                        item.id === ep.id ? { ...item, summary } : item,
                      ),
                    })
                  }
                  placeholder="本集摘要"
                  height={72}
                  hideToolbar
                />
                <ManjuMdField
                  value={ep.sourceText ?? ""}
                  onChange={(sourceText) =>
                    updateProject(project.id, {
                      episodes: project.episodes.map((item) =>
                        item.id === ep.id ? { ...item, sourceText } : item,
                      ),
                    })
                  }
                  placeholder="本集原文片段（规划本集分镜时优先用这段）"
                  height={120}
                  hideToolbar
                  className="mt-2"
                />
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="manju-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="manju-card__title">连载记忆</div>
            <p className="manju-card__desc">
              世界观、角色小传、未回收伏笔。不参与生图，也不改已确认的对白和镜头。
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={analyzing}
            onClick={() => void runSeriesMemory()}
          >
            {analyzing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            整理连载记忆
          </Button>
        </div>
        <ManjuMdField
          value={series.world}
          onChange={(world) => patchSeries({ ...series, world })}
          placeholder="时代、规则、世界观…"
          height={120}
          hideToolbar
          className="mt-3"
        />
        <div className="mt-4 space-y-3">
          {series.bios.map((bio, index) => (
            <div key={`${bio.name}-${index}`} className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <Input
                  value={bio.name}
                  className="h-8 text-sm"
                  onChange={(e) => {
                    const bios = series.bios.map((item, i) =>
                      i === index ? { ...item, name: e.target.value } : item,
                    );
                    patchSeries({ ...series, bios });
                  }}
                />
                <button
                  type="button"
                  className="manju-icon-btn"
                  aria-label="删除小传"
                  onClick={() =>
                    patchSeries({
                      ...series,
                      bios: series.bios.filter((_, i) => i !== index),
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <ManjuMdField
                value={bio.bio}
                onChange={(text) => {
                  const bios = series.bios.map((item, i) =>
                    i === index ? { ...item, bio: text } : item,
                  );
                  patchSeries({ ...series, bios });
                }}
                placeholder="身份、关系、已知经历"
                height={80}
                hideToolbar
                className="mt-2"
              />
            </div>
          ))}
        </div>
        {series.hooks.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {series.hooks.map((hook, index) => (
              <li
                key={`${hook.text}-${index}`}
                className="flex items-start justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span className={hook.status === "paid" ? "text-muted-foreground line-through" : ""}>
                  {hook.text}
                </span>
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const hooks = series.hooks.map((item, i) =>
                        i === index
                          ? {
                              ...item,
                              status:
                                item.status === "paid"
                                  ? ("open" as const)
                                  : ("paid" as const),
                            }
                          : item,
                      );
                      patchSeries({ ...series, hooks });
                    }}
                  >
                    {hook.status === "paid" ? "标为未回收" : "已回收"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      patchSeries({
                        ...series,
                        hooks: series.hooks.filter((_, i) => i !== index),
                      })
                    }
                  >
                    删除
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
