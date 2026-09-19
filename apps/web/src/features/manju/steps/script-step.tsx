"use client";

import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/shared/lib/confirm";
import { toast } from "@/shared/lib/toast";
import { useManjuStore } from "../manju-store";
import { submitManjuAnalyzeJob } from "../manju-api";
import { ManjuMdField } from "../manju-md-field";
import {
  extractAssetsFromScript,
  parseScriptToShots,
  type ManjuProjectDraft,
} from "../manju-types";

export function ScriptStep({ project }: { project: ManjuProjectDraft }) {
  const updateProject = useManjuStore((s) => s.updateProject);
  const setShots = useManjuStore((s) => s.setShots);
  const mergeExtractedAssets = useManjuStore((s) => s.mergeExtractedAssets);
  const autoLinkShotAssets = useManjuStore((s) => s.autoLinkShotAssets);
  const flushSave = useManjuStore((s) => s.flushSave);
  const setAnalyzing = useManjuStore((s) => s.setAnalyzing);
  const analyzing = useManjuStore((s) => Boolean(s.analyzingIds[project.id]));

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

  return (
    <div className="manju-panel">
      <div className="manju-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="manju-card__title">剧本 / 小说原文</div>
            <p className="manju-card__desc">
              粘贴成品剧本或小说。「AI 分析」只登记角色、场景、道具和分集，分镜要另跑规划。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
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
        {project.episodes.length > 0 ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {project.episodes.map((ep, i) => (
              <div
                key={ep.id}
                className="rounded-lg border border-border bg-muted/40 px-3 py-2"
              >
                <div className="text-xs font-semibold">
                  {String(i + 1).padStart(2, "0")} {ep.title}
                </div>
                {ep.summary ? (
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-3">
                    {ep.summary}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
