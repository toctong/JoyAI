"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ClipboardPaste,
  FileText,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/shared/lib/confirm";
import { toast } from "@/shared/lib/toast";
import { cn } from "@/shared/lib/utils";
import { useManjuStore } from "../manju-store";
import { submitManjuAnalyzeJob } from "../manju-api";
import { sanitizeScriptBody } from "../lib/sanitize-script-text";
import { ManjuTextField } from "../manju-text-field";
import { ScriptFileImport } from "../script-file-import";
import { ScriptAiPanel } from "../script-ai/script-ai-panel";
import {
  ManjuParseScriptDialog,
  type ManjuAnalyzeMode,
} from "../studio/manju-parse-script-dialog";
import {
  ManjuAssetFallbackDialog,
  MANJU_ASSET_FALLBACK_EVENT,
} from "../studio/manju-asset-fallback-dialog";
import { ManjuReviewButton } from "../studio/manju-review-button";
import { submitWorkflowSkill } from "../lib/workflow-skill";
import {
  type ManjuEpisodeDraft,
  type ManjuProjectDraft,
} from "../manju-types";

type ScriptMode = "choose" | "edit";

export function ScriptStep({ project }: { project: ManjuProjectDraft }) {
  const updateProject = useManjuStore((s) => s.updateProject);
  const flushSave = useManjuStore((s) => s.flushSave);
  const setAnalyzing = useManjuStore((s) => s.setAnalyzing);
  const analyzing = useManjuStore((s) => Boolean(s.analyzingIds[project.id]));
  const [mode, setMode] = useState<ScriptMode>(
    project.scriptText.trim() ? "edit" : "choose",
  );
  const [aiOpen, setAiOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [parseOpen, setParseOpen] = useState(false);
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const tidiedRef = useRef(false);

  useEffect(() => {
    const onFallback = (ev: Event) => {
      const detail = (ev as CustomEvent<{ projectId?: string }>).detail;
      if (detail?.projectId === project.id) setFallbackOpen(true);
    };
    window.addEventListener(MANJU_ASSET_FALLBACK_EVENT, onFallback);
    return () =>
      window.removeEventListener(MANJU_ASSET_FALLBACK_EVENT, onFallback);
  }, [project.id]);

  const tags = project.tags ?? [];
  const charCount = project.scriptText.length;

  const applyScriptToProject = (
    raw: string,
    meta?: { hook?: string; tags?: string[] },
  ) => {
    const { script, hook: extracted } = sanitizeScriptBody(raw);
    const hook = (meta?.hook?.trim() || extracted || "").trim();
    const nextTags = Array.isArray(meta?.tags)
      ? meta.tags
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 8)
      : [];
    const patch: {
      scriptText: string;
      tags?: string[];
      episodes?: ManjuEpisodeDraft[];
    } = { scriptText: script };

    if (nextTags.length > 0) {
      patch.tags = nextTags;
    }

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

  const runAiAnalyze = async (analyzeMode: ManjuAnalyzeMode) => {
    if (project.scriptText.trim().length < 20) {
      toast.error("请先粘贴更完整的剧本再分析");
      return;
    }
    try {
      setAnalyzing(project.id, true);
      setParseOpen(false);
      await flushSave(project.id);
      const job = await submitManjuAnalyzeJob({
        projectId: project.id,
        scriptText: project.scriptText,
        purpose: "analyze_assets",
        modelId: project.settings.llmModelId,
        analyzeMode,
      });
      updateProject(project.id, { lastAnalyzeJobId: job.id });
      toast.message("AI 正在解析剧本（题材标签、梗概、角色/场景/道具）…");
    } catch (e) {
      setAnalyzing(project.id, false);
      toast.error(e instanceof Error ? e.message : "提交分析失败");
    }
  };

  const openParseDialog = () => {
    if (project.scriptText.trim().length < 20) {
      toast.error("请先粘贴更完整的剧本再分析");
      return;
    }
    setParseOpen(true);
  };

  const runNovelAnalyze = async () => {
    if (project.scriptText.trim().length < 80) {
      toast.error("长文拆集需要更完整的正文（建议数百字以上）");
      return;
    }
    const ok = await confirmDialog({
      title: "长文拆集？",
      description:
        "生成梗概、题材标签与分集草案。不改资产与镜头；适合小说/长剧本先切集再解析资产。",
      confirmText: "开始拆集",
      cancelText: "取消",
    });
    if (!ok) return;
    try {
      setAnalyzing(project.id, true);
      await flushSave(project.id);
      const job = await submitWorkflowSkill({
        project,
        skill: "novel_analyze",
      });
      updateProject(project.id, { lastAnalyzeJobId: job.id });
      toast.message("AI 正在长文拆集…");
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
          ? "导入会替换剧本编辑区。已有分镜/资产不会自动清空，如需更新请随后重新解析或规划分镜。"
          : "导入会替换剧本编辑区内容，不会自动清分镜或资产。",
        confirmText: "覆盖导入",
        cancelText: "取消",
        destructive: true,
      });
      if (!ok) return;
    }
    updateProject(project.id, { scriptText: text });
    setMode("edit");
    if (project.shots.length > 0) {
      toast.message("原文已换，建议重新规划分镜");
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
    <div className="manju-info">
      <ManjuParseScriptDialog
        open={parseOpen}
        onOpenChange={setParseOpen}
        projectTitle={project.title}
        busy={analyzing}
        onConfirm={(mode) => void runAiAnalyze(mode)}
      />
      <ManjuAssetFallbackDialog
        projectId={project.id}
        open={fallbackOpen}
        onOpenChange={setFallbackOpen}
      />

      <section className="manju-info-card">
        <div className="manju-info-card__head manju-info-card__head--toolbar">
          <button
            type="button"
            className="manju-info-card__toggle"
            onClick={() => setPreviewOpen((v) => !v)}
            aria-expanded={previewOpen}
          >
            <h2 className="manju-info-card__title">剧本预览</h2>
            <ChevronDown
              className={cn(
                "manju-info-card__chevron",
                previewOpen && "is-open",
              )}
              aria-hidden
            />
          </button>
          <div className="manju-studio__page-actions">
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
              variant="outline"
              size="sm"
              onClick={openParseDialog}
              disabled={analyzing}
            >
              {analyzing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {analyzing ? "解析中…" : "解析剧本"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={analyzing}
              onClick={() => setFallbackOpen(true)}
              title="AI 解析失败时，可手动从剧本抽角色或粘贴名单"
            >
              手动登记角色
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={analyzing}
              onClick={() => void runNovelAnalyze()}
            >
              长文拆集
            </Button>
            <ManjuReviewButton projectId={project.id} />
          </div>
        </div>
        {previewOpen ? (
          <div className="manju-info-card__body">
            <div className="manju-info-field">
              <span className="manju-info-field__label">题材标签</span>
              <div className="manju-info-tags">
                {tags.length > 0 ? (
                  tags.map((tag) => (
                    <span key={tag} className="manju-info-tag manju-info-tag--readonly">
                      {tag}
                    </span>
                  ))
                ) : (
                  <span className="manju-info-tags__empty">
                    AI 帮写或解析剧本后自动生成
                  </span>
                )}
              </div>
            </div>
            <div className="manju-info-field">
              <span className="manju-info-field__label">剧本梗概</span>
              {project.overview.trim() ? (
                <p className="manju-info-field__readonly">{project.overview}</p>
              ) : (
                <span className="manju-info-tags__empty">
                  解析剧本后由 AI 自动生成
                </span>
              )}
            </div>
          </div>
        ) : null}
      </section>

      <section className="manju-info-card manju-info-card--content">
        <div className="manju-info-card__head manju-info-card__head--static">
          <h2 className="manju-info-card__title">剧本内容</h2>
          <span className="manju-info-card__meta">
            原始剧本内容（{charCount} 字符）
          </span>
        </div>
        <div className="manju-info-card__body manju-info-script">
          <ManjuTextField
            variant="script"
            value={project.scriptText}
            onChange={(scriptText) =>
              updateProject(project.id, { scriptText })
            }
            placeholder={`示例：\n\n场景：青石巷口·雨夜\n\n少年：今晚，城门不会为任何人开。\n\n镜头2\n暗色水墨风，镜头缓慢推进巷深。少年握着信笺。`}
            minHeight={480}
          />
        </div>
      </section>
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
            }}
            onCollapse={() => setAiOpen(false)}
          />
        </aside>
      ) : null}
      <div className="manju-script-split__editor">{editor}</div>
    </div>
  );
}
