"use client";

import { useEffect, useRef, useState } from "react";
import {
  ClipboardPaste,
  FileText,
  Loader2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { confirmDialog } from "@/shared/lib/confirm";
import { toast } from "@/shared/lib/toast";
import { useManjuStore } from "../manju-store";
import { submitManjuAnalyzeJob } from "../manju-api";
import { submitEpisodePlan, submitSeriesMemory } from "../lib/workflow-skill";
import { sanitizeScriptBody } from "../lib/sanitize-script-text";
import { ManjuMdField } from "../manju-md-field";
import { ScriptFileImport } from "../script-file-import";
import { ScriptAiPanel } from "../script-ai/script-ai-panel";
import {
  EMPTY_SERIES,
  type ManjuEpisodeDraft,
  type ManjuProjectDraft,
  type ManjuSeries,
} from "../manju-types";

type ScriptMode = "choose" | "edit";
type MetaTab = "script" | "overview" | "episodes" | "series";

export function ScriptStep({ project }: { project: ManjuProjectDraft }) {
  const updateProject = useManjuStore((s) => s.updateProject);
  const flushSave = useManjuStore((s) => s.flushSave);
  const setAnalyzing = useManjuStore((s) => s.setAnalyzing);
  const analyzing = useManjuStore((s) => Boolean(s.analyzingIds[project.id]));
  const [mode, setMode] = useState<ScriptMode>(
    project.scriptText.trim() ? "edit" : "choose",
  );
  const [aiOpen, setAiOpen] = useState(false);
  const [metaTab, setMetaTab] = useState<MetaTab>("script");
  const tidiedRef = useRef(false);

  const applyScriptToProject = (
    raw: string,
    meta?: { hook?: string },
  ) => {
    const { script, hook: extracted } = sanitizeScriptBody(raw);
    const hook = (meta?.hook?.trim() || extracted || "").trim();
    const patch: {
      scriptText: string;
      episodes?: ManjuEpisodeDraft[];
    } = { scriptText: script };

    if (hook) {
      if (project.episodes.length === 0) {
        patch.episodes = [
          {
            id: crypto.randomUUID(),
            title: "第1集",
            summary: "",
            hook,
            sourceText: script,
          },
        ];
      } else {
        patch.episodes = project.episodes.map((ep, i) =>
          i === 0 ? { ...ep, hook: ep.hook?.trim() ? ep.hook : hook } : ep,
        );
      }
    }

    updateProject(project.id, patch);
  };

  /** 已应用的旧稿：把「本集钩子」迁到分集，正文只留可拍内容 */
  useEffect(() => {
    if (tidiedRef.current) return;
    if (mode !== "edit") return;
    const { script, hook } = sanitizeScriptBody(project.scriptText);
    if (!hook || script === project.scriptText.trim()) {
      tidiedRef.current = true;
      return;
    }
    tidiedRef.current = true;
    const patch: {
      scriptText: string;
      episodes?: ManjuEpisodeDraft[];
    } = { scriptText: script };
    if (project.episodes.length === 0) {
      patch.episodes = [
        {
          id: crypto.randomUUID(),
          title: "第1集",
          summary: "",
          hook,
          sourceText: script,
        },
      ];
    } else {
      patch.episodes = project.episodes.map((ep, i) =>
        i === 0 ? { ...ep, hook: ep.hook?.trim() ? ep.hook : hook } : ep,
      );
    }
    updateProject(project.id, patch);
    toast.message("已将「本集钩子」移到分集，正文只保留可拍内容");
  }, [
    mode,
    project.episodes,
    project.id,
    project.scriptText,
    updateProject,
  ]);

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
        <div className="manju-script-choose__cards manju-script-choose__cards--3">
          <button
            type="button"
            className="manju-entry-card"
            onClick={() => {
              setAiOpen(true);
              setMode("edit");
            }}
          >
            <span className="manju-entry-card__icon" aria-hidden>
              <Sparkles className="h-8 w-8" />
            </span>
            <strong>AI 帮写</strong>
          </button>
          <button
            type="button"
            className="manju-entry-card"
            onClick={() => setMode("edit")}
          >
            <span className="manju-entry-card__icon" aria-hidden>
              <ClipboardPaste className="h-8 w-8" />
            </span>
            <strong>粘贴剧本</strong>
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

  const editor = (
    <div className="manju-panel">
      <div className="manju-card">
        <Tabs
          value={metaTab}
          onValueChange={(v) => setMetaTab(v as MetaTab)}
          className="manju-script-meta"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList className="manju-script-meta__tabs">
              <TabsTrigger value="script">剧本原文</TabsTrigger>
              <TabsTrigger value="overview">故事梗概</TabsTrigger>
              <TabsTrigger value="episodes">
                分集
                {project.episodes.length > 0
                  ? ` ${project.episodes.length}`
                  : ""}
              </TabsTrigger>
              <TabsTrigger value="series">连载记忆</TabsTrigger>
            </TabsList>
            <div className="flex flex-wrap gap-2">
              {metaTab === "script" ? (
                <>
                  {!aiOpen ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAiOpen(true)}
                    >
                      <Sparkles className="h-4 w-4" />
                      AI 帮写
                    </Button>
                  ) : null}
                  <ScriptFileImport
                    disabled={analyzing}
                    onText={(text) => void applyImportedText(text)}
                  />
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
                </>
              ) : null}
              {metaTab === "episodes" ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={analyzing}
                  onClick={() => void runEpisodePlan()}
                >
                  {analyzing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  规划分集
                </Button>
              ) : null}
              {metaTab === "series" ? (
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
              ) : null}
            </div>
          </div>

          <TabsContent value="script" className="manju-script-meta__panel">
            <ManjuMdField
              value={project.scriptText}
              onChange={(scriptText) =>
                updateProject(project.id, { scriptText })
              }
              placeholder={`示例：\n\n场景：青石巷口·雨夜\n\n少年：今晚，城门不会为任何人开。\n\n镜头2\n暗色水墨风，镜头缓慢推进巷深。少年握着信笺。`}
              height={420}
              preview="edit"
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
          </TabsContent>

          <TabsContent value="overview" className="manju-script-meta__panel">
            <ManjuMdField
              value={project.overview}
              onChange={(overview) =>
                updateProject(project.id, { overview })
              }
              placeholder="一两段概括剧情、人物关系与基调…"
              height={280}
              preview="edit"
            />
          </TabsContent>

          <TabsContent value="episodes" className="manju-script-meta__panel">
            {project.episodes.length > 0 ? (
              <div className="manju-episode-grid mt-4">
                {project.episodes.map((ep, i) => (
                  <article key={ep.id} className="manju-episode-card">
                    <header className="manju-episode-card__head">
                      <span className="manju-episode-card__index" aria-hidden>
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
                        className="manju-episode-card__title-input"
                        placeholder="分集标题"
                      />
                    </header>
                    <div className="manju-episode-card__body">
                      <label className="manju-episode-card__field">
                        <span className="manju-episode-card__label">钩子</span>
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
                          className="manju-episode-card__input"
                          placeholder="本集结尾钩子（可选）"
                        />
                      </label>
                      <label className="manju-episode-card__field">
                        <span className="manju-episode-card__label">摘要</span>
                        <ManjuMdField
                          value={ep.summary ?? ""}
                          onChange={(summary) =>
                            updateProject(project.id, {
                              episodes: project.episodes.map((item) =>
                                item.id === ep.id
                                  ? { ...item, summary }
                                  : item,
                              ),
                            })
                          }
                          placeholder="本集发生什么…"
                          height={88}
                          hideToolbar
                        />
                      </label>
                      <label className="manju-episode-card__field">
                        <span className="manju-episode-card__label">
                          原文切片
                        </span>
                        <ManjuMdField
                          value={ep.sourceText ?? ""}
                          onChange={(sourceText) =>
                            updateProject(project.id, {
                              episodes: project.episodes.map((item) =>
                                item.id === ep.id
                                  ? { ...item, sourceText }
                                  : item,
                              ),
                            })
                          }
                          placeholder="本集对应的原文片段（规划本集分镜时优先用）"
                          height={140}
                          hideToolbar
                        />
                      </label>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-6 text-center text-sm text-muted-foreground">
                暂无分集
              </p>
            )}
          </TabsContent>

          <TabsContent value="series" className="manju-script-meta__panel">
            <ManjuMdField
              value={series.world}
              onChange={(world) => patchSeries({ ...series, world })}
              placeholder="时代、规则、世界观…"
              height={120}
              hideToolbar
            />
            <div className="mt-4 space-y-3">
              {series.bios.map((bio, index) => (
                <div
                  key={`${bio.name}-${index}`}
                  className="rounded-lg border border-border p-3"
                >
                  <div className="flex items-center gap-2">
                    <Input
                      value={bio.name}
                      className="h-8 text-sm"
                      onChange={(e) => {
                        const bios = series.bios.map((item, i) =>
                          i === index
                            ? { ...item, name: e.target.value }
                            : item,
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
                    <span
                      className={
                        hook.status === "paid"
                          ? "text-muted-foreground line-through"
                          : ""
                      }
                    >
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
            {series.bios.length === 0 && series.hooks.length === 0 ? (
              <p className="mt-4 text-center text-sm text-muted-foreground">
                暂无小传与伏笔
              </p>
            ) : null}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );

  return (
    <div className="manju-script-split">
      {aiOpen ? (
        <aside className="manju-script-split__ai">
          <ScriptAiPanel
            projectId={project.id}
            modelId={project.settings.llmModelId}
            scriptText={project.scriptText}
            onApplyScript={(script, meta) => {
              applyScriptToProject(script, meta);
              setMode("edit");
              setMetaTab("script");
            }}
            onCollapse={() => setAiOpen(false)}
          />
        </aside>
      ) : null}
      <div className="manju-script-split__editor">{editor}</div>
    </div>
  );
}
