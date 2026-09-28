"use client";

import { useCallback, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/shared/lib/api";
import { toast } from "@/shared/lib/toast";
import { confirmDialog } from "@/shared/lib/confirm";
import { useManjuStore } from "../../manju-store";
import { cn } from "@/shared/lib/utils";

type Props = {
  projectId: string;
  className?: string;
  onConfirmed?: () => void;
};

/**
 * Script review gate: edit plan draft → confirm → unlock prompts / video.
 */
export function ScriptReviewGate({
  projectId,
  className,
  onConfirmed,
}: Props) {
  const project = useManjuStore((s) =>
    s.projects.find((p) => p.id === projectId),
  );
  const updateProject = useManjuStore((s) => s.updateProject);
  const loadProject = useManjuStore((s) => s.loadProject);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const content =
    project?.scriptReview?.content ||
    project?.overview ||
    project?.scriptText.slice(0, 4000) ||
    "";
  const confirmed =
    project?.scriptConfirmed === true ||
    project?.scriptReview?.status === "confirmed";

  const saveDraft = useCallback(async () => {
    if (!project) return;
    setSaving(true);
    try {
      await api(`/manju/projects/${projectId}/script-review`, {
        method: "PUT",
        body: { content: project.scriptReview?.content ?? content },
      });
      toast.success("审核稿已保存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }, [content, project, projectId]);

  const confirm = useCallback(async () => {
    if (!project) return;
    const ok = await confirmDialog({
      title: "确认分镜脚本？",
      description:
        "确认后将解锁提示词撰写与视频生成。若已有镜头文案，后续规划可能覆盖文本（媒体尽量保留）。",
      confirmText: "确认脚本",
      cancelText: "取消",
    });
    if (!ok) return;
    setConfirming(true);
    try {
      await api(`/manju/projects/${projectId}/script-review/confirm`, {
        method: "POST",
        body: {},
      });
      updateProject(projectId, {
        scriptConfirmed: true,
        scriptReview: {
          status: "confirmed",
          content: project.scriptReview?.content ?? content,
        },
      });
      await loadProject(projectId);
      toast.success("脚本已确认");
      onConfirmed?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "确认失败");
    } finally {
      setConfirming(false);
    }
  }, [content, loadProject, onConfirmed, project, projectId, updateProject]);

  if (!project) return null;

  if (confirmed) {
    return (
      <div className={cn("manju-script-gate is-confirmed", className)}>
        <ShieldCheck className="size-4 text-emerald-500" />
        <span>脚本已确认，可撰写提示词与生成视频</span>
      </div>
    );
  }

  return (
    <div className={cn("manju-script-gate", className)}>
      <div className="manju-script-gate__head">
        <strong>脚本审核门</strong>
        <span>确认前不可批量写提示词 / 出视频</span>
      </div>
      <Textarea
        className="manju-script-gate__editor min-h-[120px]"
        value={project.scriptReview?.content ?? ""}
        placeholder="在此整理分镜计划稿（可从概览或剧本摘录）…"
        onChange={(e) =>
          updateProject(projectId, {
            scriptReview: {
              status: "draft",
              content: e.target.value,
            },
          })
        }
      />
      <div className="manju-script-gate__actions">
        <Button
          variant="outline"
          size="sm"
          disabled={saving}
          onClick={() => void saveDraft()}
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
          保存审核稿
        </Button>
        <Button size="sm" disabled={confirming} onClick={() => void confirm()}>
          {confirming ? <Loader2 className="size-3.5 animate-spin" /> : null}
          确认脚本并解锁
        </Button>
      </div>
    </div>
  );
}
